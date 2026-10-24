package generate

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/system"
)

type openaiImageProtocol struct{}

func (openaiImageProtocol) ID() string { return "openai" }

func (openaiImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	adapted := buildImagePayloadWithAspect(req.Model, req.Prompt, req.Size, req.AspectRatio, req.Quality, req.ImageQuality, req.Refs)
	if !adapted.useEdits && len(req.Refs) > 0 {
		resolved, err := dashscopeImageRefs(req)
		if err != nil {
			return imageSubmitResult{}, err
		}
		if len(resolved) > 0 {
			adapted.payload["image"] = resolved
		}
	}
	status, data, err := dispatchImage(req.httpRequest(), imageSubmitURLs(req.Base, adapted.useEdits, adapted.family, req.Model), req.APIKey, adapted.payload, req.Workspace, req.Production)
	if err != nil {
		return imageSubmitResult{}, err
	}
	if adapted.family == "gemini-nano" && gateway.CanTryAnotherEndpoint(status) {
		return geminiImageProtocol{}.Submit(req)
	}
	taskID, direct := imageOutcome(data)
	return imageSubmitResult{Status: status, Data: data, TaskID: taskID, Direct: direct, Adapted: adapted}, nil
}

func (openaiImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(req.Base), "/")
	taskID := req.TaskID
	urls := []string{
		root + "/v1/images/tasks/" + taskID,
		root + "/v1/tasks/" + taskID,
		root + "/v1/images/generations/" + taskID,
		root + "/v1/images/" + taskID,
		root + "/v1/query/image_generation?task_id=" + taskID,
	}
	for _, endpoint := range urls {
		status, raw, err := PostModel(req.context(), http.MethodGet, endpoint, req.APIKey, nil, 3500*time.Millisecond)
		if err != nil || status < 200 || status >= 300 {
			continue
		}
		var data map[string]any
		if json.Unmarshal(raw, &data) != nil {
			continue
		}
		parsed, ok := parseImagePoll(data)
		if !ok {
			continue
		}
		return parsed, data, true
	}
	return pollParsed{}, nil, false
}
