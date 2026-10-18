package assistant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func startAssistantTurn(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	turnID := optionalString(payload, "turnId")
	if turnID == "" {
		turnID = newTurnID()
	}
	threadID := optionalString(payload, "threadId")
	if threadID == "" {
		threadID = "default"
	}
	if len(turnID) > 255 || len(threadID) > 255 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "会话或任务标识过长", "retryable": false})
		return
	}
	model := optionalString(payload, "model")
	if model == "" {
		model = "gemini-3.7-flash"
	}
	creds, err := resolveTurnCreds(r, model, optionalString(payload, "customBaseUrl"), optionalString(payload, "customApiKey"), cfg.Production())
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error(), "retryable": false})
		return
	}
	workspace := httpx.WorkspaceFrom(r)
	claim, err := claimTurn(r.Context(), cfg, workspace, turnID, threadID, requestFingerprint(payload, creds.baseURL, creds.apiKey), model)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "turnId": turnID, "error": "任务领取记录未确认，本轮未执行，请核对原任务", "submissionUnknown": true, "retryable": false})
		return
	}
	if claim.outcome == "deleted" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "此对话已删除，请新建对话后发送", "retryable": false})
		return
	}
	if claim.outcome == "conflict" {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "turnId": turnID, "error": "同一任务标识不能用于不同的请求内容", "retryable": false})
		return
	}
	if claim.outcome == "existing" {
		replayTurn(cfg, w, r, workspace, turnID, threadID, claim.status)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	token, ok := beginTurn(workspace, threadID, turnID, cancel)
	if !ok {
		cancel()
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "error": "本轮请求正在运行，请勿重复提交"})
		return
	}
	defer func() {
		finishTurn(workspace, turnID, token)
		cancel()
		rejectTurnApprovals(workspace, turnID)
	}()
	streamTurn(ctx, cfg, w, r, payload, creds, workspace, turnID, threadID, model)
}

func replayTurn(cfg config.Config, w http.ResponseWriter, r *http.Request, workspace, turnID, threadID, status string) {
	if (status == "running" || status == "awaiting_approval") && turnActive(workspace, turnID) {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "turnId": turnID, "error": "原任务正在执行或结果待核实，请查询原任务", "submissionUnknown": true, "retryable": false, "snapshotUrl": "/api/assistant/turns/" + turnID + "/snapshot"})
		return
	}
	snapshot, err := readTurnSnapshot(r.Context(), cfg, workspace, turnID)
	if err != nil || snapshot == nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "turnId": turnID, "error": "原任务快照暂时无法读取，本轮未重新执行", "retryable": false})
		return
	}
	events := []map[string]any{{"type": "turn/snapshot", "turnId": turnID, "threadId": threadID, "snapshot": snapshot}}
	if snapshot["status"] == "completed" {
		events = append(events, map[string]any{"type": "turn/completed", "turnId": turnID})
	} else if snapshot["status"] == "interrupted" {
		events = append(events, map[string]any{"type": "error", "error": "原任务已中断，已有结果已保留"})
	} else {
		events = append(events, map[string]any{"type": "error", "error": "原任务未完成，已有结果已保留"})
	}
	events = append(events, map[string]any{"type": "done"})
	writeSSE(w, nil, events...)
}

