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
	PreservePerformance bool    `json:"preservePerformance,omitempty"`
	Index               int     `json:"index"`
	ShotIndex           int     `json:"shotIndex"`
	Start               float64 `json:"start"`
	End                 float64 `json:"end"`
	Purpose             string  `json:"purpose"`
	ShotSize            string  `json:"shotSize"`
	Camera              string  `json:"camera"`
	ProductVisible      *bool   `json:"productVisible,omitempty"`
	RefAction           string  `json:"refAction"`
	Subject             string  `json:"subject,omitempty"`
	Scene               string  `json:"scene,omitempty"`
	Transition          string  `json:"transition,omitempty"`
	Expression          string  `json:"expression,omitempty"`
	RequiredView        string  `json:"requiredView"`
	AssignedView        string  `json:"assignedView"`
	ImageLabel          string  `json:"imageLabel"`
	BuyingPoint         string  `json:"buyingPoint"`
	ActionReference     string  `json:"actionReference"`
	SourceVoiceText     string  `json:"sourceVoiceText,omitempty"`
	SourceLinePattern   string  `json:"sourceLinePattern,omitempty"`
	SourceSubtitle      string  `json:"sourceSubtitle,omitempty"`
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

type planSourceExclusion struct {
	Term string `json:"term"`
	Type string `json:"type"`
}

func (exclusion *planSourceExclusion) UnmarshalJSON(raw []byte) error {
	var legacy string
	if len(raw) > 0 && raw[0] == '"' && json.Unmarshal(raw, &legacy) == nil {
		// Legacy strings have no role; retain their historical product replacement behavior.
		exclusion.Term, exclusion.Type = strings.TrimSpace(legacy), "product"
		if len([]rune(exclusion.Term)) > 200 {
			return errors.New("原片剥离词超过 200 字")
		}
		return nil
	}
	type typedExclusion planSourceExclusion
	var typed typedExclusion
	if err := json.Unmarshal(raw, &typed); err != nil {
		return err
	}
	*exclusion = planSourceExclusion(typed)
	exclusion.Term, exclusion.Type = strings.TrimSpace(exclusion.Term), strings.TrimSpace(exclusion.Type)
	if exclusion.Term == "" || len([]rune(exclusion.Term)) > 200 || exclusion.Type == "" || len([]rune(exclusion.Type)) > 80 {
		return errors.New("原片剥离词的内容或类型无效")
	}
	return nil
}

type planNarration struct {
	SourceCopy string  `json:"sourceCopy"`
	Duration   float64 `json:"duration"`
	TargetCps  float64 `json:"targetCps"`
}
type planAdaptRequest struct {
	AllowProductReframe      bool                  `json:"allowProductReframe"`
	Narration                *planNarration        `json:"narration"`
	Unresolved               []string              `json:"unresolved"`
	ProductName              string                `json:"productName"`
	Brand                    string                `json:"brand"`
	Category                 string                `json:"category"`
	Summary                  string                `json:"summary"`
	Facts                    string                `json:"facts"`
	BuyingPoints             []string              `json:"buyingPoints"`
	Cautions                 []string              `json:"cautions"`
	ScriptTitle              string                `json:"scriptTitle"`
	OneTake                  bool                  `json:"oneTake"`
	VisualSpec               *planAdaptVisualSpec  `json:"visualSpec,omitempty"`
	VoiceMode                string                `json:"voiceMode"`
	PresentationMode         string                `json:"presentationMode"`
	ImitationMode            string                `json:"imitationMode"`
	PersonaSummary           string                `json:"personaSummary"`
	PersonaReferenceImageURL string                `json:"personaReferenceImageUrl"`
	PersonaPresence          string                `json:"personaPresence"`
	SceneSummary             string                `json:"sceneSummary"`
	SourceExclusions         []planSourceExclusion `json:"sourceExclusions"`
	Beats                    []planAdaptBeatInput  `json:"beats"`
	Model                    string                `json:"model"`
	CustomBaseURL            string                `json:"customBaseUrl"`
	CustomAPIKey             string                `json:"customApiKey"`
	TextProtocol             string                `json:"textProtocol"`
	APIFormat                string                `json:"apiFormat"`
	AllowInsecureHTTP        bool                  `json:"allowInsecureHttp"`
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
	digest := sha256.Sum256([]byte(planAdaptPrompt + "|adapt-v3"))
	return "plan-adapt:" + hex.EncodeToString(digest[:6])
}

