package system

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/network"
)

var videoFileSaver = saveVideoFile

type videoDownloadItem struct {
	Filename string `json:"filename"`
	URL      string `json:"url"`
	Status   string `json:"status"`
	Error    string `json:"error,omitempty"`
}

type videoDownloadJob struct {
	mu          sync.Mutex
	id          string
	directory   string
	concurrency int
	items       []videoDownloadItem
	running     bool
	cancel      context.CancelFunc
}

type videoDownloadSnapshot struct {
	JobID     string              `json:"jobId"`
	Directory string              `json:"directory"`
	Running   bool                `json:"running"`
	Items     []videoDownloadItem `json:"items"`
}

var videoDownloadJobs = struct {
	sync.Mutex
	items map[string]*videoDownloadJob
}{items: map[string]*videoDownloadJob{}}

func newVideoDownloadJob(directory string, concurrency int, items []videoDownloadItem) *videoDownloadJob {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	copied := make([]videoDownloadItem, len(items))
	copy(copied, items)
	return &videoDownloadJob{id: hex.EncodeToString(buf[:]), directory: directory, concurrency: concurrency, items: copied}
}

func storeVideoDownloadJob(job *videoDownloadJob) {
	videoDownloadJobs.Lock()
	videoDownloadJobs.items[job.id] = job
	videoDownloadJobs.Unlock()
}

func lookupVideoDownloadJob(id string) (*videoDownloadJob, bool) {
	videoDownloadJobs.Lock()
	job, ok := videoDownloadJobs.items[id]
	videoDownloadJobs.Unlock()
	return job, ok
}

func (job *videoDownloadJob) snapshot() videoDownloadSnapshot {
	job.mu.Lock()
	defer job.mu.Unlock()
	items := make([]videoDownloadItem, len(job.items))
	copy(items, job.items)
	return videoDownloadSnapshot{JobID: job.id, Directory: job.directory, Running: job.running, Items: items}
}

func (job *videoDownloadJob) setStatus(index int, status, message string) {
	job.mu.Lock()
	job.items[index].Status = status
	job.items[index].Error = message
	job.mu.Unlock()
}

func (job *videoDownloadJob) run(ctx context.Context, cfg config.Config) {
	indexes := make(chan int, len(job.items))
	for index := range job.items {
		indexes <- index
	}
	close(indexes)
	var group sync.WaitGroup
	workers := job.concurrency
	if workers > len(job.items) {
		workers = len(job.items)
	}
	for range workers {
		group.Add(1)
		go func() {
			defer group.Done()
			for index := range indexes {
				if ctx.Err() != nil {
					return
				}
				job.mu.Lock()
				filename, rawURL := job.items[index].Filename, job.items[index].URL
				job.items[index].Status = "running"
				job.items[index].Error = ""
				job.mu.Unlock()
				err := videoFileSaver(ctx, cfg, job.directory, filename, rawURL)
				if ctx.Err() != nil {
					job.setStatus(index, "pending", "")
					return
				}
				if err != nil {
					job.setStatus(index, "failed", err.Error())
					continue
				}
				job.setStatus(index, "success", "")
			}
		}()
	}
	group.Wait()
	job.mu.Lock()
	job.running = false
	job.mu.Unlock()
}

func saveVideoFile(ctx context.Context, cfg config.Config, dir, name, rawURL string) error {
	dest, err := safeVideoDestination(dir, name)
	if err != nil {
		return err
	}
	target, status, message := normalizeVideoProxyURL(cfg, rawURL)
	if status != 0 {
		return errors.New(message)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return errors.New("不支持的地址")
	}
	for key, value := range upstreamHeaders(target, true, "") {
		request.Header.Set(key, value)
	}
	response, err := network.SafeClient().Do(request)
	if err != nil {
		if response != nil {
			response.Body.Close()
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.New("视频下载失败")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 || response.ContentLength == 0 {
		return errors.New("视频下载失败")
	}
	if response.ContentLength > maxVideoProxyBytes {
		return errors.New("视频超过 200MB")
	}
	partial := dest + ".part"
	file, err := os.OpenFile(partial, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return errors.New("无法写入保存文件夹")
	}
	written, copyErr := copyCapped(file, response.Body, maxVideoProxyBytes)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || written == 0 {
		_ = os.Remove(partial)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if errors.Is(copyErr, errVideoTooLarge) {
			return errors.New("视频超过 200MB")
		}
		return errors.New("视频下载失败")
	}
	_ = os.Remove(dest)
	if err = os.Rename(partial, dest); err != nil {
		_ = os.Remove(partial)
		return errors.New("无法写入保存文件夹")
	}
	return nil
}
