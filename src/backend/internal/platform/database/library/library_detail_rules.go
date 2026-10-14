package library

import "regexp"

var (
	placeholderIdentityPattern = regexp.MustCompile(`^(?:不适用|无法确认|信息不足|未知|未识别|无人物|无人物穿搭|无人(?:像|物|出镜)?(?:穿搭)?|无模特|纯商品|纯静物|无穿搭|无服装)(?:[（(：:，,。\s].*)?$`)
	unknownDetailPattern       = regexp.MustCompile(`无法确认|无法辨认|无法判断|信息不足|不可见|未入(?:画|镜)|未见|看不清|不适用|无人物|无服装|未知`)
	unknownWordPattern         = regexp.MustCompile(`(?i)^(?:无|没有|不明|不详|none|null|unknown)$`)
	garmentPattern             = regexp.MustCompile(`衬衫|T恤|恤衫|上衣|卫衣|毛衣|针织衫|外套|开衫|夹克|西装|大衣|风衣|背心|吊带|连衣裙|半身裙|长裙|短裙|长裤|短裤|牛仔裤|套装|旗袍|礼服`)
	outfitFragmentPattern      = regexp.MustCompile(`局部|仅见|只见|只露|仅露|袖口|衣角|领口|衣袖`)
	outfitWholePattern         = regexp.MustCompile(`套装|连衣裙`)
	personaFacePattern         = regexp.MustCompile(`无人物|无人像|仅.*(?:手部|手指|手臂)|不露脸`)
)
