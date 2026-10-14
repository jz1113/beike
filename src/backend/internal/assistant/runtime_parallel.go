package assistant

import "sync"

var sequentialTools = map[string]bool{
	"update_plan": true, "execute_code": true, "workspace_navigate": true,
	"workspace_load_workshop_product": true, "trigger_generate": true, "set_workshop_arch": true,
	"spawn_subagent": true, "deconstruct_image": true, "inspect_video_media": true,
	"extract_video_storyboard": true, "extract_video_detailed_frames": true,
}

func isParallelSafe(name string) bool {
	if len(name) >= 4 && name[:4] == "mcp_" {
		return false
	}
	return !sequentialTools[name]
}

func toolGroups(names []string) [][]int {
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
		if isParallelSafe(name) {
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
	names := make([]string, len(calls))
	for i, call := range calls {
		names[i] = call.name
	}
	for _, group := range toolGroups(names) {
		if len(group) == 1 && !isParallelSafe(calls[group[0]].name) {
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
		loop.messages = append(loop.messages, map[string]any{"role": "user", "content": follow})
	}
	loop.messages = append(loop.messages, map[string]any{"role": "tool", "tool_call_id": call.id, "content": loop.results.forModel(output, toolStoreThreshold)})
}
