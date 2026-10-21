package videosales

import (
	"fmt"
	"strings"
	"unicode"
)

func fashionNarrativeRules() string {
	return `叙事只选一种，写入 beat：
- unbox 开箱换装：上衣、裤、裙、外套。掏出这一件并举高展示；匹配剪辑换上，剪辑点身体位置相同；再转身或连续姿势，面料跟着动。不要编造第二套、第三套。
- lifestyle 生活穿搭：真实住处，手持或前置开口。已经穿着这一件，或当场换上这一件。可以有镜子、衣架和窗光。其他衣服只是背景。
- accessory 鞋包展示：鞋或包。拿出、上手或上脚、多角度展示。不要写换装，也不要写面料飘动。`
}

func fashionStillRules() string {
	return fashionCastingRules() + "\n" + fashionStillFramingRules() + `
服饰静帧是一张生活实拍照片，不写秒数、运镜和口播。每张写明：东亚成年角色及选定的具体年龄、保留自然纹理的真实肤质、脚本里的具体房间、窗光从哪边来、单一机位。含商品的画面写清是举着展示还是已经穿上，外观与商品原图一致。不要棚拍无影假人、磨皮塑料皮肤、插画或拼图。衣架上的其他衣服只是生活背景。
出镜说话需要至少一张同一人物的头顶至腰部或大腿的正面或轻微侧面中景，脸和完整嘴唇清楚可见，手、手机、衣领和商品不遮嘴；表情自然放松，不把夸张张嘴定格当口型。仍是一张静态照片，不写台词或声画同步。真实房间有适量生活痕迹，衣物有自然垂坠和褶皱，皮肤保留纹理与轻微不对称，不强加脏乱、瑕疵或故意抖动。`
}

func fashionCastingRules() string {
	return `人物选角：所有生成的出镜人物必须设定为东亚成年人，人物图、人脸、上身或手持关键帧及视频保持同一角色。每张有人物的素材 label 和 prompt 都明确写东亚、性别及约 X 岁，不能只写亚洲人、成年男性或模特；无需人物的商品或场景图不额外加人，避免无关路人。商品原图中的模特只提供商品展示依据，不覆盖选角。
先尊重已明确的成年目标人群或选角年龄，再综合版型、设计风格、搭配方式和穿着场合选择年龄，不仅凭品牌、颜色或单个品类词判断。参考：年轻潮流、校园感、街头运动18–25岁；简约休闲、日常通勤25–35岁；成熟商务、利落正装30–45岁；明确面向成熟人群的款式40–60岁；资料明确面向银发人群时55–70岁。范围允许交叉，是选角建议，不是服装年龄限制或商品事实，不写进口播。
在合适区间内固定一个具体年龄，不把多个区间交给绘图模型选择；宽泛基础款、信息不足且无明确目标人群时，采用约30岁的东亚成年人作中性选角。鞋包结合结构、风格和使用场景选角。明确童装时用东亚成年讲解者手持或商品静物，不把儿童尺码改成成人上身。
固定东亚角色、约X岁、外貌特征、发型、体态及穿搭气质，每张相关静帧独立写全并用referenceAssetIds继承同一身份。年龄自然体现在肤质、发型、妆容、体态和表达上，不夸张衰老、刻意扮嫩或磨皮；身形真实适配版型，不一律超瘦或健美。人脸、上身图及视频不得换脸、年龄漂移或换人；手部特写继承同一人物，不强加露脸。`
}

func fashionFinalPromptRules() string {
	return `服饰成片的 fullPrompt 按实际图片书写，不套样例里的房间、角度、品牌或口号。依次写这些部分：
开篇：精确时长和画幅，像真实发生的，手持跟拍或匹配剪辑，生活 vlog。
场景：具体空间、陈设、光从哪进来。
参考：按实际提交顺序写图片1、图片2，写明人物、单品或场景要100%匹配哪一张。
按秒镜头：沿用每段 speechMode，写清谁在说话、嘴部是否可见、景别、动作、引号内的口播原文、情绪、镜头怎么接。匹配剪辑写明剪辑点身体位置相同。
口播时间轴：每段原文加情绪和声音来源，on_camera 是画内人物现场说话，voiceover 才是画外音。fullPrompt 与各段 prompts 都完整保留该段台词原文，不增删改写。语速略慢，一句说完停半拍，嘴型与原文对齐。
灯光与色彩：方向和冷暖以参考图为准，用来交代面料明暗，不编造器材型号。
输出与锁定：真实速度，无字幕、无贴纸、无价格条。所有生成的出镜人物必须是东亚成年角色，沿用素材计划中选定的具体年龄、脸、发型和体态，不在定稿时重新选角；手部特写不强加露脸，无人物脚本不额外加人。不把不符设定的旧素材描述成已符合，需先更新并确认素材。锁定人物、当前这一件单品、光向、匹配剪辑时的身体位置和嘴型。不编造第二套或第三套商品，也不要写没有依据的尺码、链接或置顶。`
}

