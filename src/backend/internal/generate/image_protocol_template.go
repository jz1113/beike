package generate

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

const imageTemplateMaxBytes = 32 << 10

type templateImageProtocol struct{}

type imageTemplateSpec struct {
	Submit templateCall `json:"submit"`
	Result struct {
		ImageURLPath string `json:"imageUrlPath"`
		TaskIDPath   string `json:"taskIdPath"`
	} `json:"result"`
	Poll *templatePoll `json:"poll"`
}

type templateCall struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type templatePoll struct {
	URL           string   `json:"url"`
	StatusPath    string   `json:"statusPath"`
	ImageURLPath  string   `json:"imageUrlPath"`
	SuccessValues []string `json:"successValues"`
	FailureValues []string `json:"failureValues"`
	ErrorPath     string   `json:"errorPath"`
}

func (templateImageProtocol) ID() string { return "template" }

func (templateImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	adapted := imageAdapted{family: "template", modelID: req.Model, prompt: req.Prompt, size: req.Size, endpoint: "template"}
	spec, err := parseImageTemplate(req.Template)
	if err != nil {
		return imageSubmitResult{Status: http.StatusBadRequest, Data: map[string]any{"message": err.Error()}, Adapted: adapted}, nil
	}
	images, prepareErr := dashscopeImageRefs(req)
	if prepareErr != nil {
		return imageSubmitResult{}, prepareErr
	}
	renderedURL, headers, body, renderErr := renderTemplateCall(spec.Submit, templateVars(req, images, ""), req.APIKey)
	if renderErr != nil {
		return imageSubmitResult{Status: http.StatusBadRequest, Data: map[string]any{"message": renderErr.Error()}, Adapted: adapted}, nil
	}
	var payload any
	if strings.TrimSpace(body) != "" {
		payload = json.RawMessage(body)
	}
	status, raw, callErr := PostModelHeaders(req.context(), spec.Submit.methodOrPost(), renderedURL, req.APIKey, payload, 180*time.Second, headers)
	if callErr != nil {
		return imageSubmitResult{}, callErr
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	direct := templateString(data, spec.Result.ImageURLPath)
	taskID := templateString(data, spec.Result.TaskIDPath)
	if taskID != "" {
		rememberImageTemplate(req.Base, taskID, req.Template)
	}
	if status < 200 || status >= 300 {
		if data["message"] == nil {
			data["message"] = imageUpstreamError(data, status)
		}
	}
	return imageSubmitResult{Status: status, Data: data, TaskID: taskID, Direct: direct, Adapted: adapted}, nil
}

func (templateImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	spec, err := parseImageTemplate(req.Template)
	if err != nil || spec.Poll == nil || strings.TrimSpace(spec.Poll.URL) == "" {
		return pollParsed{}, nil, false
	}
	renderedURL, headers, _, renderErr := renderTemplateCall(templateCall{Method: http.MethodGet, URL: spec.Poll.URL}, templateVars(imageRequest{Model: req.Model}, nil, req.TaskID), req.APIKey)
	if renderErr != nil {
		return pollParsed{}, nil, false
	}
	status, raw, callErr := PostModelHeaders(req.context(), http.MethodGet, renderedURL, req.APIKey, nil, 8*time.Second, headers)
	if callErr != nil || status < 200 || status >= 300 {
		return pollParsed{}, nil, false
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return pollParsed{}, nil, false
	}
	image := templateString(data, spec.Poll.ImageURLPath)
	state := strings.ToUpper(templateString(data, spec.Poll.StatusPath))
	if templateListed(spec.Poll.SuccessValues, state) || (state == "" && image != "") {
		if image == "" {
			return pollParsed{status: "IN_PROGRESS"}, data, true
		}
		return pollParsed{status: "SUCCESS", result: image, progress: "100%"}, data, true
	}
	if templateListed(spec.Poll.FailureValues, state) {
		reason := templateString(data, spec.Poll.ErrorPath)
		if reason == "" {
			reason = "上游明确返回任务失败"
		}
		return pollParsed{status: "FAILURE", reason: reason, progress: "0%"}, data, true
	}
	if state != "" || image == "" {
		return pollParsed{status: "IN_PROGRESS", progress: "50%"}, data, true
	}
	return pollParsed{status: "SUCCESS", result: image, progress: "100%"}, data, true
}

func (call templateCall) methodOrPost() string {
	method := strings.ToUpper(strings.TrimSpace(call.Method))
	if method == "" {
		return http.MethodPost
	}
	return method
}

func parseImageTemplate(raw json.RawMessage) (imageTemplateSpec, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return imageTemplateSpec{}, imageEditPrepareError{"缺少请求模板"}
	}
	if len(raw) > imageTemplateMaxBytes {
		return imageTemplateSpec{}, imageEditPrepareError{"请求模板超过 32KB"}
	}
	var spec imageTemplateSpec
	if json.Unmarshal(raw, &spec) != nil || strings.TrimSpace(spec.Submit.URL) == "" {
		return imageTemplateSpec{}, imageEditPrepareError{"请求模板格式无效"}
	}
	return spec, nil
}

