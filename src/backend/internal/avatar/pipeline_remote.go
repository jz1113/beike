package avatar

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func publishPublicMedia(ctx context.Context, workspace, name, contentType string, data []byte) (string, error) {
	obj := storage.ResolveObjectConfig(nil)
	if obj == nil {
		return "", errors.New("唇形模型需要公网素材地址，请先配置云存储")
	}
	if strings.TrimSpace(workspace) == "" {
		workspace = "local"
	}
	prefix := strings.Trim(obj.ApiPrefix, "/")
	key := prefix + "/" + workspace + "/avatar/" + name
	key = strings.TrimPrefix(key, "/")
	if err := storage.Objects.Put(ctx, *obj, key, contentType, data); err != nil {
		return "", errors.New("上传云存储失败")
	}
	return storage.PermanentObjectURL(*obj, key), nil
}

func publicAvatarURL(ctx context.Context, workspace, taskID, raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "https://") && !privateMediaHost(raw) {
		return raw, nil
	}
	body, err := readAvatarMedia(ctx, raw)
	if err != nil {
		return "", err
	}
	return publishBytes(ctx, workspace, taskID+"_avatar"+mediaExt(raw), http.DetectContentType(body), body)
}

func readAvatarMedia(ctx context.Context, raw string) ([]byte, error) {
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
		if err != nil {
			return nil, errors.New("形象视频地址无效")
		}
		resp, err := generate.ModelHTTP().Do(req)
		if err != nil {
			return nil, errors.New("形象视频下载失败")
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, errors.New("形象视频下载失败")
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 80<<20))
		if err != nil || len(body) == 0 {
			return nil, errors.New("形象视频下载失败")
		}
		return body, nil
	}
	rel := strings.TrimPrefix(raw, "/storage/")
	path := storage.SafeWithin(storage.ResolveRoot(), strings.TrimPrefix(rel, "/"))
	if path == "" {
		return nil, errors.New("形象视频不在存储目录内")
	}
	body, err := os.ReadFile(path)
	if err != nil || len(body) == 0 {
		return nil, errors.New("形象视频读取失败")
	}
	return body, nil
}

const presetMediaMissing = "预设素材不在本地存储中，暂不可用"

func presetMediaReason(kind int, raw string) string {
	if kind != 0 || !localMediaMissing(raw) {
		return ""
	}
	return presetMediaMissing
}

func localMediaMissing(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return false
	}
	rel := strings.TrimPrefix(strings.TrimPrefix(raw, "/storage/"), "/")
	return storage.StoredFile(rel) == ""
}

func annotateCharacters(items []Character) []Character {
	for i := range items {
		if reason := presetMediaReason(items[i].Type, items[i].VideoURL); reason != "" {
			items[i].Status = 2
			items[i].StatusMsg = reason
		}
	}
	return items
}

func annotateVoices(items []Voice) []Voice {
	for i := range items {
		if reason := presetMediaReason(items[i].Type, items[i].AudioURL); reason != "" {
			items[i].Status = 2
			items[i].StatusMsg = reason
		}
	}
	return items
}

func privateMediaHost(raw string) bool {
	host := raw
	if i := strings.Index(raw, "://"); i >= 0 {
		host = raw[i+3:]
	}
	if i := strings.IndexAny(host, "/?#"); i >= 0 {
		host = host[:i]
	}
	host = strings.ToLower(strings.Split(host, ":")[0])
	return host == "" || host == "localhost" || host == "127.0.0.1" || host == "::1" || network.PrivateIP(host)
}

func mediaExt(raw string) string {
	path := strings.Split(raw, "?")[0]
	if i := strings.LastIndex(path, "."); i >= 0 && len(path)-i <= 5 {
		return path[i:]
	}
	return ".mp4"
}

