package sales

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

//go:embed spoken-copy.md
var spokenCopyPrompt string

type spokenCopyBeatInput struct {
	Index             int     `json:"index"`
	Start             float64 `json:"start"`
	End               float64 `json:"end"`
	ShotIndex         *int    `json:"shotIndex,omitempty"`
	ShotSize          string  `json:"shotSize,omitempty"`
	Camera            string  `json:"camera,omitempty"`
	RequiredView      string  `json:"requiredView,omitempty"`
	AssignedView      string  `json:"assignedView,omitempty"`
	Subject           string  `json:"subject,omitempty"`
	Purpose           string  `json:"purpose,omitempty"`
	BuyingPoint       string  `json:"buyingPoint,omitempty"`
	Action            string  `json:"action"`
	Expression        string  `json:"expression,omitempty"`
	Transition        string  `json:"transition,omitempty"`
	SpokenLine        string  `json:"spokenLine"`
	Subtitle          string  `json:"subtitle"`
	SourceVoiceText   string  `json:"sourceVoiceText,omitempty"`
	SourceLinePattern string  `json:"sourceLinePattern,omitempty"`
	SourceSubtitle    string  `json:"sourceSubtitle,omitempty"`
}

type spokenCopyInput struct {
	Unresolved       []string              `json:"unresolved,omitempty"`
	ProductName      string                `json:"productName"`
	Summary          string                `json:"summary"`
	Facts            string                `json:"facts"`
	BuyingPoints     []string              `json:"buyingPoints"`
	Cautions         []string              `json:"cautions"`
	SourceExclusions []planSourceExclusion `json:"sourceExclusions,omitempty"`
	SourceCopy       string                `json:"sourceCopy"`
	VoiceMode        string                `json:"voiceMode"`
	Duration         float64               `json:"duration"`
	TargetCps        float64               `json:"targetCps"`
	Beats            []spokenCopyBeatInput `json:"beats"`
}

type spokenCopyRequest struct {
	spokenCopyInput
	ReviewOnly        bool   `json:"reviewOnly"`
	Model             string `json:"model"`
	CustomBaseURL     string `json:"customBaseUrl"`
	CustomAPIKey      string `json:"customApiKey"`
	TextProtocol      string `json:"textProtocol"`
	APIFormat         string `json:"apiFormat"`
	AllowInsecureHTTP bool   `json:"allowInsecureHttp"`
}

type spokenCopyBeatOutput struct {
	Index      int    `json:"index"`
	SpokenLine string `json:"spokenLine"`
	Subtitle   string `json:"subtitle"`
}

const (
	spokenCopyCallTimeout = 120 * time.Second
	spokenCopyTaskTimeout = 6 * time.Minute
)

func SpokenCopy(cfg config.Config) http.HandlerFunc {
	return spokenCopyHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if responses {
			return gateway.CompleteResponses(ctx, req)
		}
		return gateway.CompleteText(ctx, req)
	})
}

