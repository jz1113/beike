package sales

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

type salesPrompt struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	DefaultPrompt string `json:"defaultPrompt"`
	Version       string `json:"version"`
	Customized    bool   `json:"customized"`
	Configured    bool   `json:"configured"`
}

type promptDefinition struct {
	id, title, description, text, prefix, revision string
}

func promptDefinitions() []promptDefinition {
	return []promptDefinition{
		{"summary", "商品卖点提炼", "仅根据当前 OCR 修订文字生成买点与推荐文案；保留 JSON 输出字段及文字来源要求。", summaryInstruction, "product-selling-points", "ocr-text-v2"},
		{"script-analysis", "参考视频拆解", "概括视频总体风格，并按画面和动作变化逐段记录原片。", scriptAnalysisPrompt, "reference-script", "script-v5"},
		{"plan-adapt", "商品分镜改编", "绑定当前商品、人物与场景，按镜头可见内容选择已核实买点编写台词；动作沿用深度视频和动作提示词。", planAdaptPrompt, "plan-adapt", "adapt-v3"},
		{"spoken-copy", "口播时长适配", "按画面选少数重点，写连贯自然的口播或旁白；短段可承接或留白，字幕提炼关键词，仅更新台词与字幕。", spokenCopyPrompt, "spoken-copy", "spoken-v1"},
		{"spoken-review", "口播语义验收", "独立检查整片口播的完整句意、连贯性、事实依据、参数和画面对应；未通过时保留原稿并反馈具体问题。", spokenReviewPrompt, "spoken-review", "review-v1"},
		{"persona-grid", "人物补图 · 三视图", "生成白底正面、侧面、背面全身照与脸部特写，按一行四列排成一张完整横图。", personaGridPrompt, "persona-grid", "strip-v1"},
		{"scene-grid", "场景补图 · 九宫格", "一次生成同一空间的九个固定视角，后台裁成独立 JPG。", sceneGridPrompt, "scene-grid", "grid-v1"},
		{"final-video", "最终视频生成 · 纯分镜版", "按分镜文字与当前图片生成视频；动作、镜头和表情均由文字记录决定，保存后用于执行。", finalVideoTemplate, "final-video", "template-v1"},
		{"final-video-depth", "最终视频生成 · 深度视频版", "深度视频仅参考前景动作，镜头和表情按文字，人物、商品与场景按当前图片；保存后用于执行。", finalVideoDepthTemplate, "final-video-depth", "template-v1"},
		{"persona-design", "人物绘图提示词", "从参考图提取可辨的人物特征，结合平视自然光写成手机实拍提示词。", personaDesignPrompt, "persona-design", "reverse-v2"},
		{"scene-design", "场景绘图提示词", "根据图片的视觉风格设计新空间，输出可独立使用的绘图提示词。", sceneDesignPrompt, "scene-design", "design-v1"},
	}
}

func findPromptDefinition(id string) (promptDefinition, bool) {
	for _, item := range promptDefinitions() {
		if item.id == id {
			return item, true
		}
	}
	return promptDefinition{}, false
}

func (d promptDefinition) resolve(override *string) salesPrompt {
	text := d.text
	if override != nil {
		text = *override
	}
	versionText := d.text + "|" + d.revision
	if text != d.text {
		versionText += "|" + text
	}
	digest := sha256.Sum256([]byte(versionText))
	return salesPrompt{ID: d.id, Title: d.title, Description: d.description, Prompt: text, DefaultPrompt: d.text,
		Version: d.prefix + ":" + hex.EncodeToString(digest[:6]), Customized: override != nil && text != d.text && text != "", Configured: strings.TrimSpace(text) != ""}
}
