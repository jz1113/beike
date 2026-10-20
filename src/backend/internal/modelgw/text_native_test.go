package modelgw

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

const textTestPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII="

func textTestClone(t *testing.T, p map[string]any) map[string]any {
	t.Helper()
	out, err := textClone(p)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestTextNativeImageSystemToolsAndJSON(t *testing.T) {
	for _, protocol := range []string{"gemini", "anthropic"} {
		t.Run(protocol, func(t *testing.T) {
			model := "gemini-4-argon"
			if protocol == "anthropic" {
				model = "claude-5.5-haiku"
			}
			p := textTestPayload(model)
			p["messages"] = append(textArray(p["messages"]), map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": "look"}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": textTestPNG}}}})
			schema := map[string]any{"type": "object", "properties": map[string]any{"answer": map[string]any{"type": "string"}}, "required": []any{"answer"}, "additionalProperties": false}
			p["response_format"] = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "answer", "schema": schema}}
			p["tools"] = []any{map[string]any{"type": "function", "function": map[string]any{"name": "lookup", "description": "Lookup", "parameters": schema}}}
			p["tool_choice"] = map[string]any{"type": "function", "function": map[string]any{"name": "lookup"}}
			p = textTestClone(t, p)
			var out map[string]any
			var err error
			if protocol == "gemini" {
				out, err = geminiRequest(context.Background(), p, model)
				if err != nil {
					t.Fatal(err)
				}
				parts := textArray(textMap(textArray(out["contents"])[0])["parts"])
				if textMap(textMap(parts[len(parts)-1])["inlineData"])["mimeType"] != "image/png" {
					t.Fatal(parts)
				}
				if textMap(out["generationConfig"])["responseMimeType"] != "application/json" {
					t.Fatal(out)
				}
				if mode := textMap(textMap(out["toolConfig"])["functionCallingConfig"])["mode"]; mode != "ANY" {
					t.Fatal(out)
				}
			} else {
				out, err = anthropicRequest(context.Background(), p, model, false)
				if err != nil {
					t.Fatal(err)
				}
				parts := textArray(textMap(textArray(out["messages"])[0])["content"])
				if textMap(textMap(parts[len(parts)-1])["source"])["media_type"] != "image/png" {
					t.Fatal(parts)
				}
				if textMap(textMap(out["output_config"])["format"])["type"] != "json_schema" {
					t.Fatal(out)
				}
				if textMap(out["tool_choice"])["type"] != "tool" {
					t.Fatal(out)
				}
			}
			wire, _ := json.Marshal(out)
			if strings.Contains(string(wire), "image_url") || strings.Contains(string(wire), "response_format") {
				t.Fatal(string(wire))
			}
		})
	}
}

func TestAnthropicJSONObjectKeepsOfficialMessagesShape(t *testing.T) {
	p := textTestPayload("claude-5.5-haiku")
	p["response_format"] = map[string]any{"type": "json_object"}
	p["messages"] = append(textArray(p["messages"]), map[string]any{"role": "user", "content": []any{
		map[string]any{"type": "text", "text": "look"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": textTestPNG, "index": 7}},
	}})
	out, err := anthropicRequest(context.Background(), textTestClone(t, p), "claude-5.5-haiku", false)
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(out)
	for _, forbidden := range []string{"image_url", "response_format", "output_config", textTestPNG} {
		if strings.Contains(string(wire), forbidden) {
			t.Fatalf("official request leaked %s", forbidden)
		}
	}
	if out["max_tokens"] != float64(4096) || textMap(textArray(out["system"])[0])["text"] == "" {
		t.Fatal(out["system"])
	}
	messages := textArray(out["messages"])
	parts := textArray(textMap(messages[len(messages)-1])["content"])
	source := textMap(textMap(parts[len(parts)-1])["source"])
	if source["type"] != "base64" || source["media_type"] != "image/png" || source["data"] == "" {
		t.Fatal(parts)
	}
	system := textArray(out["system"])
	if !strings.Contains(textString(textMap(system[len(system)-1])["text"]), "JSON object") {
		t.Fatal(system)
	}
}

func TestTextImageRemoteFailuresStaySafe(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err != nil {
		t.Fatal(err)
	}
	var gets int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "analysis-secret" {
				t.Errorf("model request %s", r.URL.Path)
			}
			raw, _ := io.ReadAll(r.Body)
			if strings.Contains(string(raw), "secret-token") || strings.Contains(string(raw), "image_url") {
				t.Error("image source leaked into the official request")
			}
			io.WriteString(w, `{"content":[{"type":"text","text":"{\"ok\":true}"}],"stop_reason":"end_turn"}`)
			return
		}
		gets++
		if r.Header.Get("Authorization") != "" || r.Header.Get("x-api-key") != "" {
			t.Error("model credentials reached the image request")
		}
		switch r.URL.Path {
		case "/denied":
			w.WriteHeader(http.StatusForbidden)
		case "/html":
			w.Header().Set("Content-Type", "text/html")
			io.WriteString(w, "<html>secret-token</html>")
		case "/mismatch":
			w.Header().Set("Content-Type", "image/png")
			io.WriteString(w, "<html>secret-token</html>")
		default:
			w.Header().Set("Content-Type", "image/png")
			w.Write(png)
		}
	}))
	defer server.Close()
	previous := textImageClient
	textImageClient = func() *http.Client { return server.Client() }
	t.Cleanup(func() { textImageClient = previous })

	_, err = anthropicRequest(context.Background(), map[string]any{
		"model": "claude-5.5-haiku", "max_tokens": 128,
		"messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": server.URL + "/denied?token=secret-token", "index": 4}}}}},
	}, "claude-5.5-haiku", false)
	var indexed *IndexedImageError
	var image *TextImageError
	if !errors.As(err, &indexed) || indexed.Index != 4 || !errors.As(err, &image) || image.Kind != "status" || image.Status != http.StatusForbidden || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("denied image error: %v", err)
	}
	for _, tc := range []struct{ path, kind string }{{"/html", "mime"}, {"/mismatch", "mismatch"}} {
		_, _, err = textImage(context.Background(), server.URL+tc.path+"?token=secret-token")
		if !errors.As(err, &image) || image.Kind != tc.kind || strings.Contains(err.Error(), "secret-token") {
			t.Fatalf("%s: %v", tc.path, err)
		}
	}
	status, result, err := CompleteText(context.Background(), TextRequest{
		BaseURL: server.URL, APIKey: "analysis-secret", Protocol: "anthropic", Client: server.Client(),
		Payload: map[string]any{"model": "claude-5.5-haiku", "max_tokens": 128, "messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": server.URL + "/picture?token=secret-token", "index": 2}}}}}},
	})
	if err != nil || status != 200 || gets < 2 {
		t.Fatalf("status=%d gets=%d err=%v result=%v", status, gets, err, result)
	}
}