func PlanAdapt(cfg config.Config) http.HandlerFunc {
	return planAdaptHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if responses {
			return gateway.CompleteResponses(ctx, req)
		}
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
		if err := validatePlanPersonaInput(&body); err != nil {
			fail(400, err.Error())
			return
		}
		if len(body.Beats) == 0 || len(body.Beats) > 24 {
			fail(400, "分镜动作段数量需在 1—24 段之间")
			return
		}
		if len(body.SourceExclusions) > 40 {
			fail(400, "原片剥离词最多 40 项，请精简后重试")
			return
		}
		for i, beat := range body.Beats {
			if beat.Index != i || beat.ShotIndex < 0 || beat.Start < 0 || beat.End <= beat.Start || beat.End > 600 || (i > 0 && beat.Start < body.Beats[i-1].End-0.25) {
				fail(400, fmt.Sprintf("动作段 %d 的编号或时间范围无效，请重新选择参考脚本", i+1))
				return
			}
			if !boundedText(beat.SourceVoiceText, 1000, false) || !boundedText(beat.SourceLinePattern, 600, false) || !boundedText(beat.SourceSubtitle, 400, false) {
				fail(400, fmt.Sprintf("动作段 %d 的原片台词或字幕过长", i+1))
				return
			}
		}
		if strings.TrimSpace(body.ProductName) == "" && len(body.BuyingPoints) == 0 && strings.TrimSpace(body.Facts) == "" {
			fail(400, "请先提供商品名称、买点或已收录资料")
			return
		}
		performance, changes := planAdaptPerformance(body)
		validation := body
		validation.Beats = performance
		if compatibilityErr := validatePlanProductInput(validation); compatibilityErr != nil {
			fail(400, "分镜与商品结构不兼容："+compatibilityErr.Error())
			return
		}
		body.Facts = cleanSalesProductFacts(body.Facts)
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
		responses := body.APIFormat == "openai-responses"
		if responses {
			protocol = "openai"
		}
		presentationMode := body.PresentationMode
		if presentationMode != "clean_visual" {
			presentationMode = "subtitled_intro"
		}
		imitationMode := body.ImitationMode
		if imitationMode != "depth_imitation" {
			imitationMode = "script_only"
		}
		facts := map[string]any{
			"incompatibleSourceBeats": changes, "unresolved": body.Unresolved, "productName": body.ProductName, "brand": body.Brand,
			"category": body.Category, "summary": body.Summary, "facts": body.Facts, "buyingPoints": body.BuyingPoints, "cautions": body.Cautions,
			"scriptTitle": body.ScriptTitle, "oneTake": body.OneTake, "visualSpec": body.VisualSpec, "voiceMode": body.VoiceMode,
			"presentationMode": presentationMode, "imitationMode": imitationMode, "personaSummary": body.PersonaSummary,
			"personaPresence": body.PersonaPresence, "personaReferenceImageSupplied": body.PersonaReferenceImageURL != "",
			"sceneSummary": body.SceneSummary, "sourceExclusions": body.SourceExclusions, "beats": body.Beats,
		}
		systemPrompt := prompt.Prompt
		spokenVersion := ""
		if n := body.Narration; n != nil && presentationMode != "clean_visual" && body.VoiceMode != "none" {
			if n.Duration <= 0 || n.Duration > 600 || n.TargetCps < 2 || n.TargetCps > 4.6 || !boundedText(n.SourceCopy, 10000, false) {
				fail(400, "口播预算或确认文案无效")
				return
			}
			spoken, err := loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "spoken-copy")
			if err != nil {
				promptStorageFailure(w, err)
				return
			}
			window := spokenCopyInput{Duration: n.Duration, TargetCps: n.TargetCps}
			for _, beat := range body.Beats {
				window.Beats = append(window.Beats, spokenCopyBeatInput{Index: beat.Index, Start: beat.Start, End: beat.End})
			}
			facts["sourceCopy"], facts["timingBudget"] = n.SourceCopy, buildSpokenCopyBudget(window)
			facts["duration"], facts["targetCps"] = n.Duration, n.TargetCps
			systemPrompt += "\n\n口播字段规则：\n" + spoken.Prompt + "\n\n合并输出格式：使用分镜规则的完整 beats 结构，将口播与字幕填入同一 beat 的 spokenLine、subtitle，保留所有画面字段。"
			spokenVersion = spoken.Version
		}
		userInput, _ := json.Marshal(facts)
		content, imageErr := planPersonaContent(ctx, httpx.WorkspaceFrom(r), body, "分镜输入数据：\n"+string(userInput))
		if imageErr != nil {
			fail(400, imageErr.Error())
			return
		}
		payload := map[string]any{
			"model":           model,
			"max_tokens":      8000,
			"response_format": map[string]any{"type": "json_object"},
			"messages": []any{
				map[string]any{"role": "system", "content": systemPrompt},
				map[string]any{"role": "user", "content": content},
			},
		}
		requestID := httpx.RequestID()
		started := time.Now()
		status, data, err := complete(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol, Payload: payload, Client: gateway.ModelHTTP(), Timeout: 120 * time.Second}, responses)
		log.Printf("[sales-adapt] request=%s model=%q plan=%s spoken=%s elapsed_ms=%d", requestID, model, prompt.Version, spokenVersion, time.Since(started).Milliseconds())
		if err != nil || status < 200 || status >= 300 {
			failure := classifySummaryFailure(ctx, status, err, key)
			log.Printf("[sales-adapt] request=%s stage=%s code=%s status=%d", requestID, failure.Stage, failure.Code, status)
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": failure.Stage, "requestId": requestID})
			return
		}
		sourceFacts := salesProductEvidence(body.ProductName, body.Facts)
		beats, parseErr := parseAdaptedBeats(data, len(body.Beats), body.VoiceMode, presentationMode, sourceFacts, body.SourceExclusions, body.ProductName, performance)
		if parseErr == nil {
			parseErr = validateAdaptedPerformance(beats, performance)
		}
		if parseErr == nil {
			parseErr = validatePlanProductOutput(beats, body)
		}
		var personaVisual *planPersonaVisualProfile
		if parseErr == nil {
			personaVisual, parseErr = parsePlanPersonaVisual(data, body)
		}
		if parseErr != nil {
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "分镜改编未通过校验：" + parseErr.Error(), "code": "adapt_validation", "requestId": requestID})
			return
		}
		result := map[string]any{"success": true, "beats": beats, "model": model, "promptVersion": prompt.Version, "spokenCopyPromptVersion": spokenVersion}
		if personaVisual != nil {
			result["personaVisualProfile"] = personaVisual
		}
		httpx.WriteJSON(w, 200, result)
	}
}

