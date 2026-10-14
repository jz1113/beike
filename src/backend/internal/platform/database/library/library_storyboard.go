package library

import (
	"regexp"
	"strings"
)

type sceneShotTemplate struct {
	title, action, camera, angle, shotType string
}

func harmonizedSceneShots(sceneID, title, description string) []sceneShotTemplate {
	sceneText := strings.TrimSpace(title + "，" + description)
	anatomy := jewelryAnatomy(sceneText)
	base := sceneText
	if base == "" || base == "真实买家秀生活场景" || base == "真实生活场景" {
		base = "通透干净的高颜值生活美学空间，自然采光"
	}
	if carPattern.MatchString(strings.ToLower(sceneText)) {
		return carSceneShots(base, anatomy)
	}
	return livedSceneShots(base, anatomy)
}

func jewelryAnatomy(text string) string {
	lower := strings.ToLower(text)
	switch {
	case anatomyHairpin.MatchString(lower):
		return "hairpin"
	case anatomyEarring.MatchString(lower):
		return "earring"
	case anatomyNecklace.MatchString(lower):
		return "necklace"
	case anatomyBracelet.MatchString(lower):
		return "bracelet"
	case anatomyRing.MatchString(lower):
		return "ring"
	case anatomyBrooch.MatchString(lower):
		return "brooch"
	case anatomyBag.MatchString(lower):
		return "bag"
	case anatomyShoes.MatchString(lower):
		return "shoes"
	case anatomyEyewear.MatchString(lower):
		return "eyewear"
	case anatomyHat.MatchString(lower):
		return "hat"
	case anatomyScarf.MatchString(lower):
		return "scarf"
	case anatomyApparel.MatchString(lower):
		return "apparel"
	case anatomyPlaced.MatchString(lower):
		return "placed"
	case anatomyHeld.MatchString(lower):
		return "held"
	default:
		return "general_acc"
	}
}

func carSceneShots(base, anatomy string) []sceneShotTemplate {
	action1 := "单手自然轻搭在随身手袋或车内扶手，手腕饰品随性入镜，神态松弛自然"
	action2 := "单手手腕自然轻搭在安全带或包袋拉链上，手机贴近特写拍摄，首饰细节清晰锐利"
	angle2 := "手腕/手指佩戴细节特写（真实手部与皮肤纹理）"
	action3 := "双手整理随身手袋或手账本，手部饰品随性自然入镜"
	action4 := "手轻搭在安全带或随身包袋望向窗外，手腕饰品在柔和自然光下若隐若现"
	switch anatomy {
	case "earring":
		action1 = "副驾侧头看窗外天光，微风吹拂发丝，自然展露耳垂佩戴的小巧 @图片1 耳饰，手腕光洁"
		action2 = "微侧头，发丝挽于耳后，手机贴近对焦耳垂上的 @图片1 所示小巧耳饰，大光圈浅景深（严禁手腕手镯）"
		angle2 = "耳际局部微距特写（对焦耳垂小巧耳饰）"
		action3 = "单手轻抚侧脸发丝，自然展露耳际小巧耳钉与灵动侧颜，手腕无额外饰品"
	case "necklace":
		action1 = "微侧身面朝车窗自然天光，正面45°平视捕捉端庄领口与颈间项链，神态松弛真实"
		action2 = "半身近景清晰对焦颈间项链吊坠，清晰锁定金属光泽与细节，背景自然柔和虚化"
		angle2 = "颈间半身特写（正面平视）"
		action3 = "双手整理大衣或外套领口，自然展露颈间锁骨链，神态轻松舒适"
		action4 = "侧头望向窗外，微风吹拂发丝，光影勾勒出侧颜与胸前项链微光"
	}
	if anatomy == "earring" {
		action4 = "侧头望向窗外，微风吹拂耳际碎发，光影勾勒出侧颜与耳垂小巧耳饰微光（手腕光洁无手镯）"
	}
	return []sceneShotTemplate{
		{"车内随行抓拍", action1, "iPhone 35mm 生活抓拍视角", "副驾平视中近景（45° 侧颜自然抓拍）", "medium_shot"},
		{"车内佩戴细节特写", action2, "iPhone 85mm 细节特写镜头", angle2, "detail_shot"},
		{"车内生活互动随拍", action3, "iPhone 50mm 标准生活镜头", "中景生活互动抓拍", "medium_shot"},
		{"车内侧颜与饰品光影特写", action4, "iPhone 50mm 侧颜光影特写", "侧面45°生活抓拍特写", "close_up"},
	}
}

