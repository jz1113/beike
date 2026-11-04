package sales

import "encoding/json"

const spokenCopyMaxAttempts = 3

// Keep the original facts, timeline, budget and saved system prompt intact. Only
// the latest rejected draft is sent back as data so failed attempts do not grow
// the conversation or become a new source of product claims.
func spokenCopyRetryMessage(data map[string]any, validationErr error, attempt int) map[string]any {
	var previous string
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			if message, ok := choice["message"].(map[string]any); ok {
				previous, _ = message["content"].(string)
			}
		}
	}
	feedback, _ := json.Marshal(struct {
		Attempt         int    `json:"attempt"`
		ValidationError string `json:"validationError"`
		PreviousOutput  string `json:"previousOutput"`
	}{attempt, validationErr.Error(), previous})
	return map[string]any{"role": "user", "content": "自动校验反馈数据：\n" + string(feedback)}
}
