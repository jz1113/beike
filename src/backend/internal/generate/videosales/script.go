package videosales

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// ScriptShot matches frontend shot contract
type ScriptShot struct {
	ShotId       int               `json:"shotId"`
	Type         string            `json:"type"`
	Duration     int               `json:"duration"`
	Description  string            `json:"description"`
	Camera       string            `json:"camera"`
	VisualSource string            `json:"visualSource"`
	Transition   string            `json:"transition"`
	Voiceover    string            `json:"voiceover"`
	Prompt       string            `json:"prompt,omitempty"`
	Motion       string            `json:"motion,omitempty"`
	TextOverlay  map[string]string `json:"textOverlay,omitempty"`
}

// ScriptSEO matches frontend seo contract
type ScriptSEO struct {
	Title            string   `json:"title"`
	Hashtags         []string `json:"hashtags"`
	CoverText        string   `json:"coverText"`
	InteractionGuide string   `json:"interactionGuide"`
	Description      string   `json:"description"`
}

// SalesScript represents a full script with shots
type SalesScript struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	StyleType     string       `json:"styleType"`
	TotalDuration int          `json:"totalDuration"`
	Shots         []ScriptShot `json:"shots"`
	SEO           ScriptSEO    `json:"seo"`
}

// Script handles e-commerce short video script generation
func Script(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}

		productName := strings.TrimSpace(generate.StringField(payload, "productName"))
		if productName == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品名称不能为空"})
			return
		}
		category := strings.TrimSpace(generate.StringField(payload, "category"))
		if category == "" {
			category = "beauty"
		}
		videoMode := strings.TrimSpace(generate.StringField(payload, "videoMode"))
		if videoMode == "" {
			videoMode = "product_closeup"
		}
		styleType := strings.TrimSpace(generate.StringField(payload, "styleType"))
		if styleType == "" {
			styleType = "pain_point"
		}
		productDesc := strings.TrimSpace(generate.StringField(payload, "productDescription"))
		analysisText := strings.TrimSpace(generate.StringField(payload, "productAnalysis"))

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)

		if key != "" && base != "" {
			systemPrompt := `你是一位千万级 GMV 的资深电商短视频编导。请为给定的商品生成 3 套结构严谨、不同切入点（痛点种草、场景安利、对比测评）的爆款带货短视频脚本。
严格遵循黄金3秒留存原则，首镜头必须抓住注意；商品展示镜头优先采用商品原图运镜；Prompt 用精炼英文描述。
必须严格输出纯 JSON 对象：
{
  "scripts": [
    {
      "id": "script_1",
      "title": "脚本标题",
      "styleType": "pain_point/scene/comparison",
      "totalDuration": 25,
      "shots": [
        {
          "shotId": 1,
          "type": "hook",
          "duration": 3,
          "description": "镜头构图动态描述",
          "camera": "运镜手法",
          "visualSource": "ai_generate 或 product_image",
          "transition": "direct_concat 或 ai_start_end",
          "voiceover": "口播文案（每秒约3-4字）",
          "prompt": "English visual prompt",
          "motion": "zoom_in_slow/pan_left/ken_burns",
          "textOverlay": { "text": "封面核心字", "style": "title" }
        }
      ],
      "seo": {
        "title": "小红书/抖音高爆标题",
        "hashtags": ["#标签1", "#标签2"],
        "coverText": "封面大字",
        "interactionGuide": "评论引导",
        "description": "视频描述"
      }
    }
  ]
}`
			userPrompt := fmt.Sprintf("商品名称：%s\n品类：%s\n视频模式：%s\n卖点描述：%s\n视觉分析：%s\n请直接输出 3 套专业脚本的 JSON。",
				productName, category, videoMode, productDesc, analysisText)

			reqBody := map[string]any{
				"model": model,
				"messages": []map[string]any{
					{"role": "system", "content": systemPrompt},
					{"role": "user", "content": userPrompt},
				},
				"temperature":     0.7,
				"response_format": map[string]string{"type": "json_object"},
			}
			status, respBytes, err := generate.PostModel(r.Context(), http.MethodPost, strings.TrimRight(base, "/")+"/v1/chat/completions", key, reqBody, 60*time.Second)
			if err == nil && status >= 200 && status < 300 {
				var chatResp struct {
					Choices []struct {
						Message struct {
							Content string `json:"content"`
						} `json:"message"`
					} `json:"choices"`
				}
				var raw map[string]any
				if json.Unmarshal(respBytes, &chatResp) == nil && json.Unmarshal(respBytes, &raw) == nil && len(chatResp.Choices) > 0 {
					var parsed struct {
						Scripts []SalesScript `json:"scripts"`
					}
					content := cleanJSONFence(chatResp.Choices[0].Message.Content)
					if json.Unmarshal([]byte(content), &parsed) == nil && len(parsed.Scripts) > 0 {
						body := map[string]any{"success": true, "scripts": parsed.Scripts, "model": model}
						if usage := generate.NormalizeUsage(raw); usage != nil {
							body["usage"] = usage
						}
						httpx.WriteJSON(w, http.StatusOK, body)
						return
					}
				}
			}
		}

		if allowed, _ := payload["allowFallback"].(bool); !allowed {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "脚本模型调用失败，请检查模型与密钥后重试"})
			return
		}
		scripts := generateFallbackScripts(productName, category, videoMode)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"scripts": scripts,
		})
	})
}

