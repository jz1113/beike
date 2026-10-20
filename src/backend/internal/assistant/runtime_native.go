package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/modelgw"
)

type assistantRoundTripper func(*http.Request) (*http.Response, error)

func (fn assistantRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func validTextProtocol(protocol string) bool {
	switch protocol {
	case "", "auto", "openai", "gemini", "anthropic":
		return true
	default:
		return false
	}
}

func (loop *agentLoop) nativeStream(body []byte) (modelRound, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return modelRound{}, err
	}
	model, _ := payload["model"].(string)
	// The adapter owns vendor-specific normalization; do not send the OpenAI
	// effort field unchanged to a native endpoint.
	if loop.effort != "" && loop.effort != "auto" {
		payload["reasoning_effort"] = loop.effort
	}
	emitted := false
	_, data, err := modelgw.StreamText(loop.ctx, modelgw.TextRequest{
		BaseURL: loop.creds.baseURL, APIKey: loop.creds.apiKey,
		Protocol: modelgw.ResolveTextProtocol(model, loop.creds.protocol),
		Payload:  payload, Client: assistantHTTP(), Timeout: 10 * time.Minute,
	}, func(kind, text string) {
		if !emitted && loop.send != nil {
			emitted = true
			loop.send(map[string]any{"type": "status", "phase": "streaming", "message": "已连接模型，正在接收回复…"})
		}
		loop.emitTextDelta(kind, text)
	})
	round, decodeErr := nativeModelRound(data)
	if err != nil {
		// Native transport failures never trigger automatic paid replays or
		// a silent switch back to the compatible protocol.
		return round, err
	}
	return round, decodeErr
}

func nativeModelRound(data map[string]any) (modelRound, error) {
	round := modelRound{}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return round, errors.New("原生模型未返回有效内容")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	round.content, _ = message["content"].(string)
	round.reasoning, _ = message["reasoning_content"].(string)
	round.native = message["native_content"]
	if usage, ok := data["usage"].(map[string]any); ok {
		prompt, inOK := nativeCount(usage["prompt_tokens"])
		completion, outOK := nativeCount(usage["completion_tokens"])
		round.prompt, round.completion, round.usageOK = prompt, completion, inOK && outOK
	}
	calls, _ := message["tool_calls"].([]any)
	if len(calls) > 24 {
		return round, errors.New("模型工具调用数量超出限制")
	}
	for _, raw := range calls {
		call, _ := raw.(map[string]any)
		fn, _ := call["function"].(map[string]any)
		id, _ := call["id"].(string)
		name, _ := fn["name"].(string)
		args, _ := fn["arguments"].(string)
		var object map[string]any
		if id == "" || len(id) > 256 || name == "" || len(name) > 128 || len(args) > 100_000 || json.Unmarshal([]byte(args), &object) != nil || object == nil {
			return round, errors.New("模型工具调用不完整，不执行不完整操作")
		}
		round.toolCalls = append(round.toolCalls, modelToolCall{id: id, name: name, arguments: args, extra: call["extra_content"]})
	}
	finish, _ := choice["finish_reason"].(string)
	if finish != "stop" && finish != "tool_calls" {
		return round, errors.New("原生模型未正常完成本轮（" + finish + "），现有内容已保留")
	}
	if strings.TrimSpace(round.content) == "" && len(round.toolCalls) == 0 {
		return round, errors.New("原生模型返回空内容，本轮尚未完成")
	}
	return round, nil
}

func nativeCount(value any) (int, bool) {
	switch number := value.(type) {
	case float64:
		return int(number), true
	case int:
		return number, true
	case int64:
		return int(number), true
	default:
		return 0, false
	}
}

func nativeText(ctx context.Context, creds gatewayCreds, payload map[string]any, timeout time.Duration, client *http.Client) (string, error) {
	model, _ := payload["model"].(string)
	_, data, err := modelgw.CompleteText(ctx, modelgw.TextRequest{
		BaseURL: creds.baseURL, APIKey: creds.apiKey, Protocol: modelgw.ResolveTextProtocol(model, creds.protocol),
		Payload: payload, Client: client, Timeout: timeout,
	})
	if err != nil {
		return "", err
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", errors.New("模型未返回有效内容")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	if strings.TrimSpace(text) == "" {
		return "", errors.New("模型返回空内容")
	}
	return text, nil
}
