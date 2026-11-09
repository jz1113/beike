package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
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
	"time"
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
	if err := ctx.Err(); err != nil {
		return SpeechResult{}, &SpeechSubmissionError{Message: "音频提交前已取消"}
	}
	attempts := speechAttempts(req)
	for index, attempt := range attempts {
		status, raw, contentType, err := postSpeech(ctx, attempt.Endpoint, req.APIKey, attempt.Payload)
		if err != nil {
			return SpeechResult{}, &SpeechSubmissionError{Message: err.Error(), Unknown: true}
		}
		if status >= 200 && status < 300 {
			if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '{' {
				result, decodeErr := decodeSpeechJSON(bytes.TrimSpace(raw))
				if decodeErr != nil {
					return result, &SpeechSubmissionError{Message: decodeErr.Error(), Unknown: true}
				}
				return result, nil
			}
			if len(raw) == 0 {
				return SpeechResult{}, &SpeechSubmissionError{Message: "音频接口未返回音频数据", Unknown: true}
			}
			if contentType == "" {
				contentType = "audio/mpeg"
			}
			return SpeechResult{Bytes: raw, ContentType: contentType}, nil
		}
		var data map[string]any
		_ = json.Unmarshal(raw, &data)
		usage := gateway.NormalizeUsage(data)
		// Only an explicit, unbilled unsupported endpoint permits a protocol fallback.
		if gateway.CanTryAnotherEndpoint(status) && usage == nil && index < len(attempts)-1 {
			continue
		}
		return SpeechResult{Usage: usage}, &SpeechSubmissionError{Message: speechError(raw, status), Unknown: status >= 500 || status == http.StatusRequestTimeout || usage != nil}
	}
	return SpeechResult{}, &SpeechSubmissionError{Message: "音频接口未返回音频数据", Unknown: true}
}

type SpeechSubmissionError struct {
	Message string
	Unknown bool
}

func (err *SpeechSubmissionError) Error() string { return err.Message }

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
	response, err := gateway.ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, "", errors.New("音频网关请求失败")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (32<<20)+1))
	if len(raw) > 32<<20 {
		return response.StatusCode, nil, response.Header.Get("Content-Type"), errors.New("音频响应超过允许大小，提交结果待核对")
	}
	return response.StatusCode, raw, response.Header.Get("Content-Type"), err
}

func decodeSpeechJSON(raw []byte) (SpeechResult, error) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return SpeechResult{}, errors.New("音频接口返回无法识别")
	}
	usage := gateway.NormalizeUsage(data)
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
	return SpeechResult{Usage: usage}, errors.New("音频接口未返回音频数据")
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
		putCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := storage.Objects.Put(putCtx, *obj, key, contentType, data); err == nil {
			publicURL = storage.PermanentObjectURL(*obj, key)
		}
	}
	return localURL, publicURL, nil
}

type speechAttempt struct {
	Endpoint string
	Payload  map[string]any
}

func speechFamily(model string) string {
	id := strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.Contains(id, "eleven"):
		return "elevenlabs"
	case strings.Contains(id, "cosyvoice") || strings.Contains(id, "cosy-voice"):
		return "cosyvoice"
	case strings.Contains(id, "doubao") && strings.Contains(id, "tts"):
		return "doubao"
	case strings.Contains(id, "speech-") || strings.Contains(id, "minimax") || strings.Contains(id, "t2a"):
		return "minimax"
	default:
		return "openai"
	}
}

func speechAttempts(req SpeechRequest) []speechAttempt {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(req.Base), "/")
	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format == "" {
		format = "mp3"
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "speech-01-hd"
	}
	voice := strings.TrimSpace(req.Voice)
	if voice == "" {
		voice = "alloy"
	}
	speed := req.Speed
	if speed <= 0 {
		speed = 1
	}
	volume := req.Volume
	if volume <= 0 {
		volume = 1
	}
	openai := speechAttempt{
		Endpoint: root + "/v1/audio/speech",
		Payload: map[string]any{
			"model": model, "input": req.Text, "voice": voice, "speed": speed, "response_format": format, "volume": volume,
		},
	}
	switch speechFamily(model) {
	case "minimax":
		return []speechAttempt{{
			Endpoint: root + "/v1/t2a_v2",
			Payload: map[string]any{
				"model": model, "text": req.Text, "stream": false,
				"voice_setting": map[string]any{"voice_id": voice, "speed": speed, "vol": volume},
				"audio_setting": map[string]any{"format": format, "sample_rate": 32000},
			},
		}, openai}
	case "elevenlabs":
		return []speechAttempt{{
			Endpoint: root + "/v1/text-to-speech/" + voice,
			Payload:  map[string]any{"text": req.Text, "model_id": model},
		}, openai}
	case "cosyvoice":
		return []speechAttempt{{
			Endpoint: root + "/api/v1/services/aigc/text2audio/generation",
			Payload: map[string]any{
				"model":      model,
				"input":      map[string]any{"text": req.Text, "voice": voice},
				"parameters": map[string]any{"format": format, "rate": speed},
			},
		}, openai}
	case "doubao":
		return []speechAttempt{{
			Endpoint: root + "/api/v1/tts",
			Payload:  map[string]any{"model": model, "text": req.Text, "voice_type": voice, "speed_ratio": speed, "encoding": format},
		}, openai}
	default:
		return []speechAttempt{openai}
	}
}
