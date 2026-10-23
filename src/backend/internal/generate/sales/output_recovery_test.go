package sales

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
)

func recoveryServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous; server.Close() })
	return server
}

func recoveryReply(w http.ResponseWriter, protocol, content string, truncated bool) {
	var result map[string]any
	switch protocol {
	case "anthropic":
		reason := "end_turn"
		if truncated {
			reason = "max_tokens"
		}
		result = map[string]any{"content": []any{map[string]any{"type": "text", "text": content}}, "stop_reason": reason, "usage": map[string]any{"input_tokens": 2, "output_tokens": 3}}
	case "gemini":
		reason := "STOP"
		if truncated {
			reason = "MAX_TOKENS"
		}
		result = map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"text": content}}}, "finishReason": reason}}, "usageMetadata": map[string]any{"promptTokenCount": 2, "candidatesTokenCount": 3, "totalTokenCount": 5}}
	default:
		reason := "stop"
		if truncated {
			reason = "length"
		}
		result = map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": content}, "finish_reason": reason}}, "usage": map[string]any{"prompt_tokens": 2, "completion_tokens": 3}}
	}
	_ = json.NewEncoder(w).Encode(result)
}

func TestSalesJSONRecoversTruncationAcrossProtocols(t *testing.T) {
	for _, protocol := range []string{"openai", "anthropic", "gemini"} {
		for _, partial := range []string{`{"scripts":[`, ""} {
			t.Run(protocol+"/"+partial, func(t *testing.T) {
				calls := 0
				server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
					calls++
					var request map[string]any
					_ = json.NewDecoder(r.Body).Decode(&request)
					budget := request["max_tokens"]
					if protocol == "gemini" {
						budget = request["generationConfig"].(map[string]any)["maxOutputTokens"]
					}
					want := longOutputTokens
					if calls == 2 {
						want = maxRecoveryTokens
						encoded, _ := json.Marshal(request)
						if !strings.Contains(string(encoded), "重新输出整个 JSON") || !strings.Contains(string(encoded), "原始商品事实") {
							t.Errorf("recovery lost original facts or instruction: %s", encoded)
						}
					}
					if budget != float64(want) {
						t.Errorf("call %d budget %v", calls, budget)
					}
					if calls == 1 {
						recoveryReply(w, protocol, partial, true)
					} else {
						recoveryReply(w, protocol, `{"ok":true}`, false)
					}
				})
				body := withLongOutput(chatBody("vision-test", "只写 JSON", "原始商品事实", 0.2))
				original, _ := json.Marshal(body)
				ctx := gateway.WithTextProtocol(context.Background(), protocol)
				content, raw, status, err := postChatJSON(ctx, server.URL, "test", body, time.Second)
				if err != nil || status != 200 || calls != 2 || content != `{"ok":true}` {
					t.Fatalf("calls=%d status=%d content=%s err=%v", calls, status, content, err)
				}
				if usage := generate.NormalizeUsage(raw); usage["promptTokens"] != float64(4) || usage["completionTokens"] != float64(6) || usage["totalTokens"] != float64(10) {
					t.Fatalf("recovery usage lost: %#v", usage)
				}
				after, _ := json.Marshal(body)
				if string(original) != string(after) {
					t.Fatal("recovery mutated original request")
				}
			})
		}
	}
}

func TestSalesJSONKeepsCompleteObjectAndBoundsRecovery(t *testing.T) {
	for _, tc := range []struct {
		name, content string
		calls         int
		truncated     bool
	}{
		{"closed", `{"ok":true}`, 1, false},
		{"fenced", "```json\n{\"ok\":true}\n```", 1, false},
		{"wrapped", "结果：{\"ok\":true}", 1, false},
		{"unfinished", `{"ok":`, 2, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				recoveryReply(w, "openai", tc.content, true)
			})
			content, _, _, err := postChatJSON(context.Background(), server.URL, "test", chatBody("m", "sys", "facts", 0.2), time.Second)
			if calls != tc.calls || errors.Is(err, errTruncatedOutput) != tc.truncated || (!tc.truncated && (err != nil || content != `{"ok":true}`)) {
				t.Fatalf("calls=%d content=%s err=%v", calls, content, err)
			}
		})
	}
}