func spokenCopyHandler(cfg config.Config, complete summaryCompleter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body spokenCopyRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "口播时长适配请求格式错误或资料过长"})
			return
		}
		if body.TargetCps == 0 {
			body.TargetCps = 3.8
		}
		body.Facts = cleanSalesProductFacts(body.Facts)
		if err := validateSpokenCopyInput(body); err != nil {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, map[string]any{"textProtocol": body.TextProtocol})
		if !ok {
			return
		}
		base, key, model, credentialErr := summaryCredentials(cfg, r, summaryRequest{Model: body.Model, CustomBaseURL: body.CustomBaseURL, CustomAPIKey: body.CustomAPIKey, APIFormat: body.APIFormat, AllowInsecureHTTP: body.AllowInsecureHTTP})
		if credentialErr != "" {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": credentialErr})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), spokenCopyTaskTimeout)
		defer cancel()
		var prompt salesPrompt
		if !body.ReviewOnly {
			var err error
			prompt, err = loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "spoken-copy")
			if err != nil {
				promptStorageFailure(w, err)
				return
			}
		}
		reviewPrompt, err := loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "spoken-review")
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		userInput, _ := json.Marshal(struct {
			spokenCopyInput
			TimingBudget spokenCopyBudget `json:"timingBudget"`
		}{body.spokenCopyInput, buildSpokenCopyBudget(body.spokenCopyInput)})
		protocol := gateway.TextProtocolForBase(ctx, model, base)
		responses := body.APIFormat == "openai-responses"
		if responses {
			protocol = "openai"
		}
		messages := []any{
			map[string]any{"role": "system", "content": prompt.Prompt},
			map[string]any{"role": "user", "content": "口播输入数据：\n" + string(userInput)},
		}
		payload := map[string]any{"model": model, "max_tokens": 5000, "response_format": map[string]any{"type": "json_object"}, "messages": messages}
		request := gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol, Client: gateway.ModelHTTP(), Timeout: spokenCopyCallTimeout}
		requestID := httpx.RequestID()
		calls := 0
		call := func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
			calls++
			started := time.Now()
			status, data, err := complete(ctx, req, responses)
			log.Printf("[sales-spoken] request=%s call=%d model=%q writer=%s reviewer=%s elapsed_ms=%d status=%d", requestID, calls, model, prompt.Version, reviewPrompt.Version, time.Since(started).Milliseconds(), status)
			return status, data, err
		}
		if body.ReviewOnly {
			reviewExistingSpokenCopy(w, ctx, call, request, responses, body.spokenCopyInput, prompt, reviewPrompt, requestID, model)
			return
		}
		for attempt := 1; attempt <= spokenCopyMaxAttempts; attempt++ {
			request.Payload = payload
			status, data, callErr := completeSpokenCopy(ctx, call, request, responses)
			if callErr != nil || status < 200 || status >= 300 {
				failure := classifySummaryFailure(ctx, status, callErr, key)
				log.Printf("[sales-spoken-copy] request=%s stage=%s code=%s status=%d", requestID, failure.Stage, failure.Code, status)
				httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "口播改写未完成，原稿已保留：" + failure.Message, "code": failure.Code, "stage": "rewrite", "requestId": requestID})
				return
			}
			beats, timing, validationErr := parseSpokenCopy(data, body.spokenCopyInput)
			if validationErr == nil {
				review, failure := reviewSpokenDraft(ctx, call, request, responses, reviewPrompt.Prompt, model, body.spokenCopyInput, beats)
				if failure != nil {
					result := map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": "review", "requestId": requestID}
					// A transient reviewer failure must not silently approve the draft.
					// Return it separately so the caller can retry only its review.
					if failure.Retryable && r.Context().Err() == nil {
						result["pendingReview"] = map[string]any{"beats": beats, "timing": timing, "promptVersion": prompt.Version}
					}
					httpx.WriteJSON(w, 502, result)
					return
				}
				if review.Approved {
					httpx.WriteJSON(w, 200, map[string]any{"success": true, "beats": beats, "timing": timing, "model": model, "promptVersion": prompt.Version, "reviewPromptVersion": reviewPrompt.Version})
					return
				}
				validationErr = review.validationError()
			}
			err = validationErr
			if attempt < spokenCopyMaxAttempts {
				payload["messages"] = append(messages[:len(messages):len(messages)], spokenCopyRetryMessage(data, validationErr, attempt+1))
			}
		}
		httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "口播已自动优化3次，仍未通过校验：" + err.Error(), "code": "spoken_copy_validation", "stage": "rewrite", "requestId": requestID})
	}
}

func completeSpokenCopy(ctx context.Context, complete summaryCompleter, request gateway.TextRequest, responses bool) (int, map[string]any, error) {
	// Writing and review run serially. Give each call its own bounded budget,
	// while preserving the task deadline and the user's cancellation.
	if request.Timeout <= 0 {
		request.Timeout = spokenCopyCallTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, request.Timeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return 0, nil, err
	}
	status, data, err := complete(ctx, request, responses)
	if ctx.Err() != nil {
		return status, nil, ctx.Err()
	}
	var invalidJSON *gateway.TextJSONError
	if status >= 200 && status < 300 && errors.As(err, &invalidJSON) {
		return status, invalidJSON.Response, nil
	}
	return status, data, err
}

const spokenCopyMaxCps = 4.6

type spokenCopyBeatBudget struct {
	Index            int `json:"index"`
	RecommendedChars int `json:"recommendedChars"`
	MaxChars         int `json:"maxChars"`
}

type spokenCopyBudget struct {
	RecommendedChars int                    `json:"recommendedChars"`
	TotalMaxChars    int                    `json:"totalMaxChars"`
	Beats            []spokenCopyBeatBudget `json:"beats"`
}

type spokenCopyTiming struct {
	SpokenChars       int     `json:"spokenChars"`
	EstimatedSpeakSec float64 `json:"estimatedSpeakSec"`
	TargetCps         float64 `json:"targetCps"`
	Duration          float64 `json:"duration"`
}

