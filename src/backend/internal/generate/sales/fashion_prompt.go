package sales

import (
	"fmt"
	"math"
	"strings"
	"unicode"
)

func fashionVoiceoverBudget(seconds int) (int, int) {
	if seconds < 1 {
		seconds = 1
	}
	limits := installedSalesSkill.SpeechLimits
	return int(math.Round(float64(seconds) * limits.MinRate)), int(math.Round(float64(seconds) * limits.MaxRate))
}

func fashionPreferredVoiceoverBudget(seconds int) (int, int) {
	seconds = max(seconds, 1)
	limits := installedSalesSkill.SpeechLimits
	return int(math.Round(float64(seconds) * limits.PreferredMinRate)), int(math.Round(float64(seconds) * limits.PreferredMaxRate))
}

func fashionVoiceoverBudgetPrompt(seconds int) string {
	low, preferred := fashionPreferredVoiceoverBudget(seconds)
	_, high := fashionVoiceoverBudget(seconds)
	return fmt.Sprintf("\n目标 %d 秒，日常口播优先合计 %d–%d 个汉字，在此区间完成引入、解释与收束，全片不超过 %d 个汉字。建议区间已按全片时长包含短换气与收势，不逐段重复预留头尾；明确的长展示或换装先扣除静默时长，再按剩余时间估算台词。以轻快穿搭分享语气按短语连贯说，重点自然强调，不逐字拖音或用长停顿撑满时间；不要靠倍速或赶话容纳超量台词。各段密度按内容变化，单段每秒 %g 字只是异常拦截上限，不是目标。标点、数字、字母和省略号不计入汉字数，数字和英文须按实际读音另留时间。", seconds, low, preferred, high, installedSalesSkill.SpeechLimits.ShotMaxRate)
}

func fashionShotVoiceoverCap(seconds int) int {
	if seconds < 1 {
		seconds = 1
	}
	return int(math.Floor(float64(seconds) * installedSalesSkill.SpeechLimits.ShotMaxRate))
}

func voiceoverHanCount(text string) int {
	count := 0
	for _, r := range text {
		if unicode.Is(unicode.Han, r) {
			count++
		}
	}
	return count
}

func validateFashionVoiceover(shots []ScriptShot, target int) error {
	if len(shots) == 0 {
		return fmt.Errorf("口播缺少分段")
	}
	low, high := fashionVoiceoverBudget(target)
	total := 0
	var joined strings.Builder
	for _, shot := range shots {
		count := voiceoverHanCount(shot.Voiceover)
		total += count
		limit := fashionShotVoiceoverCap(shot.Duration)
		if count < installedSalesSkill.SpeechLimits.MinShotHan {
			return fmt.Errorf("第 %d 段口播有 %d 个汉字，至少写一句能说完的话", shot.ShotId, count)
		}
		if count > limit {
			return fmt.Errorf("第 %d 段口播有 %d 个汉字，%d 秒不要超过 %d 个", shot.ShotId, count, shot.Duration, limit)
		}
		joined.WriteString(shot.Voiceover)
	}
	if total < low || total > high {
		return fmt.Errorf("口播合计 %d 个汉字，%d 秒应写 %d 到 %d 个", total, target, low, high)
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
