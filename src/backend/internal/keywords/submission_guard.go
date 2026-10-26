package keywords

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type guardedResult struct {
	status int
	body   map[string]any
	header http.Header
}

type submissionFlight struct {
	done chan struct{}
	resp guardedResult
}

var submissionFlights sync.Map

func guardKeywordSubmission(r *http.Request, workspace, baseURL, apiKey string, body map[string]any, submit func() (int, map[string]any)) guardedResult {
	input := cloneJSONMap(body)
	delete(input, "clientTaskId")
	delete(input, "customApiKey")
	legacy := digest(canonicalValue(input))
	input["customBaseUrl"] = baseURL
	fingerprint := digest(canonicalValue(input))
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation = newSubmissionID()
	}
	if len(operation) > 256 {
		return guardedResult{status: http.StatusBadRequest, body: map[string]any{"success": false, "error": "任务标识不合法"}}
	}
	attemptID := strings.TrimSpace(r.Header.Get("x-submission-attempt-id"))
	if len(attemptID) > 128 {
		return guardedResult{status: http.StatusBadRequest, body: map[string]any{"success": false, "error": "请求尝试标识不合法"}}
	}
	scope := digest("keyword-review\x00" + baseURL + "\x00" + apiKey)
	key := digest(workspace + "\x00" + scope + "\x00" + operation)
	if existing, loaded := submissionFlights.Load(key); loaded {
		flight := existing.(*submissionFlight)
		<-flight.done
		return replayGuarded(flight.resp, fingerprint)
	}
	flight := &submissionFlight{done: make(chan struct{})}
	actual, loaded := submissionFlights.LoadOrStore(key, flight)
	if loaded {
		flight = actual.(*submissionFlight)
		<-flight.done
		return replayGuarded(flight.resp, fingerprint)
	}
	defer func() {
		close(flight.done)
		submissionFlights.Delete(key)
	}()
	dir := filepath.Join(receiptsRoot(), workspace)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		flight.resp = guardedResult{status: http.StatusInternalServerError, body: map[string]any{"success": false, "error": "词包审核失败"}}
		return flight.resp
	}
	file := filepath.Join(dir, key+".json")
	receipt := map[string]any{"fingerprint": fingerprint, "kind": "keyword-review", "createdAt": time.Now().UnixMilli()}
	if attemptID != "" {
		receipt["attemptId"] = attemptID
	}
	if replay, ok := claimReceipt(file, receipt, fingerprint, legacy); ok {
		flight.resp = replay
		return decorateSubmission(replay, "", true)
	}
	status, payload := submit()
	if discardUnbilledReject(status, payload) {
		_ = os.Remove(file)
		header := http.Header{}
		header.Set("x-request-fingerprint", fingerprint)
		if attemptID != "" {
			header.Set("x-submission-attempt-id", attemptID)
		}
		flight.resp = guardedResult{status: status, body: payload, header: header}
		return decorateSubmission(flight.resp, "", false)
	}
	completed := map[string]any{
		"fingerprint": fingerprint, "kind": "keyword-review", "createdAt": receipt["createdAt"],
		"status": status, "body": marshalReceiptText(payload),
	}
	if attempt, ok := receipt["attemptId"]; ok {
		completed["attemptId"] = attempt
	}
	stored, _ := marshalReceipt(completed)
	temp := file + ".tmp"
	if err := os.WriteFile(temp, stored, 0o600); err == nil {
		_ = os.Rename(temp, file)
	}
	header := http.Header{}
	header.Set("x-request-fingerprint", fingerprint)
	if attemptID != "" {
		header.Set("x-submission-attempt-id", attemptID)
	}
	flight.resp = guardedResult{status: status, body: payload, header: header}
	return decorateSubmission(flight.resp, "", false)
}

func discardUnbilledReject(status int, payload map[string]any) bool {
	if status != http.StatusTooManyRequests && status != http.StatusServiceUnavailable {
		return false
	}
	if payload == nil {
		return true
	}
	if payload["submissionUnknown"] == true {
		return false
	}
	usage, ok := payload["usage"]
	return !ok || usage == nil
}

