package assistant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

func newRuntimeID(prefix string) string {
	var buf [4]byte
	_, _ = rand.Read(buf[:])
	return fmt.Sprintf("%s_%d_%s", prefix, time.Now().UnixMilli(), hex.EncodeToString(buf[:]))
}

type agentLoop struct {
	ctx            context.Context
	creds          gatewayCreds
	models         []string
	effort         string
	generationMode string
	messages       []map[string]any
	tools          []map[string]any
	names          []string
	budget         *execBudget
	plan           *taskPlan
	results        *resultStore
	box            *toolBox
	send           func(map[string]any)
	persist        func(map[string]any)
	granted        map[string]bool
	turnID         string
	threadID       string
	space          string
	items          []map[string]any
	toolNotes      []string
	maxRounds      int
	depth          int
	mu             *sync.Mutex
	reasonItemID   string
	messageItemID  string
}

func (loop *agentLoop) run() (string, string, bool, error) {
	if len(loop.tools) == 0 {
		round, err := loop.complete(true, false)
		if err != nil {
			return loop.models[0], "", false, err
		}
		loop.noteMessage(round)
		return loop.currentModel(round), loop.plan.incomplete(), true, nil
	}
	actual := loop.models[0]
	usedTools := false
	streamed := false
	rounds := loop.maxRounds
	if rounds <= 0 {
		rounds = maxAgentRounds
	}
	for round := 0; round < rounds; round++ {
		if err := loop.ctx.Err(); err != nil {
			return actual, "", streamed, err
		}
		if !loop.budget.canContinue() {
			break
		}
		if containsTool(loop.names, "read_tool_result") && compactToolContext(loop.messages, loop.results) > 0 {
			loop.send(map[string]any{"type": "status", "phase": "planning", "message": "已收起较早的工具输出，保留执行记录与完整结果索引…"})
		}
		loop.send(map[string]any{"type": "status", "phase": "connecting", "message": roundText(round)})
		result, err := loop.complete(false, true)
		if err != nil {
			return actual, "", streamed, err
		}
		actual = loop.currentModel(result)
		loop.noteMessage(result)
		if len(result.toolCalls) == 0 {
			streamed = strings.TrimSpace(result.content) != ""
			if streamed {
				loop.pushAssistant(result)
			}
			if reminder := loop.plan.reminder(); reminder != "" && loop.budget.canContinue() {
				loop.messages = append(loop.messages, map[string]any{"role": "system", "content": reminder})
				continue
			}
			return actual, loop.plan.incomplete(), streamed, nil
		}
		usedTools = true
		loop.pushToolMessage(result)
		loop.runToolCalls(result.toolCalls)
	}
	stop := ""
	if loop.ctx.Err() == nil && usedTools {
		stop = loop.budget.stopReason
		if stop == "" {
			stop = "已到本轮执行上限"
		}
		loop.send(map[string]any{"type": "status", "phase": "generating", "message": stop + "，正在整理已有结果…"})
		loop.messages = append(loop.messages, map[string]any{"role": "system", "content": stop + "。本轮不再调用工具。根据已有结果交付可确认内容，明确未完成部分；不要声称未执行的操作成功。"})
	}
	return actual, stop, streamed, nil
}

func (loop *agentLoop) spawnSubagent(skillID, prompt string) string {
	if loop.depth > 0 {
		return toolJSON(false, "子任务不能再拆分子任务")
	}
	if strings.TrimSpace(prompt) == "" {
		return toolJSON(false, "缺少 prompt")
	}
	child := *loop
	child.depth = 1
	child.maxRounds = 2
	child.mu = &sync.Mutex{}
	child.plan = &taskPlan{}
	child.send = func(map[string]any) {}
	child.messages = []map[string]any{{"role": "user", "content": strings.TrimSpace(skillID + "\n" + prompt)}}
	names := []string{}
	tools := []map[string]any{}
	for _, name := range loop.names {
		if name == "spawn_subagent" {
			continue
		}
		names = append(names, name)
	}
	for _, tool := range loop.tools {
		fn, _ := tool["function"].(map[string]any)
		name, _ := fn["name"].(string)
		if name != "spawn_subagent" {
			tools = append(tools, tool)
		}
	}
	child.names = names
	child.tools = tools
	child.box = &toolBox{
		ctx: child.ctx, db: loop.box.db, cfg: loop.box.cfg, workspace: loop.box.workspace,
		documents: loop.box.documents, client: loop.box.client, plan: child.plan, results: loop.results,
		budget: loop.budget, allowed: names, mcp: loop.box.mcp,
	}
	_, summary, _, err := child.run()
	if err != nil {
		return toolJSON(false, err.Error())
	}
	body, _ := json.Marshal(map[string]any{"success": true, "subTurnId": newRuntimeID("sub"), "skillId": skillID, "summary": summary, "output": summary})
	return string(body)
}

