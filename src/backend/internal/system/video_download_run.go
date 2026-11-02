package system

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	owner       string
	directory   string
	concurrency int
	items       []videoDownloadItem
	running     bool
	cancel      context.CancelFunc
	finishedAt  time.Time
	done        chan struct{}
}

type videoDownloadSnapshot struct {
	JobID     string              `json:"jobId"`
	Directory string              `json:"directory"`
	Running   bool                `json:"running"`
	Items     []videoDownloadItem `json:"items"`
}

func newVideoDownloadJob(directory string, concurrency int, items []videoDownloadItem) *videoDownloadJob {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	copied := make([]videoDownloadItem, len(items))
	copy(copied, items)
	return &videoDownloadJob{id: hex.EncodeToString(buf[:]), directory: directory, concurrency: concurrency, items: copied, finishedAt: time.Now(), done: make(chan struct{})}
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
	defer close(job.done)
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
	job.finishedAt = time.Now()
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
		return errors.New("网络连接失败")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return errors.New(videoDownloadFailure(response.StatusCode, response.ContentLength, body))
	}
	if message := videoDownloadFailure(response.StatusCode, response.ContentLength, nil); message != "" {
		return errors.New(message)
	}
	if response.ContentLength > maxVideoProxyBytes {
		return errors.New("视频超过 200MB")
	}
	return writeVideoDownload(ctx, dir, dest, response.Body)
}

// Exclusive creation and linking never replace an existing file or follow a
// destination symlink. Root confines all writes even if a parent is renamed.
func writeVideoDownload(ctx context.Context, dir, dest string, body io.Reader) error {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return errors.New("无法写入保存文件夹")
	}
	defer root.Close()
	nonce := make([]byte, 16)
	if _, err = rand.Read(nonce); err != nil {
		return err
	}
	partial := ".beike-download-" + hex.EncodeToString(nonce) + ".part"
	file, err := root.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return errors.New("无法写入保存文件夹")
	}
	defer root.Remove(partial)
	written, copyErr := copyCapped(file, body, maxVideoProxyBytes)
	closeErr := file.Close()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if copyErr != nil || closeErr != nil || written == 0 {
		if errors.Is(copyErr, errVideoTooLarge) {
			return errors.New("视频超过 200MB")
		}
		if written == 0 && copyErr == nil {
			return errors.New("视频内容为空")
		}
		return errors.New("视频下载失败")
	}
	if err = root.Link(partial, filepath.Base(dest)); err != nil {
		if errors.Is(err, os.ErrExist) {
			return errors.New("同名文件已存在，请更换文件名或保存文件夹")
		}
		return errors.New("无法安全保存视频，保存文件夹需支持文件硬链接")
	}
	return nil
}

func videoDownloadFailure(status int, contentLength int64, body []byte) string {
	if status >= 200 && status < 300 {
		if contentLength == 0 {
			return "视频内容为空"
		}
		return ""
	}
	text := string(body)
	switch {
	case strings.Contains(text, "<Code>NoSuchKey</Code>") || status == http.StatusNotFound:
		return "OSS 上没有这个文件"
	case strings.Contains(text, "<Code>AccessDenied</Code>") || status == http.StatusForbidden:
		return "没有下载权限"
	case status == http.StatusTooManyRequests || status == http.StatusServiceUnavailable:
		return "对方繁忙，请稍后重试"
	default:
		return "视频下载失败"
	}
}
