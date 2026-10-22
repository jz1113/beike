package review

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/modelgw"
)

const (
	maxTokens    = 12288
	reasonMax    = 18
	rejectMax    = 24
	expansionMax = 120
)

type RuleEntry struct {
	Section string
	Text    string
	Mode    string
}

type Row struct {
	ID              string
	Query           string
	Expansion       *string
	EntityExpansion *string
	ContentType     *string
}

type Result struct {
	Results []map[string]any
	Failed  []string
	Usage   json.RawMessage
	Model   string
}

type UpstreamError struct {
	Status   int
	Provider string
	Body     map[string]any
	Message  string
}

func (e *UpstreamError) Error() string { return "upstream" }

type OutputError struct {
	Message string
	Usage   json.RawMessage
}

func (e *OutputError) Error() string { return e.Message }

type Input struct {
	TextProtocol    string
	BaseURL         string
	APIKey          string
	Model           string
	Provider        string
	Mode            string
	ReasoningEffort string
	Rows            []Row
	Rules           []RuleEntry
}

func Review(ctx context.Context, client *http.Client, input Input) (Result, error) {
	mode := input.Mode
	if mode == "" {
		mode = "image"
	}
	effort := concreteReasoningEffort(input.ReasoningEffort)
	requestBody := chatRequest{
		Model: input.Model, Temperature: 0.1, MaxTokens: maxTokens, ReasoningEffort: effort,
		ResponseFormat: map[string]string{"type": "json_object"},
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt(mode, true, input.Rules)},
			{Role: "user", Content: "请审核以下行：\n" + marshalText(modelRows(input.Rows))},
		},
	}
	if effort == "" && disableThinking(input) {
		requestBody.Thinking = &chatThinking{Type: "disabled"}
	}
	body, err := marshalTextBytes(requestBody)
	if err != nil {
		return Result{}, err
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{}, err
	}
	protocol := modelgw.TextProtocol(ctx, input.Model)
	if input.TextProtocol != "" {
		protocol = modelgw.ResolveTextProtocol(input.Model, input.TextProtocol)
	}
	status, data, callErr := modelgw.CompleteText(ctx, modelgw.TextRequest{
		BaseURL: input.BaseURL, APIKey: input.APIKey, Protocol: protocol, Payload: payload,
		Client: client, Timeout: 630 * time.Second,
	})
	provider := "DeepSeek"
	if input.Provider == "gateway" {
		provider = "模型网关"
	}
	if status != 0 && (status < 200 || status >= 300) {
		return Result{}, &UpstreamError{Status: status, Provider: provider, Body: data}
	}
	if callErr != nil {
		if status == 0 {
			return Result{}, callErr
		}
		return Result{}, &UpstreamError{Status: 502, Provider: provider, Message: "模型服务响应传输异常，提交结果待核对"}
	}
	usage, _ := json.Marshal(data["usage"])
	if data["usage"] == nil {
		usage = nil
	}
	parsed, partial, err := readModelPayload(data, input.Model)
	if err != nil {
		return Result{}, &OutputError{Message: err.Error(), Usage: usage}
	}
	checked, err := validateResults(remapIDs(expandCompact(parsed, mode), input.Rows), input.Rows, mode)
	if err != nil {
		return Result{}, &OutputError{Message: err.Error(), Usage: usage}
	}
	if partial && len(checked.results) == 0 {
		return Result{}, &OutputError{Message: fmt.Sprintf("关键词审核模型 %s 输出被截断，本批结果未写入", input.Model), Usage: usage}
	}
	return Result{Results: stripLookup(checked.results), Failed: checked.failed, Usage: usage, Model: input.Model}, nil
}

