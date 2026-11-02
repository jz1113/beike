package sales

import (
	"crypto/sha256"
	"encoding/hex"
)

type salesPrompt struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	DefaultPrompt string `json:"defaultPrompt"`
	Version       string `json:"version"`
	Customized    bool   `json:"customized"`
}

type promptDefinition struct {
	id, title, description, text, prefix, revision string
}

func promptDefinitions() []promptDefinition {
	return []promptDefinition{
		{"summary", "商品卖点提炼", "结合商品图和已收录文字，生成买点与推荐文案；保留 JSON 输出字段及来源要求。", summaryInstruction(), "product-selling-points", "review-v1"},
		{"script-analysis", "参考视频拆解", "上传视频自动拆解及复制到外部对话使用的完整提示词；保留脚本 JSON 输出结构。", scriptAnalysisPrompt, "reference-script", "script-v3"},
		{"script-normalize", "外部分镜规整", "将粘贴的自由文本拆解整理成脚本 JSON；与视频拆解提示词独立保存。", scriptAnalysisPrompt + scriptNormalizeInstruction, "script-normalize", "normalize-v1"},
		{"plan-adapt", "商品分镜改编", "结合当前商品、人物与场景改编动作段和台词；保留 beats 输出结构。", planAdaptPrompt, "plan-adapt", "adapt-v2"},
		{"persona-grid", "人物补图 · 九宫格", "一次生成同一人物的九个固定视角，后台裁成独立 JPG。", personaGridPrompt, "persona-grid", "grid-v1"},
		{"scene-grid", "场景补图 · 九宫格", "一次生成同一空间的九个固定视角，后台裁成独立 JPG。", sceneGridPrompt, "scene-grid", "grid-v1"},
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
	digest := sha256.Sum256([]byte(text + "|" + d.revision))
	return salesPrompt{ID: d.id, Title: d.title, Description: d.description, Prompt: text, DefaultPrompt: d.text,
		Version: d.prefix + ":" + hex.EncodeToString(digest[:6]), Customized: override != nil}
}
