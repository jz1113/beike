package generate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type depthReceipt struct {
	Fingerprint string `json:"fingerprint"`
	Kind        string `json:"kind"`
	Status      int    `json:"status,omitempty"`
	Body        string `json:"body,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
}

var depthInflight sync.Map

func guardDepth(cfg config.Config, r *http.Request, kind, operation, fingerprint string, submit func() (int, map[string]any)) (int, map[string]any) {
	operation = strings.TrimSpace(operation)
	if operation == "" {
		return submit()
	}
	if len(operation) > 256 {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识不合法", "submissionRejected": true}
	}
	key := depthReceiptKey(httpx.WorkspaceFrom(r), kind, operation)
	if existing, ok := depthInflight.Load(key); ok {
		result := <-existing.(chan depthResult)
		if result.fingerprint != fingerprint {
			return http.StatusConflict, map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}
		}
		return result.status, result.body
	}
	file, err := depthReceiptFile(cfg, httpx.WorkspaceFrom(r), key)
	if err != nil {
		return http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "error": "深度任务提交记录暂时无法核对，请查询原任务"}
	}
	if saved, err := readDepthReceipt(file); err == nil {
		if saved.Fingerprint != fingerprint {
			return http.StatusConflict, map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}
		}
		if saved.Status != 0 && saved.Body != "" {
			return decodeDepthBody(saved.Status, saved.Body)
		}
		return http.StatusConflict, map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}
	}
	claim := depthReceipt{Fingerprint: fingerprint, Kind: kind, CreatedAt: time.Now().UnixMilli()}
	if err := writeDepthReceiptExclusive(file, claim); err != nil {
		if errors.Is(err, os.ErrExist) {
			return http.StatusConflict, map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}
		}
		return http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "error": "深度任务提交记录暂时无法核对，请查询原任务"}
	}
	ch := make(chan depthResult, 1)
	depthInflight.Store(key, ch)
	defer depthInflight.Delete(key)
	status, body := submit()
	raw, _ := json.Marshal(body)
	claim.Status = status
	claim.Body = string(raw)
	_ = writeDepthReceipt(file, claim)
	result := depthResult{status: status, body: body, fingerprint: fingerprint}
	ch <- result
	return status, body
}

type depthResult struct {
	status      int
	body        map[string]any
	fingerprint string
}

func readDepthSubmission(cfg config.Config, r *http.Request, kind string) (int, map[string]any) {
	key := strings.TrimSpace(r.URL.Query().Get("taskKey"))
	if key == "" || len(key) > 256 {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"}
	}
	file, err := depthReceiptFile(cfg, httpx.WorkspaceFrom(r), depthReceiptKey(httpx.WorkspaceFrom(r), kind, key))
	if err != nil {
		return http.StatusServiceUnavailable, map[string]any{"success": false, "retryable": true, "error": "原深度任务提交记录暂时无法查询"}
	}
	saved, err := readDepthReceipt(file)
	if err != nil {
		return http.StatusOK, map[string]any{"status": "QUERY_FAILED", "retryable": true, "error": "原深度任务提交结果待核对；不会自动重新提交"}
	}
	if saved.Kind != "" && saved.Kind != kind || saved.Status == 0 || saved.Body == "" {
		return http.StatusOK, map[string]any{"status": "QUERY_FAILED", "retryable": true, "error": "原深度任务提交结果待核对；不会自动重新提交"}
	}
	return decodeDepthBody(saved.Status, saved.Body)
}

func depthReceiptKey(workspace, kind, operation string) string {
	sum := sha256.Sum256([]byte(workspace + "\x00" + kind + "\x00local-depth\x00" + operation))
	return hex.EncodeToString(sum[:])
}

func depthReceiptFile(cfg config.Config, workspace, key string) (string, error) {
	root := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR"))
	if root == "" {
		if file := cfg.SQLiteFile(); file != "" {
			root = filepath.Dir(file)
		} else {
			root = filepath.Join(cfg.Root, ".local")
		}
	}
	dir := filepath.Join(root, "submission-receipts", workspace)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, key+".json"), nil
}

func readDepthReceipt(file string) (depthReceipt, error) {
	body, err := os.ReadFile(file)
	if err != nil {
		return depthReceipt{}, err
	}
	var saved depthReceipt
	if err := json.Unmarshal(body, &saved); err != nil {
		return depthReceipt{}, err
	}
	return saved, nil
}

func writeDepthReceiptExclusive(file string, receipt depthReceipt) error {
	body, err := json.Marshal(receipt)
	if err != nil {
		return err
	}
	handle, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer handle.Close()
	_, err = handle.Write(body)
	return err
}

func writeDepthReceipt(file string, receipt depthReceipt) error {
	body, err := json.Marshal(receipt)
	if err != nil {
		return err
	}
	temp := file + ".tmp"
	if err := os.WriteFile(temp, body, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, file)
}

func decodeDepthBody(status int, raw string) (int, map[string]any) {
	var body map[string]any
	if json.Unmarshal([]byte(raw), &body) != nil {
		return status, map[string]any{"success": false, "error": raw}
	}
	return status, body
}

func depthFingerprint(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func depthInputDigest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