func streamTurn(ctx context.Context, cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage, creds gatewayCreds, workspace, turnID, threadID, model string) {
	flusher, _ := w.(http.Flusher)
	writeSSE(w, flusher, map[string]any{"type": "turn/started", "turnId": turnID, "threadId": threadID, "model": model})
	send := func(event map[string]any) { writeSSE(w, flusher, event) }
	persist := func(item map[string]any) { _ = upsertTurnItem(ctx, cfg, workspace, turnID, item) }
	fail := func(message, status string) {
		_ = saveTurnState(ctx, cfg, workspace, turnID, status, model, 0, 0, map[string]any{"id": turnID, "threadId": threadID, "status": status, "items": []any{}})
		if status == "interrupted" {
			send(map[string]any{"type": "turn/interrupted", "turnId": turnID})
		} else {
			send(map[string]any{"type": "error", "error": message})
		}
		send(map[string]any{"type": "done"})
	}
	messages, documents := turnMessages(r, threadID, payload)
	started := time.Now()
	noteTurnEvent(workspace, "turn/started", turnID, threadID, model, "", "", started)
	intent := detectSocialIntent(lastUserText(messages))
	if len(intent.urls) > 0 {
		finishCollection(ctx, cfg, w, flusher, send, persist, workspace, turnID, threadID, r, intent.urls)
		noteTurnEvent(workspace, "turn/completed", turnID, threadID, "direct-collection", "", "", started)
		return
	}
	if strings.TrimSpace(model) == "" {
		fail("模型名称不能为空", "failed")
		noteTurnEvent(workspace, "turn/failed", turnID, threadID, model, "", "model", started)
		return
	}
	if creds.apiKey == "" {
		fail("系统未配置 API Key，请在顶部「⚙️ 设置」中配置 API 密钥", "failed")
		noteTurnEvent(workspace, "turn/failed", turnID, threadID, model, "", "api-key", started)
		return
	}
	messages = compressHistory(ctx, messages, creds, model, optionalBoolDefault(payload, "enableCompression", false))
	if intent.analyze {
		images := reusedImages(messages)
		if len(images) > 24 {
			dir := filepath.Join(filepath.Dir(resolveTelemetryDir()), "assistant-selection", workspace)
			selected, report, err := shortlistImages(ctx, creds, model, lastUserText(messages), workspace+":"+threadID, dir, images, nil)
			if err != nil {
				fail(err.Error(), "failed")
				noteTurnEvent(workspace, "turn/failed", turnID, threadID, model, "", "shortlist", started)
				return
			}
			messages = append(messages, map[string]any{"role": "system", "content": report + "\n候选 " + strconv.Itoa(len(selected)) + " 张。"})
		}
	}
	allowed := stringArray(payload, "allowedTools")
	tools := []map[string]any{}
	names := []string{}
	if optionalBoolDefault(payload, "enableAgentTools", true) {
		tools = openAITools(allowed)
		for _, tool := range tools {
			fn, _ := tool["function"].(map[string]any)
			name, _ := fn["name"].(string)
			names = append(names, name)
		}
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		fail("任务领取记录未确认，本轮未执行，请核对原任务", "failed")
		return
	}
	defer db.Close()
	budget := newBudget()
	plan := &taskPlan{}
	results := &resultStore{}
	genMode := optionalString(payload, "generationMode")
	if genMode == "" {
		genMode = "normal"
	}
	loop := &agentLoop{
		ctx: ctx, creds: creds, models: []string{model}, effort: optionalString(payload, "reasoningEffort"),
		generationMode: genMode,
		messages:       messages, tools: tools, names: names, budget: budget, plan: plan, results: results,
		box:  &toolBox{ctx: ctx, db: db, cfg: cfg, workspace: workspace, documents: documents, client: objectField(payload, "clientContext"), plan: plan, results: results, budget: budget, allowed: names},
		send: send, persist: persist, granted: sessionTools(workspace, threadID), turnID: turnID, threadID: threadID, space: workspace,
		mu: &sync.Mutex{},
	}
	loop.box.spawn = loop.spawnSubagent
	if raw, ok := payload["mcpServers"]; ok {
		var servers []any
		_ = json.Unmarshal(raw, &servers)
		extra, bindings := listMCPTools(servers)
		loop.tools = append(loop.tools, extra...)
		loop.box.mcp = bindings
		for _, tool := range extra {
			fn, _ := tool["function"].(map[string]any)
			name, _ := fn["name"].(string)
			if name != "" {
				loop.names = append(loop.names, name)
				loop.box.allowed = append(loop.box.allowed, name)
			}
		}
	}
	actual, stop, streamed, runErr := loop.run()
	if runErr != nil {
		if ctx.Err() != nil {
			message := "用户已停止"
			if errorsIsDeadline(ctx) {
				message = "已达到本轮 10 分钟时限，现有结果已保留"
			}
			fail(message, "interrupted")
			return
		}
		fail(runErr.Error(), "failed")
		return
	}
	if !streamed && ctx.Err() == nil {
		if used, err := loop.finalReply(); err == nil && used != "" {
			actual = used
		}
	}
	status := "completed"
	if stop != "" {
		status = "failed"
	}
	phase := "turn/completed"
	if status != "completed" {
		phase = "turn/failed"
	}
	noteTurnEvent(workspace, phase, turnID, threadID, actual, "", stop, time.Now())
	snapshot := map[string]any{"id": turnID, "threadId": threadID, "status": status, "items": loop.items, "usage": map[string]any{"inputTokens": budget.inputTokens, "outputTokens": budget.outputTokens}, "modelUsed": actual}
	_ = saveTurnState(ctx, cfg, workspace, turnID, status, actual, budget.inputTokens, budget.outputTokens, snapshot)
	send(map[string]any{"type": "meta", "modelUsed": actual, "requestedModel": model})
	if budget.usageReports > 0 {
		send(map[string]any{"type": "usage", "usage": map[string]any{"prompt_tokens": budget.inputTokens, "completion_tokens": budget.outputTokens}})
	}
	send(map[string]any{"type": "turn/snapshot", "turnId": turnID, "threadId": threadID, "snapshot": snapshot})
	if stop != "" {
		send(map[string]any{"type": "error", "error": stop})
	} else {
		send(map[string]any{"type": "turn/completed", "turnId": turnID})
	}
	send(map[string]any{"type": "done"})
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, events ...map[string]any) {
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
	}
	for _, event := range events {
		body, _ := json.Marshal(event)
		fmt.Fprintf(w, "data: %s\n\n", body)
	}
	if flusher != nil {
		flusher.Flush()
	}
}

