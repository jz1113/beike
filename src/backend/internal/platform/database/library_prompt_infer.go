package database

import (
	"encoding/json"
	"regexp"
	"strings"
)

func inferCreateSubcategory(data map[string]any) string {
	if value, ok := data["productSubcategory"]; ok {
		text, _ := value.(string)
		return text
	}
	title, _ := data["title"].(string)
	titleKind := digitalKind(title)
	shotKind := shotDigitalKind(data["shotPromptsJson"])
	if titleKind != "" && shotKind != "" && titleKind != shotKind {
		return ""
	}
	if titleKind != "" {
		return titleKind
	}
	return shotKind
}

func digitalKind(text string) string {
	subject := digitalEvidence(text)
	switch {
	case casePattern.MatchString(subject):
		return "case"
	case earphonePattern.MatchString(subject):
		return "earphone"
	case tabletPattern.MatchString(subject):
		return "tablet"
	case isPhoneProduct(subject) || phoneBodyPattern.MatchString(subject):
		return "phone"
	default:
		return ""
	}
}

func digitalEvidence(text string) string {
	subject := negativeAccessoryPattern.ReplaceAllString(text, "")
	return phoneCameraPattern.ReplaceAllString(subject, "")
}

func isPhoneProduct(title string) bool {
	sold := giftedAccessoryPattern.ReplaceAllString(title, "")
	sold = strings.TrimSpace(sold)
	if accessoryTitlePattern.MatchString(sold) {
		return false
	}
	if phoneTitlePattern.MatchString(sold) {
		return true
	}
	return phoneBrandPattern.MatchString(sold) && phoneScreenPattern.MatchString(sold) && phoneChipPattern.MatchString(sold) && phoneRadioPattern.MatchString(sold)
}

func shotDigitalKind(raw any) string {
	shots := shotTexts(raw)
	if len(shots) == 0 {
		return ""
	}
	if countKind(shots, shotCasePattern) >= 2 {
		return "case"
	}
	if countKind(shots, shotEarphonePattern) >= 2 {
		return "earphone"
	}
	if countKind(shots, shotTabletPattern) >= 2 {
		return "tablet"
	}
	if countKind(shots, shotPhonePattern) >= 2 || phoneSubjectVotes(raw) >= 2 {
		return "phone"
	}
	return ""
}

func shotTexts(raw any) []string {
	var parsed any
	switch typed := raw.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return nil
		}
	default:
		parsed = raw
	}
	list, ok := parsed.([]any)
	if !ok {
		return nil
	}
	texts := []string{}
	for _, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		title, _ := object["title"].(string)
		prompt, _ := object["prompt"].(string)
		texts = append(texts, digitalEvidence(title+" "+shotSubjectText(prompt)))
	}
	return texts
}

func shotSubjectText(prompt string) string {
	observed := []string{}
	for _, heading := range []string{"主体", "穿搭或物体细节", "物体细节", "动作或摆放"} {
		if section := promptSection(prompt, heading); section != "" {
			observed = append(observed, section)
		}
	}
	if len(observed) > 0 {
		return strings.Join(observed, "；")
	}
	parts := regexp.MustCompile(`【画质与限制】|【负面约束】`).Split(prompt, 2)
	text := parts[0]
	if len([]rune(text)) > 220 {
		return string([]rune(text)[:220])
	}
	return text
}

func promptSection(prompt, heading string) string {
	pattern := regexp.MustCompile(`【` + regexp.QuoteMeta(heading) + `】\s*([\s\S]*?)(?:\n?【[^】]+】|$)`)
	match := pattern.FindStringSubmatch(prompt)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func countKind(texts []string, pattern *regexp.Regexp) int {
	count := 0
	for _, text := range texts {
		if pattern.MatchString(text) {
			count++
		}
	}
	return count
}

func phoneSubjectVotes(raw any) int {
	var parsed any
	switch typed := raw.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return 0
		}
	default:
		parsed = raw
	}
	list, ok := parsed.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		prompt, _ := object["prompt"].(string)
		if digitalKind(promptSection(prompt, "主体")) == "phone" {
			count++
		}
	}
	return count
}

var (
	negativeAccessoryPattern = regexp.MustCompile(`(?:无|没有|不含|不要|不带|禁止|去掉|去除|未搭配)\s*(?:手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|贴膜|耳机|耳塞|耳麦|平板)`)
	phoneCameraPattern       = regexp.MustCompile(`(?:使用|用|以|通过)?手机(?:拍摄|摄影|原相机|直出|记录)|(?i:shot\s+on\s+iphone(?:\s+\d+\s*(?:pro|max|plus)?)?)`)
	casePattern              = regexp.MustCompile(`手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|phone\s*case`)
	earphonePattern          = regexp.MustCompile(`耳机|耳麦|耳塞|蓝牙耳塞|airpods|earbuds|headphones`)
	tabletPattern            = regexp.MustCompile(`平板|ipad|tablet`)
	phoneBodyPattern         = regexp.MustCompile(`手机本体|手机裸机|直板手机|折叠屏手机|手机正反面|实机(?:展示|开箱|外观)`)
	giftedAccessoryPattern   = regexp.MustCompile(`(?:赠送|赠|配赠|附赠)[^，,；;]{0,24}(?:手机壳|保护壳|钢化膜|手机支架|手机座|手机夹|充电器|数据线)`)
	accessoryTitlePattern    = regexp.MustCompile(`手机壳|保护壳|保护套|手机挂绳|手机挂饰|手机膜|钢化膜|屏幕膜|镜头膜|贴膜|手机支架|手机座|手机夹|手机充电器|充电头|充电宝|移动电源|数据线|充电线|手机散热器|手机稳定器|耳机|手表|平板|笔记本|电脑|matepad|xiaomi\s*pad|\b(?:phone\s*case|screen\s*protector|charger|power\s*bank|earbuds?|buds|watch|tablet|ipad|pad|tab|laptop)\b`)
	phoneTitlePattern        = regexp.MustCompile(`手机|智能机|iphone|redmi|iqoo|红米|小米\s*\d|小米note|galaxy|pixel\s*\d|smartphone|(?:vivo|oppo|荣耀|honor|realme|一加|华为|huawei|三星|samsung|nova|oneplus)\s*[a-z0-9][a-z0-9\s+.-]{0,16}\d`)
	phoneBrandPattern        = regexp.MustCompile(`华为|huawei|荣耀|honor|vivo|oppo|realme|一加|oneplus|三星|samsung|小米|xiaomi`)
	phoneScreenPattern       = regexp.MustCompile(`曲面屏|护眼屏|直屏|折叠屏|屏幕`)
	phoneChipPattern         = regexp.MustCompile(`鸿蒙系统|harmonyos|麒麟\s*\d{3,5}|骁龙\s*\d{3,5}|天玑\s*\d{3,5}`)
	phoneRadioPattern        = regexp.MustCompile(`\d{4,5}\s*mah|全网通|双卡双待|北斗卫星|5g`)
	shotCasePattern          = regexp.MustCompile(`手机壳|保护壳|保护套|手机套|贴膜|镜头膜|钢化膜|屏幕膜`)
	shotEarphonePattern      = regexp.MustCompile(`耳机|耳麦|耳塞|充电盒`)
	shotTabletPattern        = regexp.MustCompile(`平板|ipad|tablet`)
	shotPhonePattern         = regexp.MustCompile(`手机.{0,8}(?:正面|背面|屏幕|机身|摄像头|镜头模组|中框|边框|外观)|手机本体|手机裸机|机身(?:正面|背面)|后置摄像头|前摄开孔|屏幕边框`)
)
