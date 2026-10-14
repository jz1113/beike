package assistant

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	maxModelRequests     = 10
	maxToolCalls         = 24
	maxAgentRounds       = 6
	maxRepeatedToolCalls = 3
	maxSubAgents         = 2
	toolStoreThreshold   = 12_000
	toolContextLimit     = 48_000
)

type execBudget struct {
	modelRequests int
	toolCalls     int
	subAgents     int
	stopReason    string
	inputTokens   int
	outputTokens  int
	usageReports  int
	repeats       map[string]int
	deadline      time.Time
}

func newBudget() *execBudget {
	return &execBudget{repeats: map[string]int{}, deadline: time.Now().Add(10 * time.Minute)}
}

func (b *execBudget) canContinue() bool {
	return b.stopReason == "" && b.modelRequests < maxModelRequests-1 && time.Now().Before(b.deadline)
}

func (b *execBudget) consumeModel(final bool) error {
	reserve := 1
	if final {
		reserve = 0
	}
	if b.modelRequests >= maxModelRequests-reserve {
		return errBudget("已达到本轮模型请求上限，请基于已有结果结束本轮")
	}
	b.modelRequests++
	return nil
}

func (b *execBudget) recordUsage(prompt, completion int, ok bool) {
	if !ok {
		return
	}
	if prompt > 0 {
		b.inputTokens += prompt
	}
	if completion > 0 {
		b.outputTokens += completion
	}
	b.usageReports++
}

func (b *execBudget) consumeTool(name string, args map[string]any) string {
	if b.stopReason != "" {
		return b.stopReason
	}
	if b.toolCalls >= maxToolCalls {
		b.stopReason = "已达到本轮工具调用上限，已停止继续执行"
		return b.stopReason
	}
	key := toolCallKey(name, args)
	count := b.repeats[key] + 1
	if count > maxRepeatedToolCalls {
		return "工具 " + name + " 的相同参数已重复调用。请复用已有结果、调整参数或改用其他工具；不要继续相同调用"
	}
	if name == "spawn_subagent" && b.subAgents >= maxSubAgents {
		return "已达到本轮子任务上限，请直接完成剩余任务"
	}
	b.repeats[key] = count
	b.toolCalls++
	if name == "spawn_subagent" {
		b.subAgents++
	}
	return ""
}

func toolCallKey(name string, args map[string]any) string {
	body, _ := json.Marshal(stableValue(args))
	return name + "\x00" + string(body)
}

func stableValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		out := map[string]any{}
		for _, key := range keys {
			out[key] = stableValue(typed[key])
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = stableValue(item)
		}
		return out
	default:
		return value
	}
}

type errBudget string

func (e errBudget) Error() string { return string(e) }

type resultStore struct {
	values map[string]string
	size   int
}

func (s *resultStore) forModel(raw string, threshold int) string {
	if s.values == nil {
		s.values = map[string]string{}
	}
	text := stripVisual(raw)
	if len(text) <= threshold {
		return text
	}
	if s.size+len(text) > 4_000_000 {
		return `{"success":false,"error":"本轮工具输出存储已满，请缩小查询范围。此结果未完整传入模型。"}`
	}
	id := "result_" + strconv.Itoa(len(s.values)+1)
	s.values[id] = text
	s.size += len(text)
	preview := text
	if len(preview) > 4000 {
		preview = preview[:4000]
	}
	half := threshold / 2
	if len(preview) > half {
		preview = preview[:half]
	}
	body, _ := json.Marshal(map[string]any{
		"storedResult": id, "totalCharacters": len(text), "preview": preview,
		"instruction": "仅展示预览。使用 read_tool_result 按 result_id 和 offset 读取后续内容；需要全文处理时必须读取完整结果。",
	})
	return string(body)
}

func (s *resultStore) read(id string, offset, length int) string {
	value, ok := s.values[id]
	if !ok {
		return `{"success":false,"error":"未找到本轮工具结果"}`
	}
	if offset < 0 {
		offset = 0
	}
	if offset > len(value) {
		offset = len(value)
	}
	if length < 1 {
		length = 4000
	}
	if length > 8000 {
		length = 8000
	}
	end := offset + length
	if end > len(value) {
		end = len(value)
	}
	var next any
	if end < len(value) {
		next = end
	}
	body, _ := json.Marshal(map[string]any{
		"success": true, "resultId": id, "offset": offset, "nextOffset": next,
		"totalCharacters": len(value), "excerpt": value[offset:end],
	})
	return string(body)
}