func roundText(round int) string {
	if round == 0 {
		return "正在请求模型，等待首段响应…"
	}
	return fmt.Sprintf("正在结合工具结果继续处理（第 %d 轮）…", round+1)
}

func (loop *agentLoop) currentModel(round modelRound) string {
	if round.model != "" {
		return round.model
	}
	if len(loop.models) > 0 {
		return loop.models[0]
	}
	return ""
}

func (loop *agentLoop) complete(final, withTools bool) (modelRound, error) {
	if err := loop.budget.consumeModel(final); err != nil {
		return modelRound{}, err
	}
	loop.reasonItemID = ""
	loop.messageItemID = ""
	var last error
	for _, model := range loop.models {
		tools := loop.tools
		if !withTools {
			tools = nil
		}
		body, err := completionBody(model, loop.messages, tools, loop.effort, true)
		if err != nil {
			return modelRound{}, err
		}
		round, err := loop.streamModel(body, withTools)
		if errors.Is(err, errToolsUnsupported) {
			return loop.complete(final, false)
		}
		if err != nil {
			last = err
			loop.reasonItemID = ""
			loop.messageItemID = ""
			continue
		}
		round.model = model
		loop.budget.recordUsage(round.prompt, round.completion, round.usageOK)
		return round, nil
	}
	if last == nil {
		last = errors.New("模型请求失败，未获得有效响应")
	}
	return modelRound{}, last
}

func (loop *agentLoop) pushAssistant(round modelRound) {
	message := map[string]any{"role": "assistant", "content": round.content}
	if preserveReasoning(loop.currentModel(round)) && round.reasoning != "" {
		message["reasoning_content"] = round.reasoning
	}
	loop.messages = append(loop.messages, message)
}

func (loop *agentLoop) pushToolMessage(round modelRound) {
	calls := []any{}
	for _, call := range round.toolCalls {
		item := map[string]any{"id": call.id, "type": "function", "function": map[string]any{"name": call.name, "arguments": call.arguments}}
		if call.extra != nil {
			item["extra_content"] = call.extra
		}
		calls = append(calls, item)
	}
	content := any(round.content)
	if strings.TrimSpace(round.content) == "" {
		content = nil
	}
	message := map[string]any{"role": "assistant", "content": content, "tool_calls": calls}
	if preserveReasoning(loop.currentModel(round)) && round.reasoning != "" {
		message["reasoning_content"] = round.reasoning
	}
	loop.messages = append(loop.messages, message)
}

