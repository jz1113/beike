package videosales

import "strings"

func genericScriptRules() string {
	return `你是一位电商短视频编导。根据商品信息和商品图片，只写 1 套带货脚本。
成片会把选中的商品原图交给图生视频模型，由视频模型同时生成画面和声音。口播写进提示词，让模型说出来。口播不要出现价格、金额或优惠。画面里不要出现字幕、贴纸、大字标题或价格条。
画面提示词用中文，描述运镜和要说出的台词，并要求保持参考图里的商品外观、包装和颜色。
口播和画面只使用商品资料与分析里的已知信息，不要编造功效、评价、销量、实测结果或促销，也不要补充价格。
visualSource 只能是 product_image 或 ai_generate。画面主体是人或真实环境时写 ai_generate。画面就是商品本身、包装、细节或手持特写时写 product_image。
`
}

func normalizeScript(script SalesScript) SalesScript {
	total := 0
	for i := range script.Shots {
		if script.Shots[i].Duration <= 0 {
			script.Shots[i].Duration = 3
		}
		if script.Shots[i].ShotId == 0 {
			script.Shots[i].ShotId = i + 1
		}
		script.Shots[i].TextOverlay = nil
		if script.Shots[i].Transition == "" {
			script.Shots[i].Transition = "direct_concat"
		}
		script.Shots[i].VisualSource = keepVisualSource(script.Shots[i].VisualSource)
		total += script.Shots[i].Duration
	}
	script.TotalDuration = total
	if script.ID == "" {
		script.ID = "script_1"
	}
	return script
}

func keepVisualSource(source string) string {
	if strings.TrimSpace(source) == "ai_generate" {
		return "ai_generate"
	}
	return "product_image"
}

func scriptReady(script SalesScript) bool {
	if strings.TrimSpace(script.Title) == "" || len(script.Shots) == 0 {
		return false
	}
	seen := map[int]bool{}
	for _, shot := range script.Shots {
		if shot.ShotId <= 0 || seen[shot.ShotId] {
			return false
		}
		seen[shot.ShotId] = true
		if strings.TrimSpace(shot.Description) == "" || strings.TrimSpace(shot.Voiceover) == "" || strings.TrimSpace(shot.Prompt) == "" {
			return false
		}
	}
	return true
}
