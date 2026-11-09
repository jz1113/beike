package generate

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

const jimengReqKey = "jimeng_i2i_seed3_tilesr_cvtob"
const jimengHost = "visual.volcengineapi.com"

func jimengMAC(secret []byte, value string) []byte {
	digest := hmac.New(sha256.New, secret)
	digest.Write([]byte(value))
	return digest.Sum(nil)
}

func jimengHexHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func jimengCall(ctx context.Context, client *http.Client, action, access, secret string, payload map[string]any, now time.Time) (map[string]any, int) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0
	}
	query := "Action=" + action + "&Version=2022-08-31"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+jimengHost+"/?"+query, bytes.NewReader(body))
	if err != nil {
		return nil, 0
	}
	stamp := now.UTC().Format("20060102T150405Z")
	day := stamp[:8]
	bodyHash := jimengHexHash(body)
	const signedHeaders = "content-type;host;x-content-sha256;x-date"
	headers := "content-type:application/json\nhost:" + jimengHost + "\nx-content-sha256:" + bodyHash + "\nx-date:" + stamp + "\n"
	canonical := "POST\n/\n" + query + "\n" + headers + "\n" + signedHeaders + "\n" + bodyHash
	scope := day + "/cn-north-1/cv/request"
	toSign := "HMAC-SHA256\n" + stamp + "\n" + scope + "\n" + jimengHexHash([]byte(canonical))
	key := jimengMAC(jimengMAC(jimengMAC(jimengMAC([]byte(secret), day), "cn-north-1"), "cv"), "request")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Date", stamp)
	request.Header.Set("X-Content-Sha256", bodyHash)
	request.Header.Set("Authorization", "HMAC-SHA256 Credential="+access+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+hex.EncodeToString(jimengMAC(key, toSign)))
	response, err := client.Do(request)
	if err != nil {
		return nil, 0
	}
	defer response.Body.Close()
	var result map[string]any
	if json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&result) != nil {
		return nil, response.StatusCode
	}
	return result, response.StatusCode
}

func jimengCredentials() (string, string) {
	return strings.TrimSpace(os.Getenv("JIMENG_ACCESS_KEY_ID")), strings.TrimSpace(os.Getenv("JIMENG_SECRET_ACCESS_KEY"))
}

func submitJimeng(w http.ResponseWriter, r *http.Request, client *http.Client, input specializedInput) (string, int, bool) {
	access, secret := jimengCredentials()
	if access == "" || secret == "" {
		specializedError(w, 503, "服务器尚未配置即梦智能超清 AK/SK", true)
		return "", 0, false
	}
	data, ext := specializedMedia(input.Image, true)
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (ext != "png" && ext != "jpg") || len(data) > 4700000 || config.Width > 4096 || config.Height > 4096 ||
		config.Width > config.Height*3 || config.Height > config.Width*3 {
		specializedError(w, 400, "即梦要求 JPEG/PNG、最大 4.7 MB、最大 4096×4096，且宽高比在 1:3–3:1", true)
		return "", 0, false
	}
	resolution, detail := input.Resolution, 50
	if input.Detail != nil {
		detail = *input.Detail
	}
	if resolution == "" {
		resolution = "4k"
	}
	if (resolution != "4k" && resolution != "8k") || detail < 0 || detail > 100 {
		specializedError(w, 400, "请选择 4K 或 8K，细节程度须在 0–100", true)
		return "", 0, false
	}
	result, code := jimengCall(r.Context(), client, "CVSync2AsyncSubmitTask", access, secret, map[string]any{
		"req_key": jimengReqKey, "resolution": resolution, "scale": detail,
		"binary_data_base64": []string{base64.StdEncoding.EncodeToString(data)},
	}, time.Now())
	if status, ok := result["code"].(float64); code == 200 && ok && status != 10000 {
		specializedError(w, 422, "即梦拒绝任务，请检查账号权限和图片规格", true)
		return "", code, false
	}
	info, _ := result["data"].(map[string]any)
	return specializedString(info, "task_id"), code, true
}

func queryJimeng(w http.ResponseWriter, r *http.Request, client *http.Client, task string) {
	access, secret := jimengCredentials()
	if access == "" || secret == "" {
		specializedError(w, 503, "即梦服务配置不可用", false)
		return
	}
	result, code := jimengCall(r.Context(), client, "CVSync2AsyncGetResult", access, secret, map[string]any{
		"req_key": jimengReqKey, "task_id": task, "req_json": `{"return_url":true}`,
	}, time.Now())
	if code != 200 || result["code"] != float64(10000) {
		specializedError(w, 502, "即梦查询暂不可用，可继续查询原任务", false)
		return
	}
	info, _ := result["data"].(map[string]any)
	response := map[string]any{"success": true, "taskId": task, "status": "pending"}
	switch info["status"] {
	case "done":
		urls, _ := info["image_urls"].([]any)
		if len(urls) == 0 || specializedHTTPS(urls[0]) == "" {
			specializedError(w, 502, "即梦任务完成但未返回可用图片链接", false)
			return
		}
		response["status"], response["imageUrl"] = "done", specializedHTTPS(urls[0])
	case "not_found", "expired", "failed":
		response["status"] = "failed"
	}
	httpx.WriteJSON(w, 200, response)
}
