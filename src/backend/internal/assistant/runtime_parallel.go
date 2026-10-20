package assistant

import (
	"encoding/json"
	"strings"
	"sync"
)

var sequentialTools = map[string]bool{
	"update_plan": true, "execute_code": true, "workspace_navigate": true,
	"workspace_load_workshop_product": true, "trigger_generate": true, "set_workshop_arch": true,
	"trigger_generate_batch": true,
	"spawn_subagent":         true, "deconstruct_image": true, "inspect_video_media": true,
	"read_skill": true, "load_mcp_tool": true,
	"extract_video_storyboard": true, "extract_video_detailed_frames": true,
}

func isParallelSafe(name string) bool {
	return parallelSafe(name, mcpBinding{}, false)
}

func parallelSafe(name string, binding mcpBinding, known bool) bool {
	if known {
		return binding.readOnly && !binding.destructive && !binding.openWorld
	}
	if strings.HasPrefix(name, "mcp_") {
		return false
	}
	return !sequentialTools[name]
}

func toolGroups(names []string) [][]int {
	return toolGroupsWith(names, isParallelSafe)
}

func toolGroupsWith(names []string, safe func(string) bool) [][]int {
	groups := [][]int{}
	var current []int
	flush := func() {
		if len(current) == 0 {
			return
		}
		groups = append(groups, current)
		current = nil
	}
	for index, name := range names {
		if safe(name) {
			current = append(current, index)
			continue
		}
		flush()
		groups = append(groups, []int{index})
	}
	flush()
	return groups
}

func (loop *agentLoop) runToolCalls(calls []modelToolCall) {
	defer loop.flushToolNotes()
	names := make([]string, len(calls))
	for i, call := range calls {
		names[i] = call.name
	}
	safe := func(name string) bool {
		binding, known := loop.box.mcp[name]
		return parallelSafe(name, binding, known)
	}
	for _, group := range toolGroupsWith(names, safe) {
		if len(group) == 1 && !safe(calls[group[0]].name) {
			loop.recordTool(calls[group[0]], loop.executeCall(calls[group[0]]))
			continue
		}
		outputs := make([]string, len(group))
		var wait sync.WaitGroup
		limit := make(chan struct{}, 3)
		for offset, index := range group {
			wait.Add(1)
			limit <- struct{}{}
			go func(offset, index int) {
				defer wait.Done()
				defer func() { <-limit }()
				outputs[offset] = loop.executeCall(calls[index])
			}(offset, index)
		}
		wait.Wait()
		for offset, index := range group {
			loop.recordTool(calls[index], outputs[offset])
		}
	}
}

func (loop *agentLoop) recordTool(call modelToolCall, output string) {
	if follow := visualFollowup(output); follow != nil {
		loop.toolVisuals = append(loop.toolVisuals, map[string]any{"role": "user", "content": follow})
	}
	loop.messages = append(loop.messages, map[string]any{"role": "tool", "tool_call_id": call.id, "content": loop.results.forModel(output, toolResultThreshold(call.name))})
	if note := unfinishedToolNote(call.name, output); note != "" {
		loop.toolNotes = append(loop.toolNotes, note)
	}
}

func (loop *agentLoop) flushToolNotes() {
	// All tool results must immediately follow their assistant tool-use block.
	loop.messages = append(loop.messages, loop.toolVisuals...)
	loop.toolVisuals = nil
	for _, note := range loop.toolNotes {
		loop.messages = append(loop.messages, map[string]any{"role": "system", "content": note})
	}
	loop.toolNotes = nil
}

func unfinishedToolNote(name, output string) string {
	var parsed map[string]any
	if json.Unmarshal([]byte(output), &parsed) != nil {
		return ""
	}
	success, ok := parsed["success"].(bool)
	if !ok || success {
		return ""
	}
	display := toolDisplayName(name)
	outcome, _ := parsed["outcome"].(string)
	if outcome == "declined" || outcome == "cancelled" {
		return "「" + display + "」没有执行。下一句先说明未执行，不要把该操作写成已经完成。如果仍可根据已经附带的画面或其他已有信息直接回答，必须标明这是直接回答，不是该工具的结果。"
	}
	return "「" + display + "」没有完成。下一句先说明失败，不要把未完成的操作写成已经成功。"
}
