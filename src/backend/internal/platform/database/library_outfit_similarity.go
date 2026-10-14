package database

import (
	"regexp"
	"strings"
)

type outfitSignature struct {
	fullText string
	colors   map[string]struct{}
	garments map[string]struct{}
	crafts   map[string]struct{}
	ngrams   map[string]struct{}
}

type outfitFields struct {
	title, top, bottom, shoes, colorPalette, tags string
}

var outfitColors = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"blue", regexp.MustCompile(`(?:浅蓝|天蓝|水蓝|雾霾蓝|牛仔蓝|宝蓝|藏青|藏蓝|克莱因蓝|湖蓝|湛蓝|浅天蓝|深蓝|蓝)`)},
	{"white", regexp.MustCompile(`(?:纯白|米白|奶白|冷白|暖白|象牙白|雪白|白)`)},
	{"black", regexp.MustCompile(`(?:纯黑|炭黑|深黑|墨黑|暗黑|黑)`)},
	{"gray", regexp.MustCompile(`(?:浅灰|深灰|炭灰|烟灰|麻灰|燕麦灰|银灰|灰)`)},
	{"brown", regexp.MustCompile(`(?:棕|咖|卡其|驼色|焦糖|奶黄|米黄|米色|暖棕|深棕|杏色|大地色)`)},
	{"red_pink", regexp.MustCompile(`(?:红|粉|玫红|朱红|正红|樱桃红|豆沙|橘红|酒红|绯红)`)},
	{"green", regexp.MustCompile(`(?:绿|薄荷绿|墨绿|橄榄绿|翠绿|牛油果绿|浅绿|草绿)`)},
	{"purple", regexp.MustCompile(`(?:紫|香芋紫|薰衣草紫|浅紫|深紫)`)},
	{"yellow", regexp.MustCompile(`(?:黄|明黄|柠檬黄|姜黄|鹅黄)`)},
}

var outfitGarments = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"hoodie_knit", regexp.MustCompile(`(?:连帽|帽衫|卫衣|针织衫|针织|毛衣|开衫)`)},
	{"shirt_blouse", regexp.MustCompile(`(?:衬衫|衬衣|小方领|法式衬衫|雪纺衫)`)},
	{"suit_coat", regexp.MustCompile(`(?:西装|小西服|大衣|风衣|夹克|外套|工装)`)},
	{"tank_camisole", regexp.MustCompile(`(?:吊带|背心|抹胸|内搭|裹胸)`)},
	{"tshirt", regexp.MustCompile(`(?:t恤|短袖t|打底衫)`)},
	{"dress", regexp.MustCompile(`(?:连衣裙|连体裙|长裙|短裙|吊带裙|半身裙|伞摆|裙身|裙装|百褶裙|马面裙|旗袍)`)},
	{"pants", regexp.MustCompile(`(?:阔腿裤|牛仔裤|直筒裤|休闲裤|长裤|短裤|西装裤|微喇裤|短裙裤)`)},
}

var outfitCrafts = []string{
	"蕾丝", "荷叶边", "飞袖", "飞飞袖", "泡泡袖", "方领", "大方领", "v领", "圆领", "挂脖",
	"露肩", "一字肩", "抽绳", "系带", "盘扣", "纽扣", "真丝", "雪纺", "亚麻", "纯棉", "羊绒",
	"牛仔", "丹宁", "提花", "刺绣", "粗花呢", "小香风", "百褶", "镂空", "褶皱", "开叉",
}

var outfitNgramClean = regexp.MustCompile(`[^\x{4e00}-\x{9fa5}a-z0-9]+`)

func outfitSimilarity(left, right outfitFields) float64 {
	return signatureSimilarity(outfitSignatureOf(left), outfitSignatureOf(right))
}

func outfitSignatureOf(outfit outfitFields) outfitSignature {
	parts := []string{}
	for _, part := range []string{outfit.title, outfit.top, outfit.bottom, outfit.shoes, outfit.colorPalette, outfit.tags} {
		part = strings.TrimSpace(part)
		if part != "" {
			parts = append(parts, part)
		}
	}
	full := strings.ToLower(strings.Join(parts, " "))
	signature := outfitSignature{
		fullText: full,
		colors:   map[string]struct{}{},
		garments: map[string]struct{}{},
		crafts:   map[string]struct{}{},
		ngrams:   map[string]struct{}{},
	}
	for _, color := range outfitColors {
		if color.pattern.MatchString(full) {
			signature.colors[color.name] = struct{}{}
		}
	}
	for _, garment := range outfitGarments {
		if garment.pattern.MatchString(full) {
			signature.garments[garment.name] = struct{}{}
		}
	}
	for _, craft := range outfitCrafts {
		if strings.Contains(full, craft) {
			signature.crafts[craft] = struct{}{}
		}
	}
	clean := []rune(outfitNgramClean.ReplaceAllString(full, ""))
	for index := 0; index < len(clean)-1; index++ {
		signature.ngrams[string(clean[index:index+2])] = struct{}{}
		if index < len(clean)-2 {
			signature.ngrams[string(clean[index:index+3])] = struct{}{}
		}
	}
	return signature
}

func signatureSimilarity(left, right outfitSignature) float64 {
	if left.fullText == "" || right.fullText == "" {
		return 0
	}
	sharedColors := overlapCount(left.colors, right.colors)
	maxColors := max(len(left.colors), len(right.colors))
	colorOverlap := 0.0
	if maxColors > 0 {
		colorOverlap = float64(sharedColors) / float64(maxColors)
	}
	if len(left.colors) > 0 && len(right.colors) > 0 && sharedColors == 0 {
		return 0.15
	}
	sharedGarments := overlapCount(left.garments, right.garments)
	maxGarments := max(len(left.garments), len(right.garments))
	garmentOverlap := 0.0
	if maxGarments > 0 {
		garmentOverlap = float64(sharedGarments) / float64(maxGarments)
	}
	sharedCrafts := overlapCount(left.crafts, right.crafts)
	minCrafts := min(len(left.crafts), len(right.crafts))
	craftOverlap := 0.0
	if minCrafts > 0 {
		craftOverlap = float64(sharedCrafts) / float64(minCrafts)
	}
	sharedNgrams := overlapCount(left.ngrams, right.ngrams)
	minNgrams := min(len(left.ngrams), len(right.ngrams))
	ngramScore := 0.0
	if minNgrams > 0 {
		ngramScore = float64(sharedNgrams) / float64(minNgrams)
	}
	if sharedColors >= 1 && sharedGarments >= 1 && (ngramScore >= 0.2 || sharedCrafts >= 1) {
		return maxFloat(0.75, 0.4+colorOverlap*0.3+ngramScore*0.3)
	}
	if _, leftWhite := left.colors["white"]; leftWhite {
		if _, rightWhite := right.colors["white"]; rightWhite && sharedCrafts >= 1 && ngramScore >= 0.2 {
			return maxFloat(0.72, 0.4+craftOverlap*0.3+ngramScore*0.3)
		}
	}
	return colorOverlap*0.35 + garmentOverlap*0.35 + craftOverlap*0.15 + ngramScore*0.15
}

func overlapCount(left, right map[string]struct{}) int {
	count := 0
	for key := range left {
		if _, ok := right[key]; ok {
			count++
		}
	}
	return count
}

func maxFloat(left, right float64) float64 {
	if left > right {
		return left
	}
	return right
}