func stripVisual(raw string) string {
	var parsed map[string]any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return raw
	}
	if _, ok := parsed["_visualImages"]; ok {
		delete(parsed, "_visualImages")
		body, err := json.Marshal(parsed)
		if err == nil {
			return string(body)
		}
	}
	return raw
}

func compactToolContext(messages []map[string]any, store *resultStore) int {
	type slot struct {
		index int
		text  string
	}
	slots := []slot{}
	total := 0
	for i, message := range messages {
		if message["role"] != "tool" {
			continue
		}
		text, _ := message["content"].(string)
		if text == "" {
			continue
		}
		slots = append(slots, slot{i, text})
		total += len(text)
	}
	if total <= toolContextLimit {
		return 0
	}
	count := 0
	limit := len(slots) - 4
	for i := 0; i < limit; i++ {
		if total <= 32_000 {
			break
		}
		raw := slots[i].text
		if len(raw) < 2500 {
			continue
		}
		var stored map[string]any
		if json.Unmarshal([]byte(raw), &stored) == nil {
			if _, ok := stored["storedResult"]; ok {
				continue
			}
		}
		compacted := store.forModel(raw, 2000)
		if len(compacted) >= len(raw) {
			continue
		}
		var check map[string]any
		if json.Unmarshal([]byte(compacted), &check) != nil || check["storedResult"] == nil {
			continue
		}
		messages[slots[i].index]["content"] = compacted
		total -= len(raw) - len(compacted)
		count++
	}
	return count
}

type planStep struct {
	Title    string `json:"title"`
	Status   string `json:"status"`
	Evidence string `json:"evidence,omitempty"`
}

type taskPlan struct {
	steps     []planStep
	reminders int
}

func (p *taskPlan) update(args map[string]any) string {
	raw, _ := json.Marshal(args["steps"])
	var steps []planStep
	if json.Unmarshal(raw, &steps) != nil || len(steps) < 1 || len(steps) > 8 {
		return `{"success":false,"error":"计划需包含 1–8 个步骤，每步提供 title、status，可附 evidence。"}`
	}
	active := 0
	for _, step := range steps {
		title := strings.TrimSpace(step.Title)
		if title == "" || len([]rune(title)) > 160 {
			return `{"success":false,"error":"计划需包含 1–8 个步骤，每步提供 title、status，可附 evidence。"}`
		}
		switch step.Status {
		case "pending", "in_progress", "completed", "blocked":
		default:
			return `{"success":false,"error":"计划需包含 1–8 个步骤，每步提供 title、status，可附 evidence。"}`
		}
		if step.Status == "in_progress" {
			active++
		}
		if (step.Status == "completed" || step.Status == "blocked") && strings.TrimSpace(step.Evidence) == "" {
			return `{"success":false,"error":"完成步骤需注明验证结果；受阻步骤需注明具体原因。"}`
		}
		if len([]rune(step.Evidence)) > 600 {
			return `{"success":false,"error":"计划需包含 1–8 个步骤，每步提供 title、status，可附 evidence。"}`
		}
		step.Title = title
	}
	if active > 1 {
		return `{"success":false,"error":"仅保留一个当前进行中的步骤。"}`
	}
	p.steps = steps
	body, _ := json.Marshal(map[string]any{"success": true, "plan": steps})
	return string(body)
}

func (p *taskPlan) incomplete() string {
	parts := []string{}
	for _, step := range p.steps {
		if step.Status == "completed" {
			continue
		}
		note := "待完成"
		if step.Status == "blocked" {
			note = step.Evidence
		}
		parts = append(parts, step.Title+"（"+note+"）")
	}
	if len(parts) == 0 {
		return ""
	}
	return "尚未完成：" + strings.Join(parts, "；")
}

func (p *taskPlan) reminder() string {
	open := false
	for _, step := range p.steps {
		if step.Status == "pending" || step.Status == "in_progress" {
			open = true
		}
	}
	if !open || p.reminders >= 2 {
		return ""
	}
	p.reminders++
	return "执行清单仍有未完成项：" + p.incomplete() + "。继续完成并验证，再用 update_plan 更新状态；确实受阻时注明原因并标记 blocked。不要仅凭计划声称任务已完成。"
}