func fashionPaceNote() string {
	return "语速略慢，句间停半拍，嘴型与原文对齐。出镜讲解由画面中同一人物亲口说出，中文发音、唇形开合、下颌和起止逐字同步；不能闭嘴展示却播放旁白。转身、换装或遮嘴动作放在句间停顿。声音保留自然呼吸、轻重音和房间感，不用播音腔；背景声不盖过人声。"
}

func fashionVoiceoverBudget(seconds int) (int, int) {
	if seconds < 1 {
		seconds = 1
	}
	// 约每秒 3.2–4.6 个字。15 秒为 48–69，10 秒为 32–46。
	return (seconds*16 + 2) / 5, (seconds*23 + 2) / 5
}

func fashionShotVoiceoverCap(seconds int) int {
	if seconds < 1 {
		seconds = 1
	}
	return seconds * 6
}

func fashionVoiceoverRules() string {
	return `口播是对镜头说的第一人称，像跟朋友说话，不是导购稿，也不是画面说明。允许哎、啊、吧和句间半拍停顿。语速略慢，不要连珠炮。不强制家人们等网红称呼，不统一热情推销腔；按人物和场合自然开口，少用工整排比，句子长短有变化。每句只配一个顺手的展示动作，先看镜头说清楚，再低头摸衣料或转身；不边高速旋转边说话。
汉字数按目标时长计算，标点、数字、字母和省略号不计：15秒全片写48到69个字，其他时长按每秒约3.2到4.6个字折算。每一段至少一句能说完的话，不必写满同一密度，5秒不必写满。换装、转身可以少说，把停顿留给动作。单段不超过约每秒6个字。写完自数汉字，少了就补一句口语里的场合或搭配，多了就删重复，不要用语气词凑字。
卖点从商品分析的 sellingPoints 或看得见的资料里取，嵌进这句话：适合什么场合、怎么和已有衣服搭配、少做哪一步。sellingPoints 是可说出口的事实，不要照着论证箭头念。只报领型、罗纹、绣花名称不算卖点。口播和这一段画面是同一处，但不要写成「近看怎样、走远怎样」。
开场用一个场合或一件具体的事开口。收尾用另一条事实说清怎么穿、什么时候穿，也可以征求意见。就看这一件、可以直接入手、简单好搭、值得入、基础百搭、闭眼入不算收尾。
全片至少说出两条不同的、资料里有的事实。同一事实不在两段里重复。品名和基础款最多出现一次，并且带上使用场合。精致、好看、高级、百搭不能单独充当卖点。
事实只写看得见或资料里有的颜色、面料、领型、门襟、罗纹、绣花或图案位置、套头、鞋包结构、季节和品类。推不出场合或搭配就不要说。口播不要出现价格、金额或优惠。没有尺码、链接、置顶、功效、评价、销量或优惠，就不要说。只锁定当前这一件，不编造第二套或第三套。
禁止写成这样：开场只问「秋天想要一件基础款长袖？」；中段只说「圆领罗纹收边，胸前小图案很精致。」；收尾只说「秋季日常穿，基础百搭，可以收着。」也不要写「近看清楚，走远了不抢衣服」。
只学口气和停顿，禁止原样输出下面的句子：「家人们，我今天出门就套这件黑色圆领。」`
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
		if count < 6 {
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
	for _, phrase := range []string{"就看这一件", "可以直接入手", "简单好搭", "值得入", "基础百搭", "闭眼入"} {
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
	return "unbox"
}

func fashionAccessoryName(name string) bool {
	if strings.Contains(name, "衣") || strings.Contains(name, "裤") || strings.Contains(name, "裙") || strings.Contains(name, "外套") {
		return false
	}
	return strings.Contains(name, "鞋") || strings.Contains(name, "包")
}
