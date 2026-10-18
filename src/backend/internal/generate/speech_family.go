package generate

import (
	"strings"

	"beike.local/cloud/src/backend/internal/system"
)

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
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(req.Base), "/")
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
