package generate

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
)

func comflyJSONEdit(model string) bool {
	switch strings.ToLower(model) {
	case "gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "grok-imagine-image", "grok-imagine-image-quality", "grok-imagine-image-2.0", "grok-4.1-image", "grok-4.2-image":
		return true
	}
	return false
}

func submitUnifiedImageEdit(req imageRequest, a imageAdapted) (imageSubmitResult, error) {
	refs, err := dashscopeImageRefs(req)
	if err != nil {
		return imageSubmitResult{}, err
	}
	a.useEdits = true
	a.endpoint = "edits"
	delete(a.payload, "image")
	switch {
	case req.Model == "gpt-image-2":
		a.payload["images"] = refs
	case req.Model == "grok-imagine-image":
		a.payload["image"] = refs
	case len(refs) == 1:
		a.payload["image"] = refs[0]
	default:
		a.payload["images"] = refs
	}
	if isGptImageModel(req.Model) {
		delete(a.payload, "n")
	}
	endpoint := gateway.NormalizeGatewayBaseURL(req.Base) + "/v1/images/edits"
	status, raw, err := gateway.PostModel(req.context(), http.MethodPost, endpoint, req.APIKey, a.payload, 180*time.Second)
	if err != nil {
		return imageSubmitResult{}, err
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	// Some Comfly channels expose the OpenAI multipart edit endpoint at the same URL.
	// Retry only an explicit form-parser rejection, never an uncertain submission.
	if req.Model == "gpt-image-2" && status >= 400 && data["task_id"] == nil && data["id"] == nil &&
		data["data"] == nil && strings.Contains(strings.ToLower(imageUpstreamError(data, status)), "failed to parse multipart form") {
		delete(a.payload, "images")
		a.payload["image"] = req.Refs
		status, raw, err = postImageEdit(req.context(), endpoint+"?async=true", req.APIKey, a.payload, req.Workspace, req.Production, 180*time.Second)
		if err != nil {
			return imageSubmitResult{}, err
		}
		data = map[string]any{}
		_ = json.Unmarshal(raw, &data)
	}
	task, direct := imageOutcome(data)
	return imageSubmitResult{Status: status, Data: data, TaskID: task, Direct: direct, Adapted: a}, nil
}

// The Comfly 2K and 4K Nano Banana 2 channels use tier-specific model IDs.
func comflyGeminiImageModel(base, model, tier string) string {
	if imageHostIs(base, "comfly.org") && (model == "gemini-3.1-flash-image" || model == "gemini-3.1-flash-image-preview" || model == "nano-banana-2") && (tier == "2K" || tier == "4K") {
		return "gemini-3.1-flash-image-preview-" + strings.ToLower(tier)
	}
	return model
}
