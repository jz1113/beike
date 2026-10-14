package database

import (
	"encoding/json"
	"regexp"
	"strings"
)

func appearanceAudience(fields map[string]any, outfit bool) string {
	if audience, ok := explicitAudience(fields["dimensions"]); ok {
		if audienceAllowed(outfit, audience) {
			return audience
		}
		return "unknown"
	}
	text := appearanceText(fields)
	age := appearanceAge(text)
	gender := appearanceGender(text, outfit)
	candidate := age + "_" + gender
	if age != "" && audienceAllowed(outfit, candidate) {
		return candidate
	}
	return "unknown"
}

func explicitAudience(value any) (string, bool) {
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return "", false
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return "", false
	}
	audience, ok := parsed["audience"].(string)
	return audience, ok
}

func appearanceText(fields map[string]any) string {
	parts := []string{}
	for _, key := range []string{"name", "title", "description", "reversePrompt", "top", "bottom", "tags", "dimensions"} {
		if text := libraryText(fields[key]); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "；")
}

func appearanceGender(value string, outfit bool) string {
	text := strings.ToLower(negativeAppearancePattern.ReplaceAllString(value, ""))
	male := maleAppearancePattern.MatchString(text)
	female := femaleAppearancePattern.MatchString(text)
	dress := outfit && dressAppearancePattern.MatchString(text)
	if outfit && unisexAppearancePattern.MatchString(text) && !dress && !male && !female {
		return "unisex"
	}
	if outfit && (female || dress) {
		return "female"
	}
	if male && (female || dress) {
		return "unknown"
	}
	if male {
		return "male"
	}
	if female || dress {
		return "female"
	}
	return "unknown"
}

func appearanceAge(text string) string {
	groups := map[string]struct{}{}
	for _, match := range ageNumberPattern.FindAllStringSubmatch(text, -1) {
		var age int
		for _, digit := range match[1] {
			age = age*10 + int(digit-'0')
		}
		switch {
		case age < 18:
			groups["child"] = struct{}{}
		case age >= 60:
			groups["senior"] = struct{}{}
		default:
			groups["adult"] = struct{}{}
		}
	}
	if childAppearancePattern.MatchString(text) {
		groups["child"] = struct{}{}
	}
	if seniorAppearancePattern.MatchString(text) {
		groups["senior"] = struct{}{}
	}
	if adultAppearancePattern.MatchString(text) {
		groups["adult"] = struct{}{}
	}
	if len(groups) == 0 && labeledAdultPattern.MatchString(text) {
		groups["adult"] = struct{}{}
	}
	if len(groups) != 1 {
		return ""
	}
	for age := range groups {
		return age
	}
	return ""
}

func audienceAllowed(outfit bool, name string) bool {
	switch name {
	case "adult_male", "adult_female", "senior_male", "senior_female", "child_male", "child_female", "unknown":
		return true
	case "adult_unisex", "senior_unisex", "child_unisex":
		return outfit
	default:
		return false
	}
}

var (
	negativeAppearancePattern = regexp.MustCompile(`(?:禁止|不要|不得|不能|不穿|非)(?:[^，。；;\n]{0,24})`)
	maleAppearancePattern     = regexp.MustCompile(`男性|男士|男生|男人|男孩|男童|老男|爷爷|男模|男装|男款|\b(?:male|man|men|boy|menswear)\b`)
	femaleAppearancePattern   = regexp.MustCompile(`女性|女士|女生|女人|女孩|女童|老女|奶奶|女模|女装|女款|\b(?:female|woman|women|girl|womenswear)\b`)
	dressAppearancePattern    = regexp.MustCompile(`连衣裙|半身裙|百褶裙|短裙|长裙|旗袍|吊带裙|\b(?:dress|skirt|gown)\b`)
	unisexAppearancePattern   = regexp.MustCompile(`男女通用|男女皆可|中性款|无性别|\bunisex\b`)
	ageNumberPattern          = regexp.MustCompile(`(?i)(\d{1,3})\s*(?:岁|years?\s*old|year-old)`)
	childAppearancePattern    = regexp.MustCompile(`(?i)儿童|童装|男童|女童|男孩|女孩|小孩|幼儿|少年|少女|\b(?:child|children|kid|kids|boy|girl|toddler)\b`)
	seniorAppearancePattern   = regexp.MustCompile(`(?i)老年|老人|老男|老女|爷爷|奶奶|银发族|\b(?:senior|elderly)\b`)
	adultAppearancePattern    = regexp.MustCompile(`(?i)成年|成人|青年|中年|\badult\b`)
	labeledAdultPattern       = regexp.MustCompile(`(?i)男士|女士|男装|女装|\b(?:menswear|womenswear)\b`)
)
