package videosales

import (
	"fmt"
	"strings"

	"beike.local/cloud/src/backend/internal/generate"
)

func genericScriptPrompt() string {
	return `你是一位电商短视频编导。根据商品信息和商品图片，只写 1 套带货脚本。
成片会把选中的商品原图交给图生视频模型，由视频模型同时生成画面和声音。口播写进提示词，让模型说出来。画面里不要出现字幕、贴纸、大字标题或价格条。
画面提示词用中文，描述运镜和要说出的台词，并要求保持参考图里的商品外观、包装和颜色。
口播和画面只使用商品资料与分析里的已知信息，不要编造功效、评价、销量、实测结果或促销。
visualSource 只能是 product_image 或 ai_generate。画面主体是人或真实环境时写 ai_generate。画面就是商品本身、包装、细节或手持特写时写 product_image。
必须严格输出纯 JSON 对象：
{
  "scripts": [
    {
      "id": "script_1",
      "title": "脚本标题",
      "totalDuration": 15,
      "shots": [
        {
          "shotId": 1,
          "type": "hook",
          "duration": 3,
          "description": "镜头里发生什么",
          "camera": "运镜",
          "visualSource": "product_image",
          "transition": "direct_concat",
          "voiceover": "口播台词，由视频模型念出，大约每秒 3 到 4 个字",
          "prompt": "图生视频提示词，包含要说出的台词和声音，保持商品外观，不要字幕"
        }
      ],
      "seo": {
        "title": "发布标题",
        "hashtags": ["#标签"],
        "coverText": "封面文案",
        "interactionGuide": "评论引导",
        "description": "发布描述"
      }
    }
  ]
}`
}

func scriptChatBody(model string, payload map[string]any, productName, category, videoMode, productDesc, analysisText string) map[string]any {
	duration := generate.IntField(payload, "targetDuration")
	if duration <= 0 {
		duration = 15
	}
	price := strings.TrimSpace(generate.StringField(payload, "priceRange"))
	brand := strings.TrimSpace(generate.StringField(payload, "brand"))
	catalog := parseCatalog(payload)
	vision := LimitVisionImages(catalog, 8)
	systemPrompt := genericScriptPrompt()
	extra := ""
	if category == "fashion" {
		systemPrompt = fashionScriptPrompt()
		extra = "\n" + fashionReferenceNote(payload)
	}
	text := fmt.Sprintf("商品名称：%s\n品牌：%s\n价格：%s\n品类：%s\n视频模式：%s\n目标时长：%d 秒\n卖点：%s\n补充分析：%s%s\n请直接输出 1 套脚本 JSON。分镜时长加总接近目标时长。",
		productName, brand, price, category, videoMode, duration, productDesc, analysisText, extra)
	var userContent any = text
	if len(vision) > 0 {
		userContent = visionParts(text+"\n下面这些图片只帮助你理解商品，先不要选图。", vision)
	}
	return map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userContent},
		},
		"temperature":     0.7,
		"max_tokens":      longOutputTokens,
		"response_format": map[string]string{"type": "json_object"},
	}
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

func realisticLook() string {
	return "人物和场景都是实拍照片：真实皮肤、真实空间、自然光、真实比例。不要插画、动漫、塑料皮肤或棚拍假人。"
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