func (loop *agentLoop) executeCall(call modelToolCall) string {
	started := time.Now()
	display := toolDisplayName(call.name)
	noteTurnEvent(loop.space, "item/started", loop.turnID, loop.threadID, loop.models[0], call.name, "", started)
	itemID := newRuntimeID("tool")
	item := map[string]any{"id": itemID, "kind": "toolCall", "name": call.name, "displayName": display, "args": call.arguments, "callId": call.id, "status": "running", "createdAt": time.Now().UnixMilli()}
	loop.mu.Lock()
	loop.send(map[string]any{"type": "item/started", "turnId": loop.turnID, "itemId": itemID, "kind": "toolCall"})
	loop.send(map[string]any{"type": "item/toolCall/started", "turnId": loop.turnID, "itemId": itemID, "name": call.name, "displayName": display, "args": call.arguments})
	loop.send(map[string]any{"type": "tool_call", "name": call.name, "displayName": display, "status": "running"})
	args, err := parseToolArguments(call.name, call.arguments)
	if err != nil {
		defer loop.mu.Unlock()
		return loop.finishCall(item, toolJSON(false, err.Error()), "error")
	}
	if message := loop.budget.consumeTool(call.name, args); message != "" {
		defer loop.mu.Unlock()
		return loop.finishCall(item, toolJSON(false, message), "error")
	}
	needsApproval := false
	if loop.generationMode != "auto" {
		needsApproval = needsToolApproval(call.name, loop.granted)
	}
	loop.mu.Unlock()
	if needsApproval {
		approvalID := newRuntimeID("appr")
		loop.mu.Lock()
		loop.send(map[string]any{"type": "item/approval/request", "turnId": loop.turnID, "approvalId": approvalID, "toolName": call.name, "displayName": display, "args": args})
		_ = saveTurnState(loop.ctx, loop.box.cfg, loop.space, loop.turnID, "awaiting_approval", loop.models[0], loop.budget.inputTokens, loop.budget.outputTokens, nil)
		loop.mu.Unlock()
		decision := waitForApproval(loop.ctx, loop.space, loop.turnID, approvalID)
		loop.mu.Lock()
		loop.send(map[string]any{"type": "item/approval/resolved", "turnId": loop.turnID, "approvalId": approvalID, "decision": decision})
		approval := map[string]any{"id": "appr_" + approvalID, "kind": "approvalRequest", "approvalId": approvalID, "toolName": call.name, "displayName": display, "args": args, "decision": decision, "createdAt": time.Now().UnixMilli()}
		switch decision {
		case "accept", "acceptForSession":
			approval["status"] = "accepted"
		case "decline":
			approval["status"] = "declined"
		default:
			approval["status"] = "expired"
		}
		loop.persist(approval)
		if decision == "acceptForSession" {
			if def, ok := toolByName(call.name); ok && def.Approval == "per_session" {
				loop.granted[call.name] = true
				rememberSessionTool(loop.space, loop.threadID, call.name)
			}
		}
		if decision == "decline" || decision == "cancel" {
			message := "用户拒绝了此操作"
			outcome := "declined"
			callStatus := "declined"
			if decision == "cancel" {
				message = "审批已取消或任务已停止"
				outcome = "cancelled"
				callStatus = "cancelled"
			}
			defer loop.mu.Unlock()
			return loop.finishCall(item, toolOutcome(false, outcome, message), callStatus)
		}
		_ = saveTurnState(loop.ctx, loop.box.cfg, loop.space, loop.turnID, "running", loop.models[0], loop.budget.inputTokens, loop.budget.outputTokens, nil)
		loop.mu.Unlock()
	}
	result := loop.box.run(call.name, args)
	loop.mu.Lock()
	defer loop.mu.Unlock()
	return loop.finishCall(item, result, "")
}

func (loop *agentLoop) finishCall(item map[string]any, result, status string) string {
	if status == "" {
		status = "done"
		if toolFailed(result) {
			status = "error"
		}
	}
	item["status"] = status
	item["summary"] = summarizeToolResult(result)
	loop.items = append(loop.items, item)
	if loop.persist != nil {
		loop.persist(item)
	}
	completed := map[string]any{
		"type": "item/toolCall/completed", "turnId": loop.turnID, "itemId": item["id"],
		"name": item["name"], "displayName": item["displayName"], "status": status, "summary": item["summary"],
	}
	if action := clientAction(result); action != nil {
		completed["action"] = action
		item["action"] = action
	}
	loop.send(completed)
	loop.send(map[string]any{"type": "tool_result", "name": item["name"], "displayName": item["displayName"], "status": status, "detail": item["summary"], "action": completed["action"]})
	if created, ok := item["createdAt"].(int64); ok {
		noteTurnEvent(loop.space, "item/completed", loop.turnID, loop.threadID, loop.models[0], fmt.Sprint(item["name"]), "", time.UnixMilli(created))
	}
	return result
}

func (loop *agentLoop) finalReply() (string, error) {
	if !loop.budget.canContinue() && loop.budget.modelRequests >= maxModelRequests {
		return "", nil
	}
	round, err := loop.complete(true, false)
	if err != nil {
		return "", err
	}
	loop.noteMessage(round)
	return loop.currentModel(round), nil
}
