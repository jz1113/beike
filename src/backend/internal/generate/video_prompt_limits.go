package generate

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Reject before uploading references or creating a paid task. Wan truncates an
// overlong prompt upstream; losing the final action/audio rules is not acceptable.
func videoPromptInputError(payload map[string]json.RawMessage, model string) string {
	limit := 0
	label := ""
	switch {
	case minimaxH3(model):
		limit, label = 7000, "MiniMax-H3"
	case strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "wan3"):
		limit, label = 20000, "万相 3.0"
	default:
		return ""
	}
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	if rawBool(payload, "preserve_prompt") {
		_ = json.Unmarshal(payload["prompt"], &prompt)
	} else if minimaxH3(model) {
		audio, set := rawBoolPresent(payload, "audio")
		body := minimaxH3Payload(model, prompt, "text", "16:9", "768P", 5, nil, nil, audio, set, false)
		prompt, _ = body["content"].([]map[string]any)[0]["text"].(string)
	}
	if count := utf8.RuneCountInString(prompt); count > limit {
		return fmt.Sprintf("%s 视频提示词最多 %d 个字符，当前 %d 个；请精简提示词后重试，保留商品、场景、动作与声音要求", label, limit, count)
	}
	return ""
}

func videoSeedInputError(payload map[string]json.RawMessage, model string) string {
	if videoFamily(model) != "wan" || payload["seed"] == nil {
		return ""
	}
	seed := rawNumber(payload, "seed")
	if seed < -1 || seed > 2147483647 {
		return "万相随机种子须为 -1 或 0～2147483647 的整数"
	}
	return ""
}

func attachVideoSeed(body map[string]any, family string, payload map[string]json.RawMessage) {
	if family == "wan" && payload["seed"] != nil {
		body["parameters"].(map[string]any)["seed"] = int64(rawNumber(payload, "seed"))
	}
}