func newTurnID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	return "turn_" + hex.EncodeToString(buf[:])
}

func optionalString(payload map[string]json.RawMessage, key string) string {
	text, ok := rawText(payload[key])
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func optionalBoolDefault(payload map[string]json.RawMessage, key string, fallback bool) bool {
	raw, ok := payload[key]
	if !ok {
		return fallback
	}
	var value bool
	if json.Unmarshal(raw, &value) != nil {
		return fallback
	}
	return value
}

func stringArray(payload map[string]json.RawMessage, key string) []string {
	var values []string
	if json.Unmarshal(payload[key], &values) != nil {
		return nil
	}
	return values
}

func objectField(payload map[string]json.RawMessage, key string) map[string]any {
	var value map[string]any
	if json.Unmarshal(payload[key], &value) != nil || value == nil {
		return map[string]any{}
	}
	return value
}

func errorsIsDeadline(ctx context.Context) bool {
	return errorsDeadline(ctx.Err())
}

func errorsDeadline(err error) bool {
	return err == context.DeadlineExceeded || (err != nil && strings.Contains(err.Error(), "deadline"))
}

func finishCollection(ctx context.Context, cfg config.Config, w http.ResponseWriter, flusher http.Flusher, send func(map[string]any), persist func(map[string]any), workspace, turnID, threadID string, r *http.Request, urls []string) {
	images, summaries, raws, widget := collectSocialImages(r, cfg, urls)
	items := []any{}
	for index, raw := range raws {
		item := map[string]any{"id": newRuntimeID("tool"), "kind": "toolCall", "name": "parse_product_or_social_url", "displayName": "采集小红书图片", "args": urls[index], "status": "done", "summary": raw, "createdAt": time.Now().UnixMilli()}
		items = append(items, item)
		send(map[string]any{"type": "tool_call", "name": "parse_product_or_social_url", "displayName": "采集小红书图片", "status": "running"})
		send(map[string]any{"type": "tool_result", "name": "parse_product_or_social_url", "displayName": "采集小红书图片", "status": "done", "detail": summaries[index]})
		persist(item)
	}
	text := strings.Join(summaries, "\n\n") + "\n\n采集阶段未调用 AI 模型。已获取 " + strconv.Itoa(len(images)) + " 张不重复图片的地址，尚未进行画面分析。"
	if len(images) > 0 {
		text += "\n\n完整图集已显示在下方素材卡片中，共 " + strconv.Itoa(len(images)) + " 张。\n\n可以继续告诉我用途，例如“从这些图片里挑 3 张封面，说明理由”。"
	}
	message := map[string]any{"id": newRuntimeID("msg"), "kind": "agentMessage", "content": text, "status": "done", "productWidget": widget}
	items = append(items, message)
	persist(message)
	snapshot := map[string]any{"id": turnID, "threadId": threadID, "status": "completed", "items": items, "modelUsed": "direct-collection", "productWidget": widget}
	_ = saveTurnState(ctx, cfg, workspace, turnID, "completed", "direct-collection", 0, 0, snapshot)
	send(map[string]any{"type": "meta", "modelUsed": "direct-collection", "productWidget": widget})
	send(map[string]any{"type": "assistant", "content": text})
	send(map[string]any{"type": "turn/snapshot", "turnId": turnID, "threadId": threadID, "snapshot": snapshot})
	send(map[string]any{"type": "turn/completed", "turnId": turnID})
	send(map[string]any{"type": "done"})
	_ = w
	_ = flusher
}