func replayGuarded(resp guardedResult, fingerprint string) guardedResult {
	if resp.header != nil {
		saved := resp.header.Get("x-request-fingerprint")
		if saved != "" && saved != fingerprint {
			return guardedResult{status: http.StatusConflict, body: map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}}
		}
	}
	return decorateSubmission(resp, "", true)
}

func claimReceipt(file string, receipt map[string]any, fingerprint, legacy string) (guardedResult, bool) {
	raw, err := marshalReceipt(receipt)
	if err != nil {
		return guardedResult{}, false
	}
	handle, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err == nil {
		_, _ = handle.Write(raw)
		_ = handle.Close()
		return guardedResult{}, false
	}
	savedRaw, readErr := os.ReadFile(file)
	if readErr != nil {
		return guardedResult{status: http.StatusConflict, body: map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}}, true
	}
	var saved map[string]any
	if json.Unmarshal(savedRaw, &saved) != nil {
		return guardedResult{status: http.StatusConflict, body: map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}}, true
	}
	savedFingerprint, _ := saved["fingerprint"].(string)
	if savedFingerprint != fingerprint && savedFingerprint != legacy {
		return guardedResult{status: http.StatusConflict, body: map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}}, true
	}
	status, statusOK := saved["status"].(float64)
	bodyText, _ := saved["body"].(string)
	if !statusOK || status == 0 || bodyText == "" {
		return guardedResult{status: http.StatusConflict, body: map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}}, true
	}
	var payload map[string]any
	if json.Unmarshal([]byte(bodyText), &payload) != nil || payload == nil {
		payload = map[string]any{"success": false, "error": bodyText}
	}
	header := http.Header{}
	header.Set("x-request-fingerprint", fingerprint)
	attempt, _ := saved["attemptId"].(string)
	if attempt != "" {
		header.Set("x-submission-attempt-id", attempt)
	}
	return guardedResult{status: int(status), body: payload, header: header}, true
}

func decorateSubmission(result guardedResult, attemptID string, replayed bool) guardedResult {
	body := cloneJSONMap(result.body)
	body["replayed"] = replayed
	if attemptID != "" {
		body["submissionAttemptId"] = attemptID
	} else if saved := result.header.Get("x-submission-attempt-id"); saved != "" {
		body["submissionAttemptId"] = saved
	}
	header := result.header.Clone()
	if header == nil {
		header = http.Header{}
	}
	header.Set("x-submission-replayed", boolText(replayed))
	if id, _ := body["submissionAttemptId"].(string); id != "" {
		header.Set("x-submission-attempt-id", id)
	}
	return guardedResult{status: result.status, body: body, header: header}
}

func receiptsRoot() string {
	root := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR"))
	if root == "" {
		root = ".local/submission-receipts"
	}
	return filepath.Join(root, "submission-receipts")
}

func canonicalValue(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for index, key := range keys {
			parts[index] = marshalReceiptText(key) + ":" + canonicalValue(typed[key])
		}
		return "{" + strings.Join(parts, ",") + "}"
	case []any:
		parts := make([]string, len(typed))
		for index, item := range typed {
			parts[index] = canonicalValue(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	default:
		return marshalReceiptText(typed)
	}
}

func marshalReceiptText(value any) string {
	raw, _ := marshalReceipt(value)
	return string(raw)
}

func marshalReceipt(value any) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func cloneJSONMap(value map[string]any) map[string]any {
	raw, _ := json.Marshal(value)
	cloned := map[string]any{}
	_ = json.Unmarshal(raw, &cloned)
	return cloned
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func newSubmissionID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return hex.EncodeToString(buf[0:4]) + "-" + hex.EncodeToString(buf[4:6]) + "-" + hex.EncodeToString(buf[6:8]) + "-" + hex.EncodeToString(buf[8:10]) + "-" + hex.EncodeToString(buf[10:16])
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
