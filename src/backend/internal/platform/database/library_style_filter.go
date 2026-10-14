package database

import "strings"

type styleMatch struct {
	field string
	text  string
	exact bool
}

func styleCategoryMatches(assetType, category string) []styleMatch {
	lookup := category
	if assetType == "action" {
		lookup = strings.TrimSpace(category)
	}
	if assetType == "scene_bundle" {
		assetType = "scene"
	}
	if matches, ok := styleCategoryTable(assetType)[lookup]; ok {
		return matches
	}
	return defaultStyleMatches(assetType, lookup)
}

func styleCategoryTable(assetType string) map[string][]styleMatch {
	switch assetType {
	case "scene":
		return sceneStyleMatches
	case "outfit":
		return outfitStyleMatches
	case "action":
		return actionStyleMatches
	case "persona":
		return personaStyleMatches
	default:
		return nil
	}
}

func defaultStyleMatches(assetType, category string) []styleMatch {
	switch assetType {
	case "scene":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title", "description", "reversePrompt"}, category)...)
	case "outfit":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title", "top", "bottom", "reversePrompt"}, category)...)
	case "action":
		return []styleMatch{exactStyle("shotType", category), exactStyle("category", category), {field: "tags", text: category}}
	case "persona":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "name", "description", "reversePrompt"}, category)...)
	case "full_prompt":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"albumName", "tags", "title", "reversePromptZh"}, category)...)
	default:
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title"}, category)...)
	}
}

func exactStyle(field, text string) styleMatch {
	return styleMatch{field: field, text: text, exact: true}
}

func containsStyle(fields []string, text string) []styleMatch {
	matches := make([]styleMatch, 0, len(fields))
	for _, field := range fields {
		matches = append(matches, styleMatch{field: field, text: text})
	}
	return matches
}

func textMatches(field string, words ...string) []styleMatch {
	matches := make([]styleMatch, 0, len(words))
	for _, word := range words {
		matches = append(matches, styleMatch{field: field, text: word})
	}
	return matches
}

func styleColumn(field string) bool {
	switch field {
	case "category", "title", "description", "tags", "reversePrompt", "top", "bottom", "name", "suitableAnatomy", "action", "shotType", "albumName", "reversePromptZh", "reversePromptEn", "sceneSummary", "outfitSummary", "actionSummary":
		return true
	default:
		return false
	}
}

var sceneStyleMatches = map[string][]styleMatch{
	"chinese_style":   append([]styleMatch{exactStyle("category", "chinese_style")}, textMatches("title", "中式", "园林", "茶", "町屋")...),
	"luxury_modern":   append([]styleMatch{exactStyle("category", "luxury_modern")}, textMatches("title", "现代", "都会", "大理石", "高层")...),
	"casual_street":   append([]styleMatch{exactStyle("category", "casual_street")}, textMatches("title", "街", "酒馆", "咖啡", "长椅")...),
	"vacation_nature": append([]styleMatch{exactStyle("category", "vacation_nature")}, textMatches("title", "海", "沙滩", "度假", "自然", "田")...),
	"home_living":     append([]styleMatch{exactStyle("category", "home_living")}, textMatches("title", "起居", "沙发", "生活", "房")...),
	"minimal_office":  append([]styleMatch{exactStyle("category", "minimal_office")}, textMatches("title", "办公", "工位", "原木")...),
}

var outfitStyleMatches = map[string][]styleMatch{
	"chinese_style":   append([]styleMatch{exactStyle("category", "chinese_style")}, textMatches("title", "新中式", "马面裙", "真丝", "盘扣")...),
	"french_chic":     append([]styleMatch{exactStyle("category", "french_chic")}, textMatches("title", "法式", "针织", "牛仔", "衬衫")...),
	"luxury_modern":   append([]styleMatch{exactStyle("category", "luxury_modern")}, textMatches("title", "西装", "羊绒", "都会", "阔腿裤")...),
	"casual_street":   append([]styleMatch{exactStyle("category", "casual_street")}, textMatches("title", "街头", "工装", "衬衫", "休闲")...),
	"vacation_nature": append([]styleMatch{exactStyle("category", "vacation_nature")}, textMatches("title", "度假", "长裙", "蕾丝", "亚麻")...),
	"black_classic":   textMatches("title", "小黑裙", "赫本", "黑白"),
}

