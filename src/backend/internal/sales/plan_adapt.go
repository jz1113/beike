package sales

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

//go:embed plan-adaptation.md
var planAdaptPrompt string

type planAdaptBeatInput struct {
	Index           int     `json:"index"`
	ShotIndex       int     `json:"shotIndex"`
	Start           float64 `json:"start"`
	End             float64 `json:"end"`
	Purpose         string  `json:"purpose"`
	ShotSize        string  `json:"shotSize"`
	Camera          string  `json:"camera"`
	RefAction       string  `json:"refAction"`
	Subject         string  `json:"subject,omitempty"`
	Scene           string  `json:"scene,omitempty"`
	Transition      string  `json:"transition,omitempty"`
	Expression      string  `json:"expression,omitempty"`
	RequiredView    string  `json:"requiredView"`
	AssignedView    string  `json:"assignedView"`
	ImageLabel      string  `json:"imageLabel"`
	BuyingPoint     string  `json:"buyingPoint"`
	ActionReference string  `json:"actionReference"`
}

type planAdaptVisualSpec struct {
	AspectRatio  string   `json:"aspectRatio"`
	OneTake      bool     `json:"oneTake"`
	StyleSummary string   `json:"styleSummary"`
	Lighting     string   `json:"lighting"`
	CameraFeel   string   `json:"cameraFeel"`
	MoodTags     []string `json:"moodTags"`
	Pacing       string   `json:"pacing"`
}

type planAdaptRequest struct {
	ProductName       string               `json:"productName"`
	Brand             string               `json:"brand"`
	Category          string               `json:"category"`
	Summary           string               `json:"summary"`
	Facts             string               `json:"facts"`
	BuyingPoints      []string             `json:"buyingPoints"`
	Cautions          []string             `json:"cautions"`
	ScriptTitle       string               `json:"scriptTitle"`
	OneTake           bool                 `json:"oneTake"`
	VisualSpec        *planAdaptVisualSpec `json:"visualSpec,omitempty"`
	VoiceMode         string               `json:"voiceMode"`
	PresentationMode  string               `json:"presentationMode"`
	ImitationMode     string               `json:"imitationMode"`
	PersonaSummary    string               `json:"personaSummary"`
	SceneSummary      string               `json:"sceneSummary"`
	SourceExclusions  []string             `json:"sourceExclusions"`
	Beats             []planAdaptBeatInput `json:"beats"`
	Model             string               `json:"model"`
	CustomBaseURL     string               `json:"customBaseUrl"`
	CustomAPIKey      string               `json:"customApiKey"`
	TextProtocol      string               `json:"textProtocol"`
	APIFormat         string               `json:"apiFormat"`
	AllowInsecureHTTP bool                 `json:"allowInsecureHttp"`
}

type adaptedBeatOutput struct {
	Index      int    `json:"index"`
	Subject    string `json:"subject"`
	Action     string `json:"action"`
	Expression string `json:"expression"`
	Transition string `json:"transition"`
	SpokenLine string `json:"spokenLine"`
	Subtitle   string `json:"subtitle"`
}

func planAdaptPromptVersion() string {
	digest := sha256.Sum256([]byte(planAdaptPrompt + "|adapt-v2"))
	return "plan-adapt:" + hex.EncodeToString(digest[:6])
}

func PlanAdapt(cfg config.Config) http.HandlerFunc {
	return planAdaptHandler(cfg, func(ctx context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		return gateway.CompleteText(ctx, req)
	})
}

