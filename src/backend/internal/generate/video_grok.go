package generate

import (
	"encoding/json"
	"regexp"
	"strings"
)

func grokVoiceBodyError(payload map[string]json.RawMessage) string {
	if message := stringList(payload, "voice_ids", 3); message != "" {
		return message
	}
	var values []json.RawMessage
	_ = json.Unmarshal(payload["voice_ids"], &values)
	for _, value := range values {
		if message := boundedString(value, 64, true, ""); message != "" {
			return message
		}
	}
	return ""
}

func grokVoiceInputError(payload map[string]json.RawMessage, model, mode string) string {
	voices := rawStringList(payload["voice_ids"])
	if len(voices) == 0 {
		return ""
	}
	if !regexp.MustCompile(`(?i)^grok-imagine-video-1[.-]5(?:-preview)?$`).MatchString(strings.TrimSpace(model)) {
		return "官方预置音色仅支持 Grok Imagine Video 1.5"
	}
	if len(rawStringList(payload["audios"])) > 0 {
		return "Grok 官方预置音色不能与自定义声音样本同时使用；音频文件参考需要 xAI 专门权限"
	}
	if mode == "edit" || mode == "extend" {
		return "Grok 编辑和延长视频不支持选择官方预置音色，请切换生成方式"
	}
	if audio, set := rawBoolPresent(payload, "audio"); set && !audio {
		return "Grok 官方预置音色需要开启生成声音"
	}
	if strings.EqualFold(rawStringValue(payload["resolution"]), "1080P") {
		return "Grok 官方预置音色参考最高支持 720P，请降低清晰度"
	}
	if len(voices) > 3 {
		return "Grok 最多支持 3 个官方预置音色"
	}
	return ""
}

func attachGrokVoiceReferences(body map[string]any, voiceIDs []string) {
	if len(voiceIDs) == 0 {
		return
	}
	voices := make([]map[string]string, 0, len(voiceIDs))
	for _, id := range voiceIDs {
		voices = append(voices, map[string]string{"voice_id": strings.ToLower(strings.TrimSpace(id))})
	}
	body["reference_audios"] = voices
}