func TestSalesJSONClampsExplicitOutputLimitThenRecoversWithinIt(t *testing.T) {
	calls := 0
	var budgets []int
	server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var request map[string]any
		_ = json.NewDecoder(r.Body).Decode(&request)
		budgets = append(budgets, int(request["max_tokens"].(float64)))
		switch calls {
		case 1:
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "max_tokens is too large: 16384. This model supports at most 8192 completion tokens."}})
		case 2:
			recoveryReply(w, "openai", `{"ok":`, true)
		default:
			recoveryReply(w, "openai", `{"ok":true}`, false)
		}
	})
	content, raw, _, err := postChatJSON(context.Background(), server.URL, "test", chatBody("m", "sys", "facts", 0.2), time.Second)
	if err != nil || content != `{"ok":true}` || !reflect.DeepEqual(budgets, []int{16384, 8192, 8192}) {
		t.Fatalf("budgets=%v content=%s err=%v", budgets, content, err)
	}
	if usage := generate.NormalizeUsage(raw); usage["totalTokens"] != float64(10) {
		t.Fatalf("usage %#v", usage)
	}
}

func TestSalesJSONDoesNotReplayOtherFailures(t *testing.T) {
	for _, status := range []int{400, 401, 403, 408, 422, 429, 500, 502, 504} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			calls := 0
			server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(status)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "maximum context length is 8192 tokens"}})
			})
			_, _, _, err := postChatJSON(context.Background(), server.URL, "test", chatBody("m", "sys", "facts", 0.2), time.Second)
			if err == nil || calls != 1 {
				t.Fatalf("calls=%d err=%v", calls, err)
			}
		})
	}
}

func TestSalesJSONCancellationAndSharedDeadline(t *testing.T) {
	calls := 0
	var deadline time.Time
	previous := generate.ModelHTTP
	defer func() { generate.ModelHTTP = previous }()
	generate.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: salesRecoveryTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			current, _ := r.Context().Deadline()
			if calls == 1 {
				deadline = current
				time.Sleep(30 * time.Millisecond)
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"choices":[{"finish_reason":"length","message":{"content":"{"}}]}`))}, nil
			}
			if !current.Equal(deadline) {
				t.Error("recovery reset the overall deadline")
			}
			<-r.Context().Done()
			return nil, r.Context().Err()
		})}
	}
	body := chatBody("m", "sys", "facts", 0.2)
	_, _, _, err := postChatJSON(context.Background(), "https://model.test", "test", body, 100*time.Millisecond)
	if !errors.Is(err, context.DeadlineExceeded) || calls != 2 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, _, err = postChatJSON(ctx, "https://model.test", "test", body, time.Second)
	if !errors.Is(err, context.Canceled) || calls != 2 {
		t.Fatalf("cancellation sent request: calls=%d err=%v", calls, err)
	}
}

type salesRecoveryTransport func(*http.Request) (*http.Response, error)

func (f salesRecoveryTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSalesOutputLimitOnlyAcceptsExplicitOutputBounds(t *testing.T) {
	for _, tc := range []struct {
		message string
		want    int
	}{
		{"max_tokens: maximum is 8192", 8192},
		{"maxOutputTokens must be less than or equal to 8192", 8192},
		{"max_tokens must be in range [1, 8192]", 8192},
		{"maximum context length is 8192 tokens", 0},
		{"requested 32768 tokens but only 8192 input tokens remain", 0},
		{"max_tokens must be at most 0", 0},
	} {
		if got := salesOutputLimit(map[string]any{"error": map[string]any{"message": tc.message}}); got != tc.want {
			t.Errorf("%q: got %d want %d", tc.message, got, tc.want)
		}
	}
}