func planAdaptHandler(cfg config.Config, complete summaryCompleter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body planAdaptRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			fail(400, "分镜改编请求格式错误")
			return
		}
		if len(body.Beats) == 0 || len(body.Beats) > 24 {
			fail(400, "分镜动作段数量需在 1—24 段之间")
			return
		}
		for i, beat := range body.Beats {
			if beat.Index != i || beat.ShotIndex < 0 || beat.Start < 0 || beat.End <= beat.Start || beat.End > 600 || (i > 0 && beat.Start < body.Beats[i-1].End-0.25) {
				fail(400, fmt.Sprintf("动作段 %d 的编号或时间范围无效，请重新选择参考脚本", i+1))
				return
			}
		}
		if strings.TrimSpace(body.ProductName) == "" && len(body.BuyingPoints) == 0 && strings.TrimSpace(body.Facts) == "" {
			fail(400, "请先提供商品名称、买点或已收录资料")
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, map[string]any{"textProtocol": body.TextProtocol})
		if !ok {
			return
		}
		base, key, model, credentialErr := summaryCredentials(cfg, r, summaryRequest{Model: body.Model, CustomBaseURL: body.CustomBaseURL, CustomAPIKey: body.CustomAPIKey, APIFormat: body.APIFormat, AllowInsecureHTTP: body.AllowInsecureHTTP})
		if credentialErr != "" {
			fail(400, credentialErr)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()
		prompt, promptErr := loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "plan-adapt")
		if promptErr != nil {
			promptStorageFailure(w, promptErr)
			return
		}
		protocol := gateway.TextProtocolForBase(ctx, model, base)
		if body.APIFormat == "openai-responses" {
			protocol = "openai-responses"
		}
		presentationMode := body.PresentationMode
		if presentationMode != "clean_visual" {
			presentationMode = "subtitled_intro"
		}
		imitationMode := body.ImitationMode
		if imitationMode != "depth_imitation" {
			imitationMode = "script_only"
		}
		userInput, _ := json.Marshal(map[string]any{
			"productName":      body.ProductName,
			"brand":            body.Brand,
			"category":         body.Category,
			"summary":          body.Summary,
			"facts":            body.Facts,
			"buyingPoints":     body.BuyingPoints,
			"cautions":         body.Cautions,
			"scriptTitle":      body.ScriptTitle,
			"oneTake":          body.OneTake,
			"visualSpec":       body.VisualSpec,
			"voiceMode":        body.VoiceMode,
			"presentationMode": presentationMode,
			"imitationMode":    imitationMode,
			"personaSummary":   body.PersonaSummary,
			"sceneSummary":     body.SceneSummary,
			"sourceExclusions": body.SourceExclusions,
			"beats":            body.Beats,
		})
		payload := map[string]any{
			"model":           model,
			"max_tokens":      8000,
			"response_format": map[string]any{"type": "json_object"},
			"messages": []any{
				map[string]any{"role": "system", "content": prompt.Prompt},
				map[string]any{"role": "user", "content": "请根据以下商品、人物、场景与分镜结构输出 JSON：\n" + string(userInput)},
			},
		}
		requestID := httpx.RequestID()
		status, data, err := complete(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol, Payload: payload, Client: gateway.ModelHTTP(), Timeout: 120 * time.Second}, false)
		if err != nil || status < 200 || status >= 300 {
			failure := classifySummaryFailure(ctx, status, err, key)
			log.Printf("[sales-adapt] request=%s stage=%s code=%s status=%d", requestID, failure.Stage, failure.Code, status)
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": failure.Stage, "requestId": requestID})
			return
		}
		sourceFacts := strings.Join(append([]string{body.ProductName, body.Summary, body.Facts}, body.BuyingPoints...), "\n")
		beats, parseErr := parseAdaptedBeats(data, len(body.Beats), body.VoiceMode, presentationMode, sourceFacts, body.SourceExclusions, body.ProductName)
		if parseErr == nil {
			parseErr = validateAdaptedPerformance(beats, body.Beats)
		}
		if parseErr != nil {
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "分镜改编未通过校验：" + parseErr.Error(), "code": "adapt_validation", "requestId": requestID})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "beats": beats, "model": model, "promptVersion": prompt.Version})
	}
}