func generateFallbackScripts(productName, category, videoMode string) []SalesScript {
	return []SalesScript{
		{
			ID:            "script_pain_point",
			Title:         "直击痛点·强力种草方案",
			StyleType:     "pain_point",
			TotalDuration: 21,
			Shots: []ScriptShot{
				{
					ShotId:       1,
					Type:         "hook",
					Duration:     3,
					Description:  "痛点瞬间特写镜头微晃，直接击中日常痛点场景",
					Camera:       "微距推近",
					VisualSource: "ai_generate",
					Transition:   "direct_concat",
					Voiceover:    fmt.Sprintf("天天遇到这种麻烦事，你是不是也在忍？直到我发现了%s！", productName),
					Prompt:       "Handheld natural POV camera entering scene with messy problem, dramatic lighting, high tension",
				},
				{
					ShotId:       2,
					Type:         "pain_point",
					Duration:     4,
					Description:  "展示使用普通低劣竞品的尴尬与劣质体验对比",
					Camera:       "俯拍特写",
					VisualSource: "ai_generate",
					Transition:   "ffmpeg_fade",
					Voiceover:    "普通的动不动就出问题，费时又费力，白白浪费好多钱！",
					Prompt:       "Close up of cheap generic product breaking and failing during everyday usage, disappointed mood",
				},
				{
					ShotId:       3,
					Type:         "product_reveal",
					Duration:     4,
					Description:  "商品纯白底保真亮相，高光勾勒轮廓与高级质感",
					Camera:       "缓慢推近",
					VisualSource: "product_image",
					Motion:       "zoom_in_slow",
					Transition:   "ai_start_end",
					Voiceover:    fmt.Sprintf("这才是真正的实力派！%s，品质完全不在一个档次！", productName),
					TextOverlay:  map[string]string{"text": "实力升级·品质之选", "style": "title"},
				},
				{
					ShotId:       4,
					Type:         "demo",
					Duration:     6,
					Description:  "真实场景上手使用实测，动作流畅自然，效果立竿见影",
					Camera:       "平移跟拍",
					VisualSource: "ai_generate",
					Transition:   "ai_start_end",
					Voiceover:    "看看这个实测表现，操作顺手效果惊艳，用一次就彻底离不开了！",
					Prompt:       "Hands holding and naturally using the item in bright modern domestic setup, flawless outcome",
				},
				{
					ShotId:       5,
					Type:         "cta",
					Duration:     4,
					Description:  "整套包装展示叠加限时优惠价格标签，引导立即下单",
					Camera:       "固定特写",
					VisualSource: "product_image",
					Motion:       "static",
					Transition:   "direct_concat",
					Voiceover:    "今天店铺限时特惠，手慢无货，赶快点击下方小黄车带回家！",
					TextOverlay:  map[string]string{"text": "限时特惠·马上抢", "style": "price"},
				},
			},
			SEO: ScriptSEO{
				Title:            fmt.Sprintf("别再踩坑了！这才是%s的正确打开方式", productName),
				Hashtags:         []string{"#好物推荐", fmt.Sprintf("#%s", productName), "#测评种草", "#提升幸福感好物"},
				CoverText:        "别再买错了！",
				InteractionGuide: "你平时最头疼的是哪一点？评论区留言告诉我！",
				Description:      fmt.Sprintf("后悔没有早点入手的神仙单品，实测效果惊艳，看完这期直接闭眼入！#%s", productName),
			},
		},
		{
			ID:            "script_scene",
			Title:         "沉浸场景·生活美学安利",
			StyleType:     "scene",
			TotalDuration: 20,
			Shots: []ScriptShot{
				{
					ShotId:       1,
					Type:         "hook",
					Duration:     3,
					Description:  "第一视角沉浸式开箱，享受撕开保护膜的白噪音 ASMR 爽感",
					Camera:       "第一人称俯拍",
					VisualSource: "ai_generate",
					Transition:   "direct_concat",
					Voiceover:    fmt.Sprintf("今天开箱一个期待超久的宝藏好物——%s！", productName),
					Prompt:       "First person POV unboxing beautiful packaging on warm wooden table, morning sunshine, ASMR aesthetic",
				},
				{
					ShotId:       2,
					Type:         "product_reveal",
					Duration:     4,
					Description:  "商品与居家温馨环境自然融合，晨光洒在产品表面",
					Camera:       "轻柔横移",
					VisualSource: "product_image",
					Motion:       "ken_burns",
					Transition:   "ai_start_end",
					Voiceover:    "随手往桌上一放都像艺术品，这颜值真的直接击中我的审美！",
					TextOverlay:  map[string]string{"text": "颜值与实力并存", "style": "title"},
				},
				{
					ShotId:       3,
					Type:         "demo",
					Duration:     8,
					Description:  "从容使用，手部动作流畅，体现生活松弛感与品质感",
					Camera:       "中景暖调",
					VisualSource: "ai_generate",
					Transition:   "ai_start_end",
					Voiceover:    "每天用它都觉得心情变好了，细节处理得特别到位，彻底提升生活幸福感！",
					Prompt:       "Hands gracefully interacting with product in stylish clean apartment, relaxing lifestyle vibe",
				},
				{
					ShotId:       4,
					Type:         "cta",
					Duration:     5,
					Description:  "精致生活场景定格，右下角弹出优惠专属券提示",
					Camera:       "固定全景",
					VisualSource: "product_image",
					Motion:       "static",
					Transition:   "direct_concat",
					Voiceover:    "想要提升日常仪式感的小伙伴，趁着今天好价赶紧囤！",
					TextOverlay:  map[string]string{"text": "领券立减·品质保证", "style": "price"},
				},
			},
			SEO: ScriptSEO{
				Title:            fmt.Sprintf("被问了800次！让生活幸福感拉满的%s", productName),
				Hashtags:         []string{"#我的日常", "#精致生活", fmt.Sprintf("#%s", productName), "#宝藏好物"},
				CoverText:        "太有质感了！",
				InteractionGuide: "先收藏起来，下次需要的时候直接找同款！",
				Description:      fmt.Sprintf("生活里的仪式感细节，每一处都很贴心，强烈推荐给懂品质的宝子们。#%s", productName),
			},
		},
		{
			ID:            "script_comparison",
			Title:         "硬核对比·实测测评方案",
			StyleType:     "comparison",
			TotalDuration: 24,
			Shots: []ScriptShot{
				{
					ShotId:       1,
					Type:         "hook",
					Duration:     3,
					Description:  "桌上摆放多款同类竞品，醒目文字对比牌立在桌上",
					Camera:       "俯拍推入",
					VisualSource: "ai_generate",
					Transition:   "direct_concat",
					Voiceover:    fmt.Sprintf("花了小一千测了整整四款，就为了告诉你%s到底值不值！", productName),
					Prompt:       "Overhead studio desk comparing multiple competing products side by side, scientific testing setup",
				},
				{
					ShotId:       2,
					Type:         "demo",
					Duration:     8,
					Description:  "分屏极限实测，耐用度、效率与做工逐项 PK",
					Camera:       "分屏特写对比",
					VisualSource: "ai_generate",
					Transition:   "ai_start_end",
					Voiceover:    "第一轮比性能，差的一目了然；第二轮比耐久，只有它稳如泰山！",
					Prompt:       "Split screen stress testing between two products, rigorous comparison with measurement tools",
				},
				{
					ShotId:       3,
					Type:         "product_reveal",
					Duration:     5,
					Description:  "获胜商品居中特写，金标奖牌与质检报告光影动效",
					Camera:       "低角度仰拍",
					VisualSource: "product_image",
					Motion:       "zoom_in_slow",
					Transition:   "ai_start_end",
					Voiceover:    fmt.Sprintf("最终综合得分第一的就是这款%s，性价比和用料完胜全场！", productName),
					TextOverlay:  map[string]string{"text": "测评全胜·闭眼入", "style": "highlight"},
				},
				{
					ShotId:       4,
					Type:         "cta",
					Duration:     8,
					Description:  "总结三点核心优势卡片飞入，引导下单",
					Camera:       "固定居中",
					VisualSource: "product_image",
					Motion:       "static",
					Transition:   "direct_concat",
					Voiceover:    "评测结论摆在这里，不用再去四处比价了，认准正品直接冲！",
					TextOverlay:  map[string]string{"text": "综合榜首·限时抢", "style": "price"},
				},
			},
			SEO: ScriptSEO{
				Title:            fmt.Sprintf("真实测评！多款横评后为什么我最终只留下了%s？", productName),
				Hashtags:         []string{"#硬核测评", "#避坑指南", fmt.Sprintf("#%s测评", productName), "#购物攻略"},
				CoverText:        "硬核实测大PK！",
				InteractionGuide: "你还在纠结哪几款？评论区打出来我帮你排雷！",
				Description:      fmt.Sprintf("不吹不黑全维度横评，数据说话，帮你省钱避坑不花冤枉钱！#%s", productName),
			},
		},
	}
}
