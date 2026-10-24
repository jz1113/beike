package library

import (
	"regexp"
	"strings"
)

var (
	deconstructNoFacePattern  = regexp.MustCompile(`(?:画面|图中|人物)?(?:没有|未出现|未见|无|不入镜|未入镜)[^。；\n]{0,18}(?:头部|发型|面部|五官|人脸|脸部)|(?:头部|发型|面部|五官|人脸|脸部)[^。；\n]{0,16}(?:没有|未出现|未见|不入镜|未入镜|不可见)|画面无人|面部和身体主体不入镜|没有面部与完整身体|只露出手部|仅露出手部`)
	deconstructNegHandPattern = regexp.MustCompile(`(?:无|没有|未见|不含|不出现|非)[^，,。；;\n]{0,12}(?:手部|手指|双手|人手|手持|握持|人物|人体)`)
	deconstructHandPattern    = regexp.MustCompile(`手部|手指|双手|单手|一只手|两只手|右手|左手|手掌|手托|手握|握持|手持|托住|托起|托持|捏住|夹持|前臂|手腕`)
)

func deconstructSection(prompt, heading string) string {
	pattern := regexp.MustCompile(`【` + regexp.QuoteMeta(heading) + `】\s*([\s\S]*?)(?:\n?【[^】]+】|$)`)
	match := pattern.FindStringSubmatch(prompt)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func RefineShotType(kind, prompt string) string {
	if kind != "model_shot" || !strings.Contains(prompt, "【发型与面部】") {
		return kind
	}
	face := deconstructSection(prompt, "发型与面部")
	subj := deconstructSection(prompt, "主体") + " " + deconstructSection(prompt, "动作或摆放")
	if !deconstructNoFacePattern.MatchString(face + " " + subj) {
		return kind
	}
	cleaned := deconstructNegHandPattern.ReplaceAllString(subj+" "+face, "")
	if deconstructHandPattern.MatchString(cleaned) {
		return "hand_held_only"
	}
	return "pure_product"
}
