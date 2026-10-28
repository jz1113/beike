package sales

import (
	"fmt"
	"strings"
)

func fashionVoiceoverBudgetPrompt(seconds int) string {
	return fmt.Sprintf("\n目标 %d 秒。口播不设置固定字数、字/秒或固定语速；按商品脚本、动作容量和正常人语速完成引入、解释与收束，长展示或换装时自然减少口播。先保证听得懂、说得完、嘴部可执行，保留短换气和完整句尾，不靠倍速、拖腔或重复卖点填满时间。", seconds)
}

func validateFashionVoiceover(shots []ScriptShot, target int) error {
	_ = target
	if len(shots) == 0 {
		return fmt.Errorf("口播缺少分段")
	}
	var joined strings.Builder
	for _, shot := range shots {
		joined.WriteString(shot.Voiceover)
	}
	for _, phrase := range installedSalesSkill.SpeechLimits.DisallowedPhrases {
		if strings.Contains(joined.String(), phrase) {
			return fmt.Errorf("口播包含空号召「%s」，请改成具体穿法", phrase)
		}
	}
	return nil
}

func normalizeFashionBeat(beat, productName string) string {
	switch strings.TrimSpace(beat) {
	case "unbox", "lifestyle", "accessory":
		return strings.TrimSpace(beat)
	}
	if fashionAccessoryName(productName) {
		return "accessory"
	}
	return "lifestyle"
}

func fashionAccessoryName(name string) bool {
	if strings.Contains(name, "衣") || strings.Contains(name, "裤") || strings.Contains(name, "裙") || strings.Contains(name, "外套") {
		return false
	}
	return strings.Contains(name, "鞋") || strings.Contains(name, "包")
}