func submitLipsyncTask(ctx context.Context, creds PipelineCreds, avatarURL, audioURL, ratio string) (string, error) {
	spec, ok := ClassifyDriver(creds.LipsyncModel)
	if !ok {
		return "", errors.New("所选模型不是对口型驱动模型")
	}
	image := creds.DriveMode == "photo" || mediaIsImage(avatarURL)
	if spec.Input == InputImage && !image {
		return "", errors.New("该驱动模型需要照片形象")
	}
	if spec.Input == InputVideo && image {
		return "", errors.New("该驱动模型需要对口型视频")
	}
	_, driverKey := creds.DriverRoute()
	payload, _ := json.Marshal(driverPayload(spec, creds.LipsyncModel, avatarURL, audioURL, ratio, image))
	headers := map[string]string{"Content-Type": "application/json"}
	if spec.Family == FamilyWanx {
		headers["X-DashScope-Async"] = "enable"
	}
	result := gateway.SubmitAvatar(ctx, gateway.SubmitCommand{
		Endpoints:   lipsyncSubmitEndpoints(creds),
		APIKey:      driverKey,
		PayloadJSON: string(payload),
		Headers:     headers,
		Client:      generate.ModelHTTP(),
		ReadTaskID:  readTaskID,
	})
	if result.Outcome == gateway.Accepted && result.TaskID != "" {
		return result.TaskID, nil
	}
	if strings.TrimSpace(result.Error) == "" {
		return "", errors.New("唇形任务提交失败")
	}
	return "", errors.New(result.Error)
}

func pollLipsyncTask(ctx context.Context, creds PipelineCreds, taskID string) (string, error) {
	endpoints := lipsyncPollEndpoints(creds, taskID)
	_, driverKey := creds.DriverRoute()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		for _, endpoint := range endpoints {
			status, raw, err := generate.PostModel(ctx, http.MethodGet, endpoint, driverKey, nil, 20*time.Second)
			if err != nil || status < 200 || status >= 300 {
				continue
			}
			url, failed, message := interpretLipsyncPoll(raw)
			if failed {
				return "", errors.New(message)
			}
			if url != "" {
				return url, nil
			}
		}
		select {
		case <-ctx.Done():
			return "", errors.New("唇形同步超时")
		case <-ticker.C:
		}
	}
}

func interpretLipsyncPoll(raw []byte) (string, bool, string) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return "", false, ""
	}
	for _, key := range []string{"output", "data"} {
		nested, ok := data[key].(map[string]any)
		if !ok {
			continue
		}
		if url, failed, message := interpretLipsyncMap(nested); url != "" || failed {
			return url, failed, message
		}
	}
	return interpretLipsyncMap(data)
}

func interpretLipsyncMap(data map[string]any) (string, bool, string) {
	state := strings.ToUpper(firstString(data, "task_status", "status", "state"))
	url := firstString(data, "resultVideoUrl", "result_video_url", "video_url", "videoUrl", "url")
	if output, ok := data["output"].(map[string]any); ok && url == "" {
		url = firstString(output, "video_url", "url", "videoUrl")
	}
	switch state {
	case "SUCCESS", "SUCCEEDED", "COMPLETED", "DONE":
		if url == "" {
			return "", true, "唇形任务完成但没有视频地址"
		}
		return url, false, ""
	case "FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED":
		message := firstString(data, "error", "message", "failReason")
		if message == "" {
			message = "唇形同步失败"
		}
		return "", true, message
	default:
		return "", false, ""
	}
}

func firstString(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := data[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func readTaskID(data map[string]any) string {
	if id := firstString(data, "taskId", "task_id", "id"); id != "" {
		return id
	}
	for _, key := range []string{"output", "data"} {
		nested, ok := data[key].(map[string]any)
		if !ok {
			continue
		}
		if id := firstString(nested, "taskId", "task_id", "id"); id != "" {
			return id
		}
	}
	return ""
}

func lipsyncSubmitEndpoints(creds PipelineCreds) []string {
	base, _ := creds.DriverRoute()
	if raw := strings.TrimSpace(os.Getenv("AVATAR_LIPSYNC_SUBMIT_URLS")); raw != "" {
		return expandAvatarEndpoints(raw, base, "")
	}
	spec, _ := ClassifyDriver(creds.LipsyncModel)
	root := strings.TrimRight(base, "/")
	var out []string
	for _, path := range driverSubmitPaths(spec.Family) {
		out = append(out, root+path)
	}
	return out
}

func lipsyncPollEndpoints(creds PipelineCreds, taskID string) []string {
	base, _ := creds.DriverRoute()
	if raw := strings.TrimSpace(os.Getenv("AVATAR_LIPSYNC_POLL_URLS")); raw != "" {
		return expandAvatarEndpoints(raw, base, taskID)
	}
	spec, _ := ClassifyDriver(creds.LipsyncModel)
	root := strings.TrimRight(base, "/")
	var out []string
	for _, path := range driverPollPaths(spec.Family, taskID) {
		out = append(out, root+path)
	}
	return out
}

func expandAvatarEndpoints(raw, base, taskID string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		part = strings.ReplaceAll(part, "{base}", strings.TrimRight(base, "/"))
		part = strings.ReplaceAll(part, "{taskId}", taskID)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