func validateSpokenCopyInput(body spokenCopyRequest) error {
	if body.VoiceMode != "speech" && body.VoiceMode != "voiceover" {
		return errors.New("口播时长适配仅适用于真人口播或画外旁白")
	}
	if !boundedText(body.Model, 200, true) || !boundedText(body.ProductName, 2000, false) || !boundedText(body.Summary, 2000, false) || !boundedText(body.Facts, 20000, false) || !boundedText(body.SourceCopy, 10000, false) {
		return errors.New("请选择改写模型，并将商品资料和原文案控制在长度限制内")
	}
	if strings.TrimSpace(body.ProductName+body.SourceCopy+body.Facts+body.Summary+strings.Join(body.BuyingPoints, "")) == "" {
		return errors.New("请先填写商品推荐文案、买点或已核实资料")
	}
	if len(body.BuyingPoints) > 12 || len(body.Cautions) > 12 {
		return errors.New("商品买点与使用限制分别最多12项")
	}
	if len(body.SourceExclusions) > 40 {
		return errors.New("原片剥离词最多40项")
	}
	for _, item := range append(append([]string{}, body.BuyingPoints...), body.Cautions...) {
		if !boundedText(item, 1000, false) {
			return errors.New("单项商品买点或使用限制不得超过1000字")
		}
	}
	if len(body.CustomBaseURL) > 8192 || len(body.CustomAPIKey) > 8192 || (body.APIFormat != "" && body.APIFormat != "openai-responses") {
		return errors.New("模型渠道配置无效")
	}
	if math.IsNaN(body.Duration) || math.IsInf(body.Duration, 0) || body.Duration <= 0 || body.Duration > 600 || body.TargetCps < 2 || body.TargetCps > spokenCopyMaxCps || math.IsNaN(body.TargetCps) || math.IsInf(body.TargetCps, 0) {
		return errors.New("视频时长需在0—600秒之间，目标语速需在2—4.6字/秒之间")
	}
	if len(body.Beats) == 0 || len(body.Beats) > 24 {
		return errors.New("口播分镜数量需在1—24段之间")
	}
	for i, beat := range body.Beats {
		if beat.Index != i || beat.Start < 0 || beat.End <= beat.Start || beat.End > body.Duration+0.05 || (i > 0 && beat.Start < body.Beats[i-1].End-0.001) {
			return fmt.Errorf("口播分镜%d的编号或时间范围无效，请核对视频时长", i+1)
		}
		if beat.ShotIndex != nil && *beat.ShotIndex < 0 {
			return fmt.Errorf("口播分镜%d的镜头编号无效", i+1)
		}
		if !boundedText(beat.ShotSize, 200, false) || !boundedText(beat.Camera, 1000, false) || !boundedText(beat.RequiredView, 80, false) || !boundedText(beat.AssignedView, 80, false) || !boundedText(beat.Subject, 2000, false) {
			return fmt.Errorf("口播分镜%d的镜头内容过长", i+1)
		}
		if !boundedText(beat.Purpose, 200, false) || !boundedText(beat.BuyingPoint, 1000, false) || !boundedText(beat.Action, 2000, false) || !boundedText(beat.Expression, 600, false) || !boundedText(beat.Transition, 400, false) || !boundedText(beat.SpokenLine, 2000, false) || !boundedText(beat.Subtitle, 1000, false) || !boundedText(beat.SourceVoiceText, 1000, false) || !boundedText(beat.SourceLinePattern, 600, false) || !boundedText(beat.SourceSubtitle, 400, false) {
			return fmt.Errorf("口播分镜%d的内容过长", i+1)
		}
	}
	return nil
}

func buildSpokenCopyBudget(input spokenCopyInput) spokenCopyBudget {
	budget := spokenCopyBudget{RecommendedChars: int(math.Floor(input.Duration * input.TargetCps * 0.9)), TotalMaxChars: int(math.Floor(input.Duration * input.TargetCps)), Beats: make([]spokenCopyBeatBudget, len(input.Beats))}
	for i, beat := range input.Beats {
		seconds := beat.End - beat.Start
		budget.Beats[i] = spokenCopyBeatBudget{Index: beat.Index, RecommendedChars: int(math.Floor(seconds * input.TargetCps * 0.9)), MaxChars: int(math.Floor(seconds * input.TargetCps))}
	}
	return budget
}

// Match the existing narration and per-beat display count; this is an estimate,
// not the measured length of a generated voice track.
func spokenCopyCharCount(text string) int {
	count := 0
	for _, char := range text {
		if !unicode.IsSpace(char) && !strings.ContainsRune("，。！？、；：“”‘’,.!?;:\"'()（）-", char) {
			count++
		}
	}
	return count
}