func TestTextImagesRejectPrivateNetworkAndInvalidMIME(t *testing.T) {
	for _, source := range []string{"http://127.0.0.1:9/private", "http://169.254.169.254/metadata", "http://localhost/a", "data:text/html;base64,SGk=", "data:image/png;base64,SGk=", "data:image/png,raw", "data:image/png;base64,%%%"} {
		if _, _, err := textImage(context.Background(), source); err == nil {
			t.Fatalf("accepted unsafe image %s", source)
		}
	}
}

func TestTextGeminiSignedToolRoundTrip(t *testing.T) {
	native := map[string]any{"candidates": []any{map[string]any{"finishReason": "STOP", "content": map[string]any{"parts": []any{
		map[string]any{"text": "think", "thought": true, "thoughtSignature": "text-sig"},
		map[string]any{"functionCall": map[string]any{"name": "first", "args": map[string]any{"x": 1}}, "thoughtSignature": "tool-sig", "extra_content": map[string]any{"vendor": "kept"}},
		map[string]any{"functionCall": map[string]any{"name": "second", "args": map[string]any{}}},
	}}}}}
	result, err := geminiResponse(textTestClone(t, native), "gemini-4-argon")
	if err != nil {
		t.Fatal(err)
	}
	msg := textTestMessage(result)
	calls := textArray(msg["tool_calls"])
	if textMap(calls[0])["extra_content"] == nil || msg["reasoning_content"] != "think" {
		t.Fatal(msg)
	}
	p := textTestPayload("gemini-4-argon")
	p["messages"] = append(textArray(p["messages"]), msg, map[string]any{"role": "tool", "tool_call_id": textMap(calls[0])["id"], "content": "{\"ok\":true}"}, map[string]any{"role": "tool", "tool_call_id": textMap(calls[1])["id"], "content": "done"})
	converted, err := geminiRequest(context.Background(), textTestClone(t, p), "gemini-4-argon")
	if err != nil {
		t.Fatal(err)
	}
	contents := textArray(converted["contents"])
	expected := textMap(msg["native_content"])["content"]
	if !reflect.DeepEqual(textMap(contents[1])["parts"], expected) {
		t.Fatalf("signed blocks changed: %#v", contents)
	}
	if len(contents) != 3 || len(textArray(textMap(contents[2])["parts"])) != 2 {
		t.Fatal("ungrouped tool results", contents)
	}
	other, err := geminiRequest(context.Background(), textTestClone(t, p), "gemini-3.8-flash")
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(other)
	if strings.Contains(string(wire), "sig") {
		t.Fatal("cross-model signature leaked", string(wire))
	}
}

