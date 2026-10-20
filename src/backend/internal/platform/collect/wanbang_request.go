package collect

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const wanbangBodyLimit = 8 << 20

type wanbangStatusError struct{ status int }

func (err wanbangStatusError) Error() string { return "万邦网关请求失败" }

type wanbangBodyError struct{ kind string }

func (err wanbangBodyError) Error() string { return "万邦采集接口响应异常: " + err.kind }

// Keep the existing two-attempt ceiling per existing method. Protocol/body
// errors and permanent business errors never cause another paid request.
func fetchWanbang(ctx context.Context, client *http.Client, rawURL string) (map[string]any, error) {
	if client == nil {
		return nil, wanbangStatusError{status: http.StatusBadGateway}
	}
	for attempt := 0; attempt < 2; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		data, permanent, err := requestWanbang(ctx, client, rawURL)
		if err == nil && (permanent || attempt == 1 || !temporaryWanbang(data)) {
			return data, nil
		}
		if err != nil && (attempt == 1 || !retryWanbangRequest(err)) {
			return nil, err
		}
		if err := waitWanbangRetry(ctx); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("万邦重试次数已用尽")
}

func requestWanbang(ctx context.Context, client *http.Client, rawURL string) (map[string]any, bool, error) {
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, false, err
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	response, err := client.Do(request)
	if err != nil {
		return nil, false, err
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, wanbangBodyLimit+1))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, false, wanbangStatusError{status: response.StatusCode}
	}
	if readErr != nil {
		return nil, false, readErr
	}
	if len(body) > wanbangBodyLimit {
		return nil, false, wanbangBodyError{kind: "tooLarge"}
	}
	return parseWanbang(body, response.Header.Get("Content-Type"), response.StatusCode)
}

func retryWanbangRequest(err error) bool {
	switch failure := err.(type) {
	case wanbangBodyError:
		return false
	case wanbangStatusError:
		return failure.status >= 500 || failure.status == http.StatusRequestTimeout
	default:
		return true
	}
}

func waitWanbangRetry(ctx context.Context) error {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return ctx.Err()
	}
}

func parseWanbang(body []byte, contentType string, status int) (map[string]any, bool, error) {
	if len(body) > wanbangBodyLimit {
		return nil, false, wanbangBodyError{kind: "tooLarge"}
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return nil, false, wanbangBodyError{kind: "empty"}
	}
	var parsed map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&parsed); err != nil || parsed == nil {
		return nil, false, wanbangBodyError{kind: "nonJSON"}
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return nil, false, wanbangBodyError{kind: "nonJSON"}
	}
	message := strings.ToLower(stringify(parsed["error"]) + " " + stringify(parsed["reason"]) + " " + stringify(parsed["error_code"]))
	permanent := strings.Contains(message, "not-found") || strings.Contains(message, "不存在") || strings.Contains(message, "下架") || strings.Contains(message, "invalid") || strings.Contains(message, "empty") || strings.Contains(message, "apikey")
	if !permanent {
		switch stringify(parsed["error_code"]) {
		case "2000", "4003", "4004", "4005", "4006", "4007", "4008", "4009", "4010", "4012", "4013", "4014", "4015", "4016":
			permanent = true
		}
	}
	_ = contentType // Valid JSON wins over unreliable upstream Content-Type.
	_ = status      // HTTP errors are handled separately from body errors.
	return parsed, permanent, nil
}

func temporaryWanbang(data map[string]any) bool {
	if data["item"] != nil && !wanbangReportedError(data["error"]) {
		switch stringify(data["error_code"]) {
		case "", "0", "0000":
			return false
		}
	}
	switch stringify(data["error_code"]) {
	case "4000", "4001", "4002", "4017", "5000":
		return true
	default:
		return false
	}
}