var actionStyleMatches = map[string][]styleMatch{
	"jewelry": append(append(append(textMatches("tags", "首饰", "珠宝", "耳环", "项链", "手镯", "戒指", "发簪"),
		textMatches("suitableAnatomy", "hairpin", "earring", "necklace", "bracelet", "ring")...),
		textMatches("title", "首饰", "耳", "发簪", "手镯", "项链", "戒指")...),
		textMatches("action", "耳", "发簪", "项链", "手镯", "戒指")...),
	"apparel": append(append(append(append(textMatches("tags", "服饰", "穿搭", "衣服", "裙", "外套", "衬衫"),
		textMatches("suitableAnatomy", "apparel", "clothing")...),
		textMatches("title", "服饰", "穿搭", "衣", "裙", "半身", "全身")...),
		textMatches("action", "衣", "裙", "摆", "领", "袖")...),
		[]styleMatch{exactStyle("shotType", "half_body"), exactStyle("shotType", "full_body"), exactStyle("shotType", "lifestyle_interaction")}...),
	"bag": append(append(textMatches("tags", "包", "箱包", "手袋"), styleMatch{field: "suitableAnatomy", text: "bag"}),
		append(textMatches("title", "包", "手袋"), textMatches("action", "包", "拎", "挎", "背", "握")...)...),
	"shoes": append(append(append(textMatches("tags", "鞋", "靴"), styleMatch{field: "suitableAnatomy", text: "shoes"}),
		textMatches("title", "鞋", "靴", "足")...),
		append(textMatches("action", "鞋", "靴", "足", "步", "踏"),
			[]styleMatch{exactStyle("shotType", "low_angle_three_quarter_body"), exactStyle("shotType", "full_body")}...)...),
	"beauty": append(append(append(textMatches("tags", "美妆", "妆容", "口红", "护肤"), styleMatch{field: "suitableAnatomy", text: "beauty"}),
		textMatches("title", "妆", "脸", "唇", "眼")...),
		append(textMatches("action", "妆", "唇", "脸", "腮"),
			[]styleMatch{exactStyle("shotType", "extreme_macro_detail"), exactStyle("shotType", "profile_45")}...)...),
	"eyewear": append(append(textMatches("tags", "眼镜", "墨镜", "太阳镜"), styleMatch{field: "suitableAnatomy", text: "eyewear"}),
		append(textMatches("title", "镜"), append(textMatches("action", "镜"), exactStyle("shotType", "profile_45"))...)...),
	"macro_detail":       append([]styleMatch{exactStyle("shotType", "extreme_macro_detail"), exactStyle("shotType", "macro_detail")}, textMatches("title", "微距", "特写")...),
	"universal":          append([]styleMatch{exactStyle("shotType", "close_up"), exactStyle("shotType", "profile_45")}, textMatches("title", "侧颜", "回眸", "近景", "特写")...),
	"medium_interactive": append([]styleMatch{exactStyle("shotType", "profile_half_body"), exactStyle("shotType", "medium_full_body")}, textMatches("title", "半身", "托腮", "互动", "笑", "比心")...),
	"full_body":          append([]styleMatch{exactStyle("shotType", "low_angle_three_quarter_body")}, textMatches("title", "全身", "漫步", "站姿", "立姿", "跃", "跑")...),
	"seated_candid":      append([]styleMatch{exactStyle("shotType", "high_angle_seated_full_body")}, textMatches("title", "坐", "倚", "靠", "躺")...),
}

var personaStyleMatches = map[string][]styleMatch{
	"style_gentle":  append(textMatches("name", "清纯", "甜"), textMatches("description", "小鹿眼", "甜美")...),
	"style_classic": append(textMatches("name", "古典", "名媛"), textMatches("description", "盘发", "端庄")...),
	"style_chic":    append(textMatches("name", "都会", "时髦", "职场"), textMatches("description", "骨相", "立体")...),
	"hair_wavy":     append(textMatches("name", "卷"), textMatches("description", "卷发", "波浪")...),
	"hair_updo":     append(textMatches("name", "盘发"), textMatches("description", "低盘发", "发髻")...),
	"hair_straight": append(textMatches("name", "黑长直"), textMatches("description", "黑长直", "直发")...),
	"color_gold":    append(textMatches("name", "金", "橘"), textMatches("description", "金", "橙", "棕")...),
}
