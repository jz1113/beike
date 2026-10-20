package assistant

import "strings"

// Preserve native message blocks only inside the server-side conversation.
func (loop *agentLoop) pushAssistant(round modelRound) {
	message := map[string]any{"role": "assistant", "content": round.content}
	if round.native != nil {
		message["native_content"] = round.native
	}
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
	if round.native != nil {
		message["native_content"] = round.native
	}
	if preserveReasoning(loop.currentModel(round)) && round.reasoning != "" {
		message["reasoning_content"] = round.reasoning
	}
	loop.messages = append(loop.messages, message)
}