func scrubAdaptedTerms(text string, exclusions []string, productName string) string {
	out := strings.TrimSpace(text)
	fallback := strings.TrimSpace(productName)
	if fallback == "" {
		fallback = "当前商品"
	}
	for _, raw := range exclusions {
		term := strings.TrimSpace(raw)
		if len([]rune(term)) >= 2 && strings.Contains(out, term) && !strings.Contains(fallback, term) {
			out = strings.ReplaceAll(out, term, fallback)
		}
	}
	return strings.TrimSpace(out)
}

func parseAdaptedBeats(data map[string]any, expected int, voiceMode, presentationMode, sourceFacts string, exclusions []string, productName string) ([]adaptedBeatOutput, error) {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, errors.New("模型没有返回内容")
	}
	choice, _ := choices[0].(map[string]any)
	finish, _ := choice["finish_reason"].(string)
	if finish != "stop" {
		return nil, errors.New("模型返回未完成或被截断，请减少动作段后重试")
	}
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	object := gateway.DecodeObject(text)
	if object == nil {
		return nil, errors.New("返回内容不是合法 JSON")
	}
	raw, _ := json.Marshal(object["beats"])
	var indexed []struct {
		adaptedBeatOutput
		Index *int `json:"index"`
	}
	if json.Unmarshal(raw, &indexed) != nil || len(indexed) != expected {
		return nil, fmt.Errorf("动作段数量不匹配（期望 %d 段）", expected)
	}
	beats := make([]adaptedBeatOutput, expected)
	seen := make(map[int]bool, expected)
	for _, beat := range indexed {
		if beat.Index == nil || *beat.Index < 0 || *beat.Index >= expected || seen[*beat.Index] {
			return nil, errors.New("动作段编号缺失、重复或超出范围")
		}
		seen[*beat.Index] = true
		beat.adaptedBeatOutput.Index = *beat.Index
		beats[*beat.Index] = beat.adaptedBeatOutput
	}
	cleanVisual := presentationMode == "clean_visual"
	for i := range beats {
		beats[i].Subject = scrubAdaptedTerms(beats[i].Subject, exclusions, productName)
		beats[i].Action = scrubAdaptedTerms(beats[i].Action, exclusions, productName)
		beats[i].Expression = scrubAdaptedTerms(beats[i].Expression, exclusions, productName)
		beats[i].Transition = scrubAdaptedTerms(beats[i].Transition, exclusions, productName)
		beats[i].SpokenLine = scrubAdaptedTerms(beats[i].SpokenLine, exclusions, productName)
		beats[i].Subtitle = scrubAdaptedTerms(beats[i].Subtitle, exclusions, productName)
		if beats[i].Action == "" {
			return nil, fmt.Errorf("动作段 %d 缺少具体动作描述", i+1)
		}
		if voiceMode == "none" || cleanVisual {
			beats[i].SpokenLine = ""
		}
		if cleanVisual {
			beats[i].Subtitle = ""
		}
		combined := strings.Join([]string{beats[i].Action, beats[i].Expression, beats[i].Transition, beats[i].SpokenLine, beats[i].Subtitle}, " ")
		if match := summaryPromises.FindString(combined); match != "" && !strings.Contains(sourceFacts, match) {
			return nil, fmt.Errorf("动作段 %d 含未经证实的承诺表述「%s」", i+1, match)
		}
	}
	return beats, nil
}

func validateAdaptedPerformance(beats []adaptedBeatOutput, source []planAdaptBeatInput) error {
	for i, beat := range beats {
		if len([]rune(beat.Expression)) > 600 || len([]rune(beat.Transition)) > 400 {
			return fmt.Errorf("动作段 %d 的表情或衔接描述过长，请精简后重试", i+1)
		}
		if strings.TrimSpace(source[i].Expression) != "" && beat.Expression == "" {
			return fmt.Errorf("动作段 %d 缺少适配后的眼神表情，请独立保留表情变化与起止时点", i+1)
		}
		if strings.TrimSpace(source[i].Transition) != "" && beat.Transition == "" {
			return fmt.Errorf("动作段 %d 缺少适配后的段落衔接，请独立保留末姿势与收势", i+1)
		}
	}
	return nil
}
