package sales

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

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
