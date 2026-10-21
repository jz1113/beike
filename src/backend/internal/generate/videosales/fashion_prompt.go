package videosales

import (
	"fmt"
	"strings"
	"unicode"
)

func fashionNarrativeRules() string {
	return `叙事只选一种，写入 beat：
- unbox 开箱换装：上衣、裤、裙、外套。前段抽出单品举高展示；中段匹配剪辑，同一身体位置已经穿上并转身，面料自然动；后段全身连续姿势，最后指向镜头。
- lifestyle 生活穿搭：人已经穿着该单品。先坐着看镜头，再站到窗边，然后整理头发或衣服，最后走开并回头。景别在中景和全景之间，带轻微手持。
- accessory 鞋包展示：鞋或包。拿出、上手或上脚、多角度展示。不要写换装，也不要写面料飘动。`
}

func fashionVoiceoverBudget(seconds int) (int, int) {
	if seconds < 1 {
		seconds = 1
	}
	// 15秒对应70到100个字，其他时长按同样比例四舍五入。
	return (seconds*14 + 1) / 3, (seconds*20 + 1) / 3
}

func fashionVoiceoverRules() string {
	return `口播是导购，不是画面说明。观众要听懂为什么买，并知道这一秒眼睛该看哪里。
汉字数按目标时长计算，标点、数字和字母不计：15秒全片写70到100个字，其他时长按每秒约4.7到6.7个字折算。每一段再按本段秒数写满同一密度，5秒写23到33个汉字。低于下限会空，高于上限会压过动作和嘴型。一段至少两句，句间留短停顿，不能用一个短问句占满一整段。写完自数汉字，少了就补穿着后果，多了就删重复，不要用语气词凑字。
每段同时完成两件事。卖点：从商品分析的 sellingPoints 或看得见的资料里取一条，说成购买理由，也就是少做哪一步、适合什么场合、怎么和已有衣服搭配。只报领型、罗纹、绣花名称不算卖点。看点：点名这一段画面正在给观众看的那一处，说出它在身上的位置，以及近看和走远之后分别怎样。口播和画面必须是同一处。
整段按时间顺序写三步，每步都写满本段字数：开场用场合或缺口开口，同一段用第一条卖点回答，不能停在问号上；中段只锁定一个最强看点，把对应卖点说完；收尾用另一条事实说清怎么穿、什么时候穿、单穿还是叠搭。就看这一件、可以直接入手、简单好搭、值得入、基础百搭不算收尾。
全片至少说出两条不同的卖点。同一事实不在两段里重复。品名和基础款最多出现一次，并且带上使用场合。精致、好看、高级、百搭不能单独充当卖点。
事实只写看得见或资料里有的颜色、面料、领型、门襟、罗纹、绣花或图案位置、套头、鞋包结构、季节和品类。购买理由必须从一条事实推到穿着或使用后果，推不出来就不要说。口播不要出现价格、金额或优惠。没有尺码、链接、置顶、功效、评价、销量或优惠，就不要说。
禁止写成这样：开场只问「秋天想要一件基础款长袖？」；中段只说「圆领罗纹收边，胸前小图案很精致。」；收尾只说「秋季日常穿，基础百搭，可以收着。」这三句合计约四十个字，开场停在问号，中段用精致代替购买理由，收尾是空号召，也没有看点位置。
只学句长和论证，禁止原样输出下面的商品事实：开场「降温还在找一件不闷的圆领，这件黑色纯棉套上就能出门。」中段「领口是罗纹，胸前那点绣花就在正中，近看清楚，走远了不抢衣服。」收尾「单穿就够，里面加件衬衫也压得住，上班和周末不用再换一件。」`
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
	overallLow, overallHigh := fashionVoiceoverBudget(target)
	total, sumLow, sumHigh := 0, 0, 0
	var joined strings.Builder
	for _, shot := range shots {
		count := voiceoverHanCount(shot.Voiceover)
		total += count
		shotLow, shotHigh := fashionVoiceoverBudget(shot.Duration)
		sumLow += shotLow
		sumHigh += shotHigh
		if count < shotLow || count > shotHigh {
			return fmt.Errorf("第 %d 段口播有 %d 个汉字，%d 秒应写 %d 到 %d 个，并写出卖点和看点", shot.ShotId, count, shot.Duration, shotLow, shotHigh)
		}
		joined.WriteString(shot.Voiceover)
	}
	low, high := overallLow, overallHigh
	if sumLow < low {
		low = sumLow
	}
	if sumHigh > high {
		high = sumHigh
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
