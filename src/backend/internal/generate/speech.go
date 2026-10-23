package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

type SpeechRequest struct {
	Base   string
	APIKey string
	Model  string
	Text   string
	Voice  string
	Format string
	Speed  float64
	Volume float64
}

type SpeechResult struct {
	Bytes       []byte
	ContentType string
	RemoteURL   string
	Usage       map[string]any
}

func SynthesizeSpeech(ctx context.Context, req SpeechRequest) (SpeechResult, error) {
	if strings.TrimSpace(req.APIKey) == "" || strings.TrimSpace(req.Base) == "" {
		return SpeechResult{}, errors.New("未配置音频网关")
	}
	attempts := speechAttempts(req)
	var last error
	for index, attempt := range attempts {
		status, raw, contentType, err := postSpeech(ctx, attempt.Endpoint, req.APIKey, attempt.Payload)
		if err != nil {
			last = err
			if index == len(attempts)-1 {
				return SpeechResult{}, last
			}
			continue
		}
		if status >= 200 && status < 300 {
			if len(raw) > 0 && raw[0] == '{' {
				return decodeSpeechJSON(raw)
			}
			if contentType == "" {
				contentType = "audio/mpeg"
			}
			return SpeechResult{Bytes: raw, ContentType: contentType}, nil
		}
		last = errors.New(speechError(raw, status))
		retryable := gateway.CanTryAnotherEndpoint(status) || status >= 500
		if !retryable || index == len(attempts)-1 {
			return SpeechResult{}, last
		}
	}
	if last == nil {
		last = errors.New("音频接口未返回音频数据")
	}
	return SpeechResult{}, last
}

func postSpeech(ctx context.Context, endpoint, apiKey string, payload any) (int, []byte, string, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return 0, nil, "", err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, "", errors.New("音频网关请求失败")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	return response.StatusCode, raw, response.Header.Get("Content-Type"), err
}

func decodeSpeechJSON(raw []byte) (SpeechResult, error) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return SpeechResult{}, errors.New("音频接口返回无法识别")
	}
	usage := NormalizeUsage(data)
	if nested, ok := data["data"].(map[string]any); ok {
		if result, ok := speechFromMap(nested); ok {
			result.Usage = usage
			return result, nil
		}
	}
	if result, ok := speechFromMap(data); ok {
		result.Usage = usage
		return result, nil
	}
	return SpeechResult{}, errors.New("音频接口未返回音频数据")
}

func speechFromMap(data map[string]any) (SpeechResult, bool) {
	for _, key := range []string{"url", "audio_url", "audioUrl"} {
		if value, ok := data[key].(string); ok && strings.HasPrefix(value, "http") {
			return SpeechResult{RemoteURL: value, ContentType: "audio/mpeg"}, true
		}
	}
	for _, key := range []string{"audio", "audio_data", "data"} {
		value, ok := data[key].(string)
		if !ok || value == "" {
			continue
		}
		if strings.HasPrefix(value, "http") {
			return SpeechResult{RemoteURL: value, ContentType: "audio/mpeg"}, true
		}
		if decoded, ok := decodeAudioPayload(value); ok {
			return SpeechResult{Bytes: decoded, ContentType: sniffAudio(decoded)}, true
		}
	}
	return SpeechResult{}, false
}

func decodeAudioPayload(value string) ([]byte, bool) {
	value = strings.TrimSpace(value)
	if decoded, err := hex.DecodeString(value); err == nil && looksLikeAudio(decoded) {
		return decoded, true
	}
	if decoded, err := base64.StdEncoding.DecodeString(value); err == nil && looksLikeAudio(decoded) {
		return decoded, true
	}
	return nil, false
}

func looksLikeAudio(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	if string(data[:3]) == "ID3" || string(data[:4]) == "RIFF" || string(data[:4]) == "fLaC" || string(data[:4]) == "OggS" {
		return true
	}
	if len(data) >= 8 && string(data[4:8]) == "ftyp" {
		return true
	}
	return data[0] == 0xFF && data[1]&0xE0 == 0xE0
}

func sniffAudio(data []byte) string {
	if len(data) >= 4 && string(data[:4]) == "RIFF" {
		return "audio/wav"
	}
	if len(data) >= 8 && string(data[4:8]) == "ftyp" {
		return "audio/mp4"
	}
	return "audio/mpeg"
}

func speechError(raw []byte, status int) string {
	var data map[string]any
	if json.Unmarshal(raw, &data) == nil {
		if message, ok := data["message"].(string); ok && strings.TrimSpace(message) != "" {
			return message
		}
		if nested, ok := data["error"].(map[string]any); ok {
			if message, ok := nested["message"].(string); ok && strings.TrimSpace(message) != "" {
				return message
			}
		}
		if message, ok := data["error"].(string); ok && strings.TrimSpace(message) != "" {
			return message
		}
	}
	return "音频网关返回 HTTP " + Itoa(status)
}

func SaveWorkspaceBytes(workspace, folder, filename, contentType string, data []byte) (string, string, error) {
	if strings.TrimSpace(workspace) == "" {
		workspace = "local"
	}
	rel := workspace + "/" + strings.Trim(folder, "/") + "/" + filename
	target := storage.SafeWithin(storage.ResolveRoot(), rel)
	if target == "" {
		return "", "", errors.New("存储路径无效")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", "", err
	}
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return "", "", err
	}
	localURL := "/storage/" + rel
	publicURL := ""
	if obj := storage.ResolveObjectConfig(nil); obj != nil {
		key := strings.Trim(strings.Trim(obj.ApiPrefix, "/"), "") + "/" + rel
		key = strings.TrimPrefix(key, "/")
		if err := storage.Objects.Put(context.Background(), *obj, key, contentType, data); err == nil {
			publicURL = storage.PermanentObjectURL(*obj, key)
		}
	}
	return localURL, publicURL, nil
}