type templateValue struct {
	raw  bool
	text string
}

func templateVars(req imageRequest, images []string, taskID string) map[string]templateValue {
	width, height, _ := dashscopePixelPair(strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(req.Size, "*", "x"), "×", "x")))
	encodedImages, _ := json.Marshal(images)
	if images == nil {
		encodedImages = []byte("[]")
	}
	return map[string]templateValue{
		"model":          {text: req.Model},
		"prompt":         {text: req.Prompt},
		"size":           {text: req.Size},
		"width":          {raw: true, text: strconv.Itoa(width)},
		"height":         {raw: true, text: strconv.Itoa(height)},
		"n":              {raw: true, text: "1"},
		"images":         {raw: true, text: string(encodedImages)},
		"negativePrompt": {text: req.Negative},
		"taskId":         {text: taskID},
	}
}

func renderTemplateCall(call templateCall, vars map[string]templateValue, apiKey string) (string, map[string]string, string, error) {
	renderedURL, err := renderTemplateText(call.URL, vars)
	if err != nil {
		return "", nil, "", err
	}
	if !safeTemplateURL(renderedURL) {
		return "", nil, "", imageEditPrepareError{"请求模板地址必须是公网 HTTPS"}
	}
	headers := map[string]string{}
	for key, value := range call.Headers {
		if strings.EqualFold(key, "Host") || strings.EqualFold(key, "Cookie") {
			continue
		}
		rendered, headerErr := renderTemplateText(strings.ReplaceAll(value, "{{apiKey}}", apiKey), vars)
		if headerErr != nil {
			return "", nil, "", headerErr
		}
		headers[key] = rendered
	}
	body := ""
	if strings.TrimSpace(call.Body) != "" {
		body, err = renderTemplateText(call.Body, vars)
		if err != nil {
			return "", nil, "", err
		}
		if !json.Valid([]byte(body)) {
			return "", nil, "", imageEditPrepareError{"请求模板渲染后不是合法 JSON"}
		}
	}
	return renderedURL, headers, body, nil
}

func renderTemplateText(text string, vars map[string]templateValue) (string, error) {
	if strings.Contains(text, "{{apiKey}}") {
		return "", imageEditPrepareError{"API 密钥只能写在请求头"}
	}
	pairs := make([]string, 0, len(vars)*2)
	for key, value := range vars {
		token := "{{" + key + "}}"
		if !strings.Contains(text, token) {
			continue
		}
		if value.raw {
			pairs = append(pairs, token, value.text)
			continue
		}
		pairs = append(pairs, token, jsonStringContent(value.text))
	}
	if len(pairs) == 0 {
		return text, nil
	}
	return strings.NewReplacer(pairs...).Replace(text), nil
}

func jsonStringContent(value string) string {
	raw, err := json.Marshal(value)
	if err != nil || len(raw) < 2 {
		return ""
	}
	return string(raw[1 : len(raw)-1])
}

func safeTemplateURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return false
	}
	return system.SafeHTTPSGateway("https://" + parsed.Host)
}

func templateString(data map[string]any, path string) string {
	value := lookupTemplatePath(data, path)
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func lookupTemplatePath(data any, path string) any {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	current := data
	for _, part := range strings.Split(path, ".") {
		switch node := current.(type) {
		case map[string]any:
			current = node[part]
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(node) {
				return nil
			}
			current = node[index]
		default:
			return nil
		}
	}
	return current
}

func templateListed(values []string, state string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), state) && state != "" {
			return true
		}
	}
	return false
}