func livedSceneShots(base, anatomy string) []sceneShotTemplate {
	shot1Title := "正面高颜值半身自拍肖像"
	shot1Angle := "正面半身/胸部以上自拍肖像"
	shot1Action := "在场景中随性走动或漫步回眸，双手自然轻搭身前，展露佩戴首饰与整体时髦私服"
	shot2Title := "45°侧颜微风光影抓拍"
	shot2Angle := "45° 侧颜半身抓拍"
	shot2Action := "在场景中舒适倚靠或看风景，微风吹拂发丝，神态松弛自然"
	shot3Title := "佩戴部位超清微距特写"
	shot3Action := "大光圈浅景深超清对焦佩戴的 @图片1 细节，背景自然柔和虚化"
	shot3Angle := "局部超清微距大特写"
	shot4Action := "侧身望向窗外或身侧光影，微风吹拂发丝，饰品在自然光下呈现细腻质感"
	switch anatomy {
	case "hairpin":
		shot1Title = "45°侧颜发髻微风半身抓拍"
		shot1Angle = "45° 侧颜半身特写"
		shot1Action = "45度侧颜微风半身抓拍：自然侧身看窗外天光，发丝盘起整洁雅致，斜射阳光清晰展现发髻上插戴的 @图片1 所示发簪/步摇与灵动侧颜，手腕光洁无手镯"
		shot2Title = "侧后方45°回眸发髻抓拍"
		shot2Angle = "侧后方 45° 微回眸抓拍"
		shot2Action = "侧后方45度回眸微风抓拍：侧后方微回眸机位，镜头清晰对焦发髻上的 @图片1 簪饰，自然垂坠的流苏步摇在光影下摇曳生姿，下颌线优美"
		shot3Title = "发髻发簪超清微距特写"
		shot3Action = "发髻局部超清微距特写：极近距离大光圈浅景深超清对焦发髻上插戴的 @图片1 发簪雕花工艺、玉石/金属微观质感与流苏微光，商品占据画面视觉中心，清晰锐利，背景自然柔和虚化"
		shot3Angle = "发髻发簪部位超清微距特写"
		shot4Action = "生活氛围感半身随拍：优雅端坐或茶台窗边倚靠，单手自然将耳际碎发轻挽于耳后或轻触发髻，神态温润恬淡，自然展露发间 @图片1 簪饰"
	case "earring":
		shot1Action = "正面半身肖像：平视视角，双手自然轻搭在身前桌沿，自然展露双耳耳垂佩戴的 @图片1 所示小巧耳饰与优雅气质，手腕光洁无手镯"
		shot2Action = "45度侧颜微风半身抓拍：侧头看窗外天光，微风吹拂高颅顶蓬松长发，斜射阳光勾勒侧颜下颌线条与耳垂佩戴的 @图片1 所示小巧耳饰"
		shot3Title = "耳际局部超清微距特写"
		shot3Action = "耳际局部超清特写：微侧头，单手自然将碎发挽于耳后，大光圈浅景深超清对焦双耳耳垂佩戴的 @图片1 所示耳饰（小巧精致贴耳比例，严禁画手腕，严禁手腕出现手镯手链，严禁项链），锐利清晰展现宝石/金属光泽"
		shot3Angle = "耳际侧颜局部超清微距特写"
		shot4Action = "生活氛围感半身随拍：桌前舒适倚靠或露天街角回眸，神态甜美松弛，展露耳垂小巧精致耳钉与灵动侧颜，手腕光洁无任何手镯"
	case "necklace":
		shot1Action = "正面半身肖像：平视视角，单手大拇指与食指捏起颈间正中佩戴的 @图片1 所示项链吊坠向镜头展示，端庄领口清晰展露项链细节，半身构图"
		shot2Action = "45度侧颜微风半身抓拍：微侧头看窗外天光，微风吹拂发丝，斜射阳光洒在颈间，勾勒侧颜与颈间项链微光"
		shot3Title = "颈间项链半身近景特写"
		shot3Action = "颈间项链半身近景：平视聚焦端庄领口与颈间吊坠，大光圈浅景深清晰对焦自然垂坠的 @图片1 所示项链，展现细腻金属/宝石光泽与锐利微观细节（严禁项链画在手腕上，严禁手腕出现手镯，严禁后背悬空，严禁低胸与大面积裸露）"
		shot3Angle = "颈间项链半身近景"
		shot4Action = "生活氛围感半身随拍：生活空间舒适倚靠或车内副驾，手部轻扶包带或自然搭在身侧，神态甜美松弛，展露颈间项链，半身构图"
	case "bracelet":
		shot1Action = "正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身包袋，单侧手腕佩戴的 @图片1 所示手链/手镯自然入镜，眼神灵动含笑直视镜头"
		shot2Action = "侧身微风半身抓拍：侧身倚靠看风景，高颅顶蓬松发丝随风微动，斜射阳光洒落在身侧，单手自然下垂或轻搭桌沿，手腕饰品随性入镜"
		shot3Title = "手腕局部超清微距特写"
		shot3Action = "手腕局部超清微距：手部自然平放于木质台面或搭在扶手（手部有真实物理支撑），大光圈浅景深聚焦单侧手腕佩戴的 @图片1 真实细腻的物理微光与锐利微观细节（严禁戴在耳朵或脖子上，脖子光洁无项链）"
		shot3Angle = "手腕首饰超清微距特写"
		shot4Action = "生活氛围感半身随拍：生活空间桌前慵懒倚靠或车内副驾，双手捧水杯或单手搭椅背，手腕首饰与灵动侧颜自然同框，半身构图"
	case "ring":
		shot1Action = "正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身物品上，手指佩戴的 @图片1 所示戒指自然入镜，眼神明媚甜笑"
		shot2Action = "45度侧颜半身抓拍：自然侧身看窗外天光，微风吹拂发丝，斜射阳光洒落在面容与身侧，神态恬淡放松"
		shot3Title = "手指戒指超清微距特写"
		shot3Action = "手指局部微距特写：单手自然轻搭在台面或手袋边缘（手部有真实物理支撑），大光圈浅景深超清聚焦手指佩戴的 @图片1 戒指细节与金属质感，边缘锐利分明（严禁画在手腕或耳垂上）"
		shot3Angle = "手指戒指部位超清微距特写"
		shot4Action = "生活氛围感半身随拍：生活空间舒适倚靠或户外街头，单手轻扶包带或搭在身侧，手指戒指与甜美面容自然同框，半身构图"
	case "bag":
		shot1Action = "正面半身抓拍：单肩背着或手提 @图片1 所示包袋，神态自然从容，展现包袋版型与私服搭配"
		shot2Action = "45度侧身漫步抓拍：侧身漫步走动，手轻扶 @图片1 所示包袋肩带，展现包袋皮质与整体氛围"
		shot3Title = "包袋材质与五金超清特写"
		shot3Action = "包袋局部超清特写：近距离大光圈浅景深聚焦 @图片1 包袋的细腻皮质纹理、精致走线与五金搭扣光泽"
		shot3Angle = "包袋五金与皮质微距特写"
		shot4Action = "生活氛围随拍：手提包袋置于身侧桌边或椅背，人与包袋自然互动，展现生活温度"
	}
	_ = base
	return []sceneShotTemplate{
		{shot1Title, shot1Action, "iPhone 35mm 人文广角镜头", shot1Angle, "medium_shot"},
		{shot2Title, shot2Action, "iPhone 50mm 生活镜头", shot2Angle, "medium_shot"},
		{shot3Title, shot3Action, "iPhone 85mm 细节特写镜头", shot3Angle, "detail_shot"},
		{"生活氛围感半身随拍", shot4Action, "iPhone 50mm 侧颜光影镜头", "生活氛围半身交互随拍", "close_up"},
	}
}

