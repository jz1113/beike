package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
)

type planPersonaVisualProfile struct {
	ImageURL    string `json:"imageUrl"`
	Presence    string `json:"presence"`
	Temperament string `json:"temperament"`
	Gaze        string `json:"gaze"`
	Expression  string `json:"expression"`
	Posture     string `json:"posture"`
	Limitations string `json:"limitations"`
}

func validatePlanPersonaInput(body *planAdaptRequest) error {
	body.PersonaReferenceImageURL = strings.TrimSpace(body.PersonaReferenceImageURL)
	if body.PersonaReferenceImageURL == "" {
		return nil
	}
	if !boundedText(body.PersonaReferenceImageURL, 8192, true) {
		return errors.New("人物原图地址无效")
	}
	switch body.PersonaPresence {
	case "full_presenter", "silent_model", "hands_only":
		return nil
	default:
		return errors.New("请明确人物原图的出镜范围后重试")
	}
}

// Use the same guarded image reader as asset creation. Local references stay
// workspace scoped; remote images cannot access private network resources.
func planPersonaContent(ctx context.Context, workspace string, body planAdaptRequest, text string) (any, error) {
	if body.PersonaReferenceImageURL == "" {
		return text, nil
	}
	data, err := readAssetGrid(ctx, body.PersonaReferenceImageURL, workspace)
	if err != nil {
		return nil, errors.New("人物原图读取失败，请核对所选人物或重新上传后再改写")
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 || int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return nil, errors.New("人物原图无效或超过 4000 万像素，请更换后重试")
	}
	url := "data:" + http.DetectContentType(data) + ";base64," + base64.StdEncoding.EncodeToString(data)
	return []any{map[string]any{"type": "text", "text": text},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": url}}}, nil
}

func parsePlanPersonaVisual(data map[string]any, body planAdaptRequest) (*planPersonaVisualProfile, error) {
	if body.PersonaReferenceImageURL == "" {
		return nil, nil
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, errors.New("模型未返回人物原图视觉分析")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	object := gateway.DecodeObject(text)
	raw, _ := json.Marshal(object["personaVisualProfile"])
	var profile *planPersonaVisualProfile
	if json.Unmarshal(raw, &profile) != nil || profile == nil {
		return nil, errors.New("人物原图视觉分析缺失或格式无效，请使用支持图片理解的改写模型重试")
	}
	fields := []*string{&profile.Temperament, &profile.Gaze, &profile.Expression, &profile.Posture, &profile.Limitations}
	for _, field := range fields {
		*field = strings.TrimSpace(*field)
		if !boundedText(*field, 600, false) {
			return nil, errors.New("人物原图视觉分析过长，请重试")
		}
	}
	if body.PersonaPresence == "hands_only" {
		profile.Gaze, profile.Expression = "", ""
	}
	if strings.TrimSpace(profile.Temperament+profile.Gaze+profile.Expression+profile.Posture) == "" {
		return nil, errors.New("人物原图未提取到可见神态或姿态，请更换清晰图片重试")
	}
	// The server binds the observations to the submitted source. A model may
	// describe an image, but cannot choose its identity or scope.
	profile.ImageURL, profile.Presence = body.PersonaReferenceImageURL, body.PersonaPresence
	return profile, nil
}