func parseSpokenCopy(data map[string]any, input spokenCopyInput) ([]spokenCopyBeatOutput, spokenCopyTiming, error) {
	timing := spokenCopyTiming{TargetCps: input.TargetCps, Duration: input.Duration}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, timing, errors.New("模型没有返回口播文案")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	if choice["finish_reason"] != "stop" || message["refusal"] != nil && message["refusal"] != "" {
		return nil, timing, errors.New("模型返回未完成或被截断，请重试；未接收不完整文案")
	}
	text, _ := message["content"].(string)
	object := gateway.DecodeObject(text)
	if object == nil {
		return nil, timing, errors.New("返回内容不是合法JSON")
	}
	raw, _ := json.Marshal(object["beats"])
	var indexed []struct {
		Index      *int    `json:"index"`
		SpokenLine *string `json:"spokenLine"`
		Subtitle   *string `json:"subtitle"`
	}
	if json.Unmarshal(raw, &indexed) != nil || len(indexed) != len(input.Beats) {
		return nil, timing, fmt.Errorf("口播分镜数量不匹配（期望%d段）", len(input.Beats))
	}
	beats, seen := make([]spokenCopyBeatOutput, len(indexed)), make(map[int]bool, len(indexed))
	budget := buildSpokenCopyBudget(input)
	sourceFacts := salesProductEvidence(input.ProductName, input.Facts)
	var issues []error
	for _, beat := range indexed {
		if beat.Index == nil || *beat.Index < 0 || *beat.Index >= len(beats) || seen[*beat.Index] || beat.SpokenLine == nil || beat.Subtitle == nil {
			return nil, timing, errors.New("分镜编号缺失、重复、越界，或台词与字幕不是字符串")
		}
		index := *beat.Index
		seen[index] = true
		line, subtitle := strings.TrimSpace(*beat.SpokenLine), strings.TrimSpace(*beat.Subtitle)
		for _, exclusion := range input.SourceExclusions {
			term := strings.TrimSpace(exclusion.Term)
			if len([]rune(term)) >= 2 && !strings.Contains(sourceFacts, term) && strings.Contains(line+" "+subtitle, term) {
				issues = append(issues, fmt.Errorf("分镜%d包含未在当前商品资料中确认的原片内容「%s」", index+1, term))
			}
		}
		if !boundedText(line, 2000, false) || !boundedText(subtitle, 1000, false) || line == "" && subtitle != "" {
			issues = append(issues, fmt.Errorf("分镜%d的台词或字幕无效，空台词不能单独增加字幕", index+1))
		}
		chars := spokenCopyCharCount(line)
		if chars > budget.Beats[index].MaxChars {
			issues = append(issues, fmt.Errorf("分镜%d台词%d字，超过%.1f秒的自然语速上限%d字", index+1, chars, input.Beats[index].End-input.Beats[index].Start, budget.Beats[index].MaxChars))
		}
		if match := summaryPromises.FindString(line + " " + subtitle); match != "" && !strings.Contains(sourceFacts, match) {
			issues = append(issues, fmt.Errorf("分镜%d含未经证实的承诺表述「%s」", index+1, match))
		}
		if err := validateSalesProductPartFacts(index, line+" "+subtitle, sourceFacts); err != nil {
			issues = append(issues, err)
		}
		beats[index] = spokenCopyBeatOutput{Index: index, SpokenLine: line, Subtitle: subtitle}
		timing.SpokenChars += chars
	}
	if timing.SpokenChars == 0 {
		issues = append(issues, errors.New("未生成有效口播台词，请检查原文案和商品资料后重试"))
	}
	if timing.SpokenChars > budget.TotalMaxChars {
		issues = append(issues, fmt.Errorf("总台词%d字超过%.1f秒的自然语速上限%d字", timing.SpokenChars, input.Duration, budget.TotalMaxChars))
	}
	if len(issues) > 0 {
		return nil, timing, errors.Join(issues...)
	}
	timing.EstimatedSpeakSec = math.Round(float64(timing.SpokenChars)/input.TargetCps*10) / 10
	return beats, timing, nil
}

const spokenCopyMaxAttempts = 3

// Keep the original facts, timeline, budget and saved system prompt intact. Only
// the latest rejected draft is sent back as data so failed attempts do not grow
// the conversation or become a new source of product claims.
func spokenCopyRetryMessage(data map[string]any, validationErr error, attempt int) map[string]any {
	var previous string
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			if message, ok := choice["message"].(map[string]any); ok {
				previous, _ = message["content"].(string)
			}
		}
	}
	feedback, _ := json.Marshal(struct {
		Attempt         int    `json:"attempt"`
		ValidationError string `json:"validationError"`
		PreviousOutput  string `json:"previousOutput"`
	}{attempt, validationErr.Error(), previous})
	return map[string]any{"role": "user", "content": "自动校验反馈数据：\n" + string(feedback)}
}
