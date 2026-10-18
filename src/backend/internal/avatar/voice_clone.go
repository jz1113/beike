package avatar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/modelgw"
)

func ProcessVoiceClone(cfg config.Config, voice Voice, req CreateVoiceRequest) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		db, err := openPipelineDB(cfg)
		if err != nil {
			return
		}
		defer db.Close()
		voiceID, err := cloneProviderVoice(ctx, req, voice)
		writeCtx, cancelWrite := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancelWrite()
		if err != nil {
			_ = UpdateVoiceClone(writeCtx, db, voice.ID, 2, err.Error(), voice.VoiceID)
			return
		}
		_ = UpdateVoiceClone(writeCtx, db, voice.ID, 1, "声音克隆完成", voiceID)
	}()
}

func cloneProviderVoice(ctx context.Context, req CreateVoiceRequest, voice Voice) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(req.Provider + " " + req.Model))
	base := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if strings.Contains(provider, "eleven") {
		return cloneElevenLabs(ctx, base, req.APIKey, voice)
	}
	return cloneMiniMax(ctx, base, req.APIKey, req.Model, voice)
}

func cloneMiniMax(ctx context.Context, base, key, model string, voice Voice) (string, error) {
	if model == "" {
		model = "speech-02-hd"
	}
	payload := map[string]any{
		"model": model, "voice_id": voice.VoiceID, "audio_url": voice.AudioURL, "text": voice.PromptText,
	}
	endpoints := []string{base + "/v1/voice_clone", base + "/minimax/v1/voice_clone"}
	var last error
	for index, endpoint := range endpoints {
		status, raw, err := generate.PostModel(ctx, http.MethodPost, endpoint, key, payload, 90*time.Second)
		if err != nil {
			last = errors.New("声音克隆请求失败")
			if index == len(endpoints)-1 {
				return "", last
			}
			continue
		}
		if status >= 200 && status < 300 {
			if id := cloneVoiceID(mapFrom(raw)); id != "" {
				return id, nil
			}
			return voice.VoiceID, nil
		}
		last = errors.New(cloneError(raw, status))
		retryable := modelgw.CanTryAnotherEndpoint(status) || status >= 500
		if !retryable || index == len(endpoints)-1 {
			return "", last
		}
	}
	return "", last
}

func cloneElevenLabs(ctx context.Context, base, key string, voice Voice) (string, error) {
	audio, err := readAvatarMedia(ctx, voice.AudioURL)
	if err != nil {
		return "", errors.New("参考音频读取失败")
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("name", voice.Name)
	_ = writer.WriteField("description", voice.PromptText)
	part, err := writer.CreateFormFile("files", "sample.mp3")
	if err != nil {
		return "", errors.New("声音克隆请求失败")
	}
	if _, err := part.Write(audio); err != nil {
		return "", errors.New("声音克隆请求失败")
	}
	_ = writer.Close()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/voices/add", body)
	if err != nil {
		return "", errors.New("声音克隆请求失败")
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("xi-api-key", key)
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := generate.ModelHTTP().Do(request)
	if err != nil {
		return "", errors.New("声音克隆请求失败")
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", errors.New(cloneError(raw, response.StatusCode))
	}
	if id := cloneVoiceID(mapFrom(raw)); id != "" {
		return id, nil
	}
	return voice.VoiceID, nil
}

func mapFrom(raw []byte) map[string]any {
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	return data
}

func cloneVoiceID(data map[string]any) string {
	if id := firstString(data, "voice_id", "voiceId"); id != "" {
		return id
	}
	return readTaskID(data)
}

func cloneError(raw []byte, status int) string {
	data := mapFrom(raw)
	if message := firstString(data, "message", "error"); message != "" {
		return message
	}
	if status == http.StatusUnauthorized {
		return "声音克隆密钥无效"
	}
	return "声音克隆失败"
}