func concreteReasoningEffort(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "medium", "high", "xhigh":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func disableThinking(input Input) bool {
	return input.Provider != "gateway" || strings.HasPrefix(input.Model, "deepseek-")
}

type chatRequest struct {
	Model           string            `json:"model"`
	Temperature     float64           `json:"temperature"`
	MaxTokens       int               `json:"max_tokens"`
	Thinking        *chatThinking     `json:"thinking,omitempty"`
	ReasoningEffort string            `json:"reasoning_effort,omitempty"`
	ResponseFormat  map[string]string `json:"response_format"`
	Messages        []chatMessage     `json:"messages"`
}

type chatThinking struct {
	Type string `json:"type"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type promptRow struct {
	ID              string  `json:"id"`
	Query           string  `json:"query"`
	Expansion       *string `json:"expansion,omitempty"`
	EntityExpansion *string `json:"entityExpansion,omitempty"`
	ContentType     *string `json:"contentType,omitempty"`
}

func modelRows(rows []Row) []promptRow {
	items := make([]promptRow, len(rows))
	for index, row := range rows {
		item := promptRow{ID: itoa(index + 1), Query: row.Query}
		item.Expansion = clippedOptional(row.Expansion, expansionMax)
		item.EntityExpansion = clippedOptional(row.EntityExpansion, expansionMax)
		item.ContentType = clippedOptional(row.ContentType, 40)
		items[index] = item
	}
	return items
}

func expandCompact(value any, mode string) any {
	object, ok := value.(map[string]any)
	if !ok {
		return value
	}
	items, ok := object["results"].([]any)
	if !ok {
		return value
	}
	fields := []string{"id", "category", "producible", "categoryReason", "rejectReason"}
	if mode == "video" {
		fields = []string{"id", "category", "producible", "lowValue", "categoryReason", "rejectReason"}
	}
	expanded := make([]any, len(items))
	for index, item := range items {
		row, ok := item.([]any)
		if !ok {
			expanded[index] = item
			continue
		}
		id, idOK := compactID(row)
		if !idOK || len(row) < len(fields)-1 || len(row) > len(fields) {
			expanded[index] = map[string]any{"id": id}
			continue
		}
		mapped := map[string]any{}
		for fieldIndex, field := range fields {
			if fieldIndex < len(row) {
				mapped[field] = row[fieldIndex]
			}
		}
		expanded[index] = mapped
	}
	object["results"] = expanded
	return object
}

func compactID(row []any) (any, bool) {
	if len(row) == 0 {
		return nil, false
	}
	switch typed := row[0].(type) {
	case string:
		return typed, true
	case float64:
		if typed == math.Trunc(typed) {
			return itoa(int(typed)), true
		}
	}
	return row[0], false
}

func remapIDs(value any, rows []Row) any {
	object, ok := value.(map[string]any)
	if !ok {
		return value
	}
	items, ok := object["results"].([]any)
	if !ok {
		return value
	}
	byShort := map[string]string{}
	for index, row := range rows {
		byShort[itoa(index+1)] = row.ID
	}
	remapped := make([]any, len(items))
	for index, item := range items {
		candidate, ok := item.(map[string]any)
		if !ok {
			remapped[index] = item
			continue
		}
		if mapped, ok := byShort[fmt.Sprint(candidate["id"])]; ok {
			candidate["id"] = mapped
		}
		remapped[index] = candidate
	}
	object["results"] = remapped
	return object
}

func stripLookup(results []map[string]any) []map[string]any {
	stripped := make([]map[string]any, len(results))
	for index, item := range results {
		next := map[string]any{
			"id": item["id"], "category": item["category"], "producible": item["producible"],
			"categoryReason": item["categoryReason"], "rejectReason": item["rejectReason"],
		}
		if item["lowValue"] != nil && item["lowValue"] != "" {
			next["lowValue"] = item["lowValue"]
		}
		stripped[index] = next
	}
	return stripped
}

func readModelPayload(data map[string]any, model string) (any, bool, error) {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, false, fmt.Errorf("关键词审核模型 %s 没有返回内容", model)
	}
	choice, _ := choices[0].(map[string]any)
	truncated := fmt.Sprint(choice["finish_reason"]) == "length"
	message, _ := choice["message"].(map[string]any)
	raw, _ := message["content"].(string)
	if strings.TrimSpace(raw) == "" {
		if truncated {
			return nil, false, fmt.Errorf("关键词审核模型 %s 输出被截断，本批结果未写入", model)
		}
		return nil, false, fmt.Errorf("关键词审核模型 %s 没有返回内容", model)
	}
	parsed, err := parseModelJSON(raw)
	if err == nil {
		return parsed, false, nil
	}
	if salvaged, ok := salvagePartialResults(raw); ok {
		return salvaged, true, nil
	}
	if truncated {
		return nil, false, fmt.Errorf("关键词审核模型 %s 输出被截断，本批结果未写入", model)
	}
	return nil, false, fmt.Errorf("关键词审核模型 %s 返回了不完整 JSON，本批结果未写入", model)
}

var fencePattern = regexp.MustCompile("(?i)^```(?:json)?\\s*")
var fenceTailPattern = regexp.MustCompile("\\s*```$")

func parseModelJSON(raw string) (any, error) {
	clean := fenceTailPattern.ReplaceAllString(fencePattern.ReplaceAllString(strings.TrimSpace(raw), ""), "")
	var parsed any
	if err := json.Unmarshal([]byte(clean), &parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

func textValue(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func clippedOptional(value *string, max int) *string {
	if value == nil {
		return nil
	}
	clipped := clipRaw(strings.TrimSpace(*value), max)
	if clipped == "" {
		return nil
	}
	return &clipped
}

func clipRaw(value string, max int) string {
	if value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}

func clipText(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= max {
		return strings.TrimSpace(value)
	}
	return string(runes[:max])
}

func marshalText(value any) string {
	body, _ := marshalTextBytes(value)
	return string(body)
}

func marshalTextBytes(value any) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}
