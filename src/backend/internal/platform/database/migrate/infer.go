package migrate

import (
	"encoding/json"
	"regexp"
	"strings"
)

type shotSkeleton struct {
	Title  string
	Prompt string
}

func parseGroupShots(raw string) []shotSkeleton {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var items []map[string]any
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil
	}
	shots := make([]shotSkeleton, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		shots = append(shots, shotSkeleton{Title: textValue(item["title"]), Prompt: textValue(item["prompt"])})
	}
	return shots
}

func textValue(value any) string {
	text, _ := value.(string)
	return text
}

func sourcePromptSection(prompt, heading string) string {
	marker := "【" + heading + "】"
	index := strings.Index(prompt, marker)
	if index < 0 {
		return ""
	}
	rest := strings.TrimLeft(prompt[index+len(marker):], " \t\r\n")
	end := len(rest)
	if next := strings.Index(rest, "【"); next >= 0 {
		end = next
		if end > 0 && rest[end-1] == '\n' {
			end--
		}
	}
	return strings.TrimSpace(rest[:end])
}

func digitalEvidence(text string) string {
	text = regexp.MustCompile(`(?:无|没有|不含|不要|不带|禁止|去掉|去除|未搭配)\s*(?:手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|贴膜|耳机|耳塞|耳麦|平板)`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`(?:使用|用|以|通过)?手机(?:拍摄|摄影|原相机|直出|记录)`).ReplaceAllString(text, "")
	return regexp.MustCompile(`(?i)shot\s+on\s+iphone(?:\s+\d+\s*(?:pro|max|plus)?)?`).ReplaceAllString(text, "")
}

func isPhoneProduct(title string) bool {
	sold := regexp.MustCompile(`(?:赠送|赠|配赠|附赠)[^，,；;]{0,24}(?:手机壳|保护壳|钢化膜|手机支架|手机座|手机夹|充电器|数据线)`).ReplaceAllString(title, "")
	sold = strings.TrimSpace(sold)
	if regexp.MustCompile(`(?i)手机壳|保护壳|保护套|手机挂绳|手机挂饰|手机膜|钢化膜|屏幕膜|镜头膜|贴膜|手机支架|手机座|手机夹|手机充电器|充电头|充电宝|移动电源|数据线|充电线|手机散热器|手机稳定器|耳机|手表|平板|笔记本|电脑|matepad|xiaomi\s*pad|\b(?:phone\s*case|screen\s*protector|charger|power\s*bank|earbuds?|buds|watch|tablet|ipad|pad|tab|laptop)\b`).MatchString(sold) {
		return false
	}
	if regexp.MustCompile(`(?i)手机|智能机|iphone|redmi|iqoo|红米|小米\s*\d|小米note|galaxy|pixel\s*\d|smartphone|(?:vivo|oppo|荣耀|honor|realme|一加|华为|huawei|三星|samsung|nova|oneplus)\s*[a-z0-9][a-z0-9\s+.-]{0,16}\d`).MatchString(sold) {
		return true
	}
	return regexp.MustCompile(`(?i)华为|huawei|荣耀|honor|vivo|oppo|realme|一加|oneplus|三星|samsung|小米|xiaomi`).MatchString(sold) &&
		regexp.MustCompile(`(?i)曲面屏|护眼屏|直屏|折叠屏|屏幕`).MatchString(sold) &&
		regexp.MustCompile(`(?i)鸿蒙系统|harmonyos|麒麟\s*\d{3,5}|骁龙\s*\d{3,5}|天玑\s*\d{3,5}`).MatchString(sold) &&
		regexp.MustCompile(`(?i)\d{4,5}\s*mah|全网通|双卡双待|北斗卫星|5g`).MatchString(sold)
}

func digitalKind(text string) string {
	subject := digitalEvidence(text)
	switch {
	case regexp.MustCompile(`(?i)手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|phone\s*case`).MatchString(subject):
		return "case"
	case regexp.MustCompile(`(?i)耳机|耳麦|耳塞|蓝牙耳塞|airpods|earbuds|headphones`).MatchString(subject):
		return "earphone"
	case regexp.MustCompile(`(?i)平板|ipad|tablet`).MatchString(subject):
		return "tablet"
	case isPhoneProduct(subject) || regexp.MustCompile(`手机本体|手机裸机|直板手机|折叠屏手机|手机正反面|实机(?:展示|开箱|外观)`).MatchString(subject):
		return "phone"
	default:
		return ""
	}
}

func shotSubjectText(prompt string) string {
	var observed []string
	for _, heading := range []string{"主体", "穿搭或物体细节", "物体细节", "动作或摆放"} {
		if section := sourcePromptSection(prompt, heading); section != "" {
			observed = append(observed, section)
		}
	}
	if len(observed) > 0 {
		return strings.Join(observed, "；")
	}
	head := prompt
	if index := regexp.MustCompile(`【画质与限制】|【负面约束】`).FindStringIndex(prompt); index != nil {
		head = prompt[:index[0]]
	}
	runes := []rune(head)
	if len(runes) > 220 {
		runes = runes[:220]
	}
	return string(runes)
}

func kindFromShots(raw string) string {
	shots := parseGroupShots(raw)
	if len(shots) == 0 {
		return ""
	}
	observed := make([]string, len(shots))
	for i, shot := range shots {
		observed[i] = digitalEvidence(shot.Title + " " + shotSubjectText(shot.Prompt))
	}
	count := func(pattern string) int {
		re := regexp.MustCompile(pattern)
		n := 0
		for _, text := range observed {
			if re.MatchString(text) {
				n++
			}
		}
		return n
	}
	switch {
	case count(`手机壳|保护壳|保护套|手机套|贴膜|镜头膜|钢化膜|屏幕膜`) >= 2:
		return "case"
	case count(`耳机|耳麦|耳塞|充电盒`) >= 2:
		return "earphone"
	case count(`(?i)平板|ipad|tablet`) >= 2:
		return "tablet"
	case count(`手机.{0,8}(?:正面|背面|屏幕|机身|摄像头|镜头模组|中框|边框|外观)|手机本体|手机裸机|机身(?:正面|背面)|后置摄像头|前摄开孔|屏幕边框`) >= 2:
		return "phone"
	}
	votes := 0
	for _, shot := range shots {
		if subject := sourcePromptSection(shot.Prompt, "主体"); subject != "" && digitalKind(subject) == "phone" {
			votes++
		}
	}
	if votes >= 2 {
		return "phone"
	}
	return ""
}

func inferPromptGroupSubcategory(title, shots string) string {
	titleKind := digitalKind(title)
	shotKind := kindFromShots(shots)
	if titleKind != "" && shotKind != "" && titleKind != shotKind {
		return ""
	}
	if titleKind != "" {
		return titleKind
	}
	return shotKind
}

func isPromptGroupSubcategory(value string) bool {
	switch value {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return false
	}
}
