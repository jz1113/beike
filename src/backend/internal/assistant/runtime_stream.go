package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/modelgw"
)

const maxStreamRetries = 2

var errToolsUnsupported = errors.New("upstream tools unsupported")

func (loop *agentLoop) streamModel(body []byte, withTools bool) (modelRound, error) {
	var payload struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(body, &payload) == nil && modelgw.ResolveTextProtocol(payload.Model, loop.creds.protocol) != "openai" {
		return loop.nativeStream(body)
	}
	var last error
	retryAfter := ""
	clamped := false
	for attempt := 0; attempt <= maxStreamRetries; attempt++ {
		if attempt > 0 {
			loop.send(map[string]any{"type": "status", "phase": "connecting", "message": "模型请求未成功，正在重试…"})
			if err := waitRetry(loop.ctx, retryDelay(attempt, retryAfter)); err != nil {
				return modelRound{}, err
			}
		}
		retryAfter = ""
		response, err := postModel(loop.ctx, loop.creds, body, true)
		if err != nil {
			if loop.ctx.Err() != nil {
				return modelRound{}, loop.ctx.Err()
			}
			last = err
			if attempt >= maxStreamRetries {
				return modelRound{}, err
			}
			continue
		}
		if response.StatusCode >= 300 {
			payload, _ := io.ReadAll(io.LimitReader(response.Body, 8<<20))
			response.Body.Close()
			if withTools && unsupportedTools(response.StatusCode, string(payload)) {
				return modelRound{}, errToolsUnsupported
			}
			if !clamped {
				if limit, ok := completionTokenLimit(payload); ok {
					if next, ok := clampCompletionTokens(body, limit); ok {
						body = next
						clamped = true
						attempt--
						continue
					}
				}
			}
			last = errors.New(formatUpstreamModelError(payload, response.StatusCode))
			if retryableStatus(response.StatusCode) && attempt < maxStreamRetries {
				retryAfter = response.Header.Get("Retry-After")
				continue
			}
			return modelRound{}, last
		}
		emitted := false
		round, err := readModelStream(response.Body, func(kind, text string) {
			if !emitted {
				emitted = true
				loop.send(map[string]any{"type": "status", "phase": "streaming", "message": "已连接模型，正在接收回复…"})
			}
			loop.emitTextDelta(kind, text)
		})
		response.Body.Close()
		if err != nil {
			if emitted || attempt >= maxStreamRetries {
				return round, err
			}
			last = err
			continue
		}
		if !emitted {
			loop.send(map[string]any{"type": "status", "phase": "streaming", "message": "已连接模型，正在接收回复…"})
		}
		return round, nil
	}
	if last == nil {
		last = errors.New("模型请求失败，未获得有效响应")
	}
	return modelRound{}, last
}

var completionLimitPattern = regexp.MustCompile(`(?i)at most\s+(\d+)`)

func completionTokenLimit(payload []byte) (int, bool) {
	match := completionLimitPattern.FindSubmatch(payload)
	if len(match) < 2 {
		return 0, false
	}
	limit, err := strconv.Atoi(string(match[1]))
	if err != nil || limit <= 0 {
		return 0, false
	}
	return limit, true
}

func clampCompletionTokens(body []byte, limit int) ([]byte, bool) {
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return body, false
	}
	clamped := false
	for _, key := range []string{"max_tokens", "max_completion_tokens"} {
		current, ok := payload[key].(float64)
		if !ok || int(current) <= limit {
			continue
		}
		payload[key] = limit
		clamped = true
	}
	if !clamped {
		return body, false
	}
	next, err := json.Marshal(payload)
	if err != nil {
		return body, false
	}
	return next, true
}

func retryableStatus(code int) bool {
	switch code {
	case http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func parseRetryAfter(value string) (time.Duration, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		if seconds < 0 {
			seconds = 0
		}
		return time.Duration(seconds) * time.Second, true
	}
	when, err := http.ParseTime(value)
	if err != nil {
		return 0, false
	}
	delay := time.Until(when)
	if delay < 0 {
		delay = 0
	}
	return delay, true
}

func retryDelay(attempt int, header string) time.Duration {
	if delay, ok := parseRetryAfter(header); ok {
		if delay > 8*time.Second {
			return 8 * time.Second
		}
		return delay
	}
	delay := 400 * time.Millisecond
	for i := 1; i < attempt; i++ {
		delay *= 3
		if delay > 8*time.Second {
			return 8 * time.Second
		}
	}
	return delay
}

func waitRetry(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (loop *agentLoop) emitTextDelta(kind, text string) {
	if text == "" || loop.send == nil {
		return
	}
	var id *string
	itemKind := ""
	deltaType := ""
	switch kind {
	case "reasoning":
		id = &loop.reasonItemID
		itemKind = "agentReasoning"
		deltaType = "item/agentReasoning/delta"
	case "content":
		id = &loop.messageItemID
		itemKind = "agentMessage"
		deltaType = "item/agentMessage/delta"
	default:
		return
	}
	if *id == "" {
		*id = newRuntimeID(kind)
		loop.send(map[string]any{"type": "item/started", "turnId": loop.turnID, "itemId": *id, "kind": itemKind})
	}
	loop.send(map[string]any{"type": deltaType, "turnId": loop.turnID, "itemId": *id, "delta": text})
}

func (loop *agentLoop) noteMessage(round modelRound) {
	defer func() {
		loop.reasonItemID = ""
		loop.messageItemID = ""
	}()
	if strings.TrimSpace(round.content) == "" && round.reasoning == "" {
		return
	}
	if round.reasoning != "" {
		id := loop.ensureTextItem(&loop.reasonItemID, "reason", "agentReasoning")
		item := map[string]any{"id": id, "kind": "agentReasoning", "content": round.reasoning, "createdAt": time.Now().UnixMilli()}
		loop.items = append(loop.items, item)
		if loop.persist != nil {
			loop.persist(item)
		}
		loop.send(map[string]any{"type": "thinking", "content": round.reasoning})
		loop.send(map[string]any{"type": "item/agentReasoning/completed", "turnId": loop.turnID, "itemId": id, "content": round.reasoning})
	}
	if strings.TrimSpace(round.content) != "" {
		id := loop.ensureTextItem(&loop.messageItemID, "msg", "agentMessage")
		item := map[string]any{"id": id, "kind": "agentMessage", "content": round.content, "createdAt": time.Now().UnixMilli()}
		loop.items = append(loop.items, item)
		if loop.persist != nil {
			loop.persist(item)
		}
		loop.send(map[string]any{"type": "item/agentMessage/completed", "turnId": loop.turnID, "itemId": id, "content": round.content})
	}
}

func (loop *agentLoop) ensureTextItem(id *string, prefix, kind string) string {
	if *id != "" {
		return *id
	}
	*id = newRuntimeID(prefix)
	loop.send(map[string]any{"type": "item/started", "turnId": loop.turnID, "itemId": *id, "kind": kind})
	return *id
}

func clientAction(raw string) map[string]any {
	var parsed map[string]any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	action, _ := parsed["action"].(string)
	if strings.TrimSpace(action) == "" {
		return nil
	}
	if id, ok := parsed["archId"].(string); ok && parsed["arch_id"] == nil {
		parsed["arch_id"] = id
	}
	return parsed
}