func scrubAdaptedTerms(text string, exclusions []planSourceExclusion, productName string) string {
	out, fallback := strings.TrimSpace(text), strings.TrimSpace(productName)
	if fallback == "" {
		fallback = "当前商品"
	}
	for _, exclusion := range exclusions {
		term := strings.TrimSpace(exclusion.Term)
		if len([]rune(term)) >= 2 && strings.Contains(out, term) && !strings.Contains(fallback, term) {
			replacement := ""
			if exclusion.Type == "product" {
				replacement = fallback
			}
			out = strings.ReplaceAll(out, term, replacement)
		}
	}
	return strings.TrimSpace(out)
}

func parseAdaptedBeats(data map[string]any, expected int, voiceMode, presentationMode, sourceFacts string, exclusions []planSourceExclusion, productName string, source []planAdaptBeatInput) ([]adaptedBeatOutput, error) {
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
		// Product copy may change, but the reference performance remains authoritative.
		// Older callers without a reference action retain the model's performance fields.
		if i < len(source) && strings.TrimSpace(source[i].RefAction) != "" {
			beats[i].Action = source[i].RefAction
			beats[i].Expression = source[i].Expression
			beats[i].Transition = source[i].Transition
		}
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
		if strings.TrimSpace(source[i].RefAction) != "" {
			continue
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