var (
	carPattern      = regexp.MustCompile(`车|副驾|驾驶|方向盘|车窗|扶手箱|后座|车内`)
	anatomyHairpin  = regexp.MustCompile(`发簪|簪子|步摇|发饰|发夹|抓夹|发卡|发圈|发带|发绳|发冠|头饰|头花|抹额|hairpin|hair\s*stick|hair\s*clip|hair\s*accessory`)
	anatomyEarring  = regexp.MustCompile(`耳环|耳钉|耳圈|耳坠|耳饰|earring|earrings|ear\s*stud`)
	anatomyNecklace = regexp.MustCompile(`项链|锁骨链|吊坠|项圈|颈链|颈圈|necklace|pendant|choker`)
	anatomyBracelet = regexp.MustCompile(`手镯|手链|手串|镯子|手绳|手排|手环|腕表|手表|bracelet|bangle|wrist\s*watch`)
	anatomyRing     = regexp.MustCompile(`戒指|指环|对戒|钻戒|ring`)
	anatomyBrooch   = regexp.MustCompile(`胸针|领针|brooch`)
	anatomyBag      = regexp.MustCompile(`包|女包|斜挎包|单肩包|手提包|手拿包|托特包|双肩包|小方包|水桶包|皮包|bag|handbag|crossbody`)
	anatomyShoes    = regexp.MustCompile(`鞋|高跟鞋|单鞋|凉鞋|运动鞋|短靴|长靴|马丁靴|靴子|平底鞋|乐福鞋|shoes|boots|heels`)
	anatomyEyewear  = regexp.MustCompile(`眼镜|墨镜|太阳镜|防蓝光眼镜|镜框|glasses|sunglasses|eyewear`)
	anatomyHat      = regexp.MustCompile(`帽子|草帽|渔夫帽|贝雷帽|鸭舌帽|棒球帽|针织帽|宽檐帽|hat|cap|beret`)
	anatomyScarf    = regexp.MustCompile(`围巾|丝巾|披肩|领巾|方巾|scarf|shawl`)
	anatomyApparel  = regexp.MustCompile(`服饰|服装|上衣|衬衫|衬衣|外套|大衣|风衣|卫衣|毛衣|针织|裙|裤|牛仔|t\s*恤|apparel|dress`)
	anatomyPlaced   = regexp.MustCompile(`静物|摆件|陈设|placed`)
	anatomyHeld     = regexp.MustCompile(`手机|水杯|保温杯|数码|held`)
)