func TestTextClaudeSignedToolRoundTrip(t *testing.T) {
	blocks := []any{
		map[string]any{"type": "thinking", "thinking": "plan", "signature": "private-signature"},
		map[string]any{"type": "redacted_thinking", "data": "opaque-signed-data"},
		map[string]any{"type": "tool_use", "id": "a", "name": "one", "input": map[string]any{"x": 1}},
		map[string]any{"type": "tool_use", "id": "b", "name": "two", "input": map[string]any{}, "extra_content": map[string]any{"key": "value"}},
	}
	result, err := anthropicResponse(textTestClone(t, map[string]any{"content": blocks, "stop_reason": "tool_use"}), "claude-5.5-haiku")
	if err != nil {
		t.Fatal(err)
	}
	msg := textTestMessage(result)
	p := textTestPayload("claude-5.5-haiku")
	p["messages"] = append(textArray(p["messages"]), msg, map[string]any{"role": "tool", "tool_call_id": "a", "content": "one done"}, map[string]any{"role": "tool", "tool_call_id": "b", "content": "two failed", "is_error": true})
	out, err := anthropicRequest(context.Background(), textTestClone(t, p), "claude-5.5-haiku", false)
	if err != nil {
		t.Fatal(err)
	}
	messages := textArray(out["messages"])
	if !reflect.DeepEqual(textMap(messages[1])["content"], textMap(msg["native_content"])["content"]) {
		t.Fatal("Claude signed blocks changed", messages)
	}
	if len(messages) != 3 || len(textArray(textMap(messages[2])["content"])) != 2 {
		t.Fatal("ungrouped Claude tool results", messages)
	}
	other, err := anthropicRequest(context.Background(), textTestClone(t, p), "claude-sonnet-4-5", false)
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(other)
	if strings.Contains(string(wire), "private-signature") || strings.Contains(string(wire), "opaque-signed-data") {
		t.Fatal("cross-model signature leaked", string(wire))
	}
}

func TestTextNativeThinkingMappings(t *testing.T) {
	for _, tc := range []struct {
		model, effort, mode string
		valid               bool
	}{
		{"gemini-4-argon", "medium", "level", true}, {"gemini-3.1-pro-preview", "medium", "level", true},
		{"gemini-4-argon", "minimal", "level", true}, {"gemini-unknown", "high", "", true},
		{"gemini-2.5-flash", "low", "budget", true}, {"gemini-2.5-pro", "none", "budget", true},
		{"claude-haiku-5-5", "medium", "adaptive", true}, {"claude-haiku-5-5", "max", "adaptive", true},
		{"claude-sonnet-4-5", "high", "budget", true}, {"claude-haiku-4-5", "low", "budget", true},
		{"claude-5.5-haiku", "medium", "", true},
	} {
		t.Run(tc.model+tc.effort, func(t *testing.T) {
			p := textTestPayload(tc.model)
			delete(p, "max_tokens")
			p["reasoning_effort"] = tc.effort
			var out map[string]any
			var err error
			if strings.HasPrefix(tc.model, "gemini") {
				out, err = geminiRequest(context.Background(), p, tc.model)
			} else {
				out, err = anthropicRequest(context.Background(), p, tc.model, false)
			}
			if (err == nil) != tc.valid {
				t.Fatalf("out=%v err=%v", out, err)
			}
			if tc.valid && textThinkingMode(tc.model) != tc.mode {
				t.Fatal(textThinkingMode(tc.model))
			}
			if tc.valid && tc.mode == "adaptive" && textMap(out["thinking"])["type"] != "adaptive" {
				t.Fatal(out)
			}
			if tc.valid && tc.mode == "budget" && strings.HasPrefix(tc.model, "claude") && textNumber(out["max_tokens"]) <= textNumber(textMap(out["thinking"])["budget_tokens"]) {
				t.Fatal(out)
			}
		})
	}
	p := textTestPayload("claude-sonnet-4-5")
	p["reasoning_effort"] = "high"
	p["max_tokens"] = 2048
	if _, err := anthropicRequest(context.Background(), p, "claude-sonnet-4-5", false); err == nil {
		t.Fatal("accepted budget beyond max_tokens")
	}
}

func TestTextNativeFinishErrors(t *testing.T) {
	for _, finish := range []string{"", "MALFORMED_FUNCTION_CALL", "OTHER"} {
		if _, err := geminiResponse(map[string]any{"candidates": []any{map[string]any{"finishReason": finish}}}, "gemini-test"); err == nil {
			t.Fatal(finish)
		}
	}
	if _, err := anthropicResponse(map[string]any{"stop_reason": "pause_turn"}, "claude-test"); err == nil {
		t.Fatal("pause treated as complete")
	}
	if _, err := anthropicResponse(map[string]any{"stop_reason": "tool_use"}, "claude-test"); err == nil {
		t.Fatal("empty tool use accepted")
	}
}
