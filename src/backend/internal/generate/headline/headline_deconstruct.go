package headline

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// HeadlineDeconstruct 处理优质封面样张的多模态深度反推拆解（支持单图与多图群组反推）
func HeadlineDeconstruct(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		imagesRaw := generate.StringListField(payload, "imageUrls")
		if len(imagesRaw) == 0 {
			singleUrl, _ := payload["imageUrl"].(string)
			if strings.TrimSpace(singleUrl) != "" {
				imagesRaw = []string{strings.TrimSpace(singleUrl)}
			}
		}
		if len(imagesRaw) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "未提供待反推的封面图片"})
			return
		}

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-3.7-flash"
		}
		if message := generate.HeadlineAccessError(cfg, r, payload, "未配置视觉多模态分析模型的 API Key"); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}

		base, key := headlineCredentials(cfg, r, payload, model)
		images, message := headlineImages(r, imagesRaw)
		if message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "样张图片读取失败，请检查链接或网络"})
			return
		}

		prompt := coverMultiDeconstructPrompt(len(images))
		content := []any{map[string]any{"type": "text", "text": prompt}}
		for _, img := range images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": img}})
		}

		text, usageData, status, err := generate.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.2, 120*time.Second)
		if err != nil || status >= 300 || strings.TrimSpace(text) == "" {
			code := headlineFailure(err, status)
			httpx.WriteJSON(w, code, map[string]any{"success": false, "error": headlineErrorText(err, status, "反推分析模型响应异常")})
			return
		}

		parsed := generate.DecodeObject(text)
		if parsed == nil {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "反推模型未返回合法 JSON 特征"})
			return
		}

		parsed["sampleCount"] = len(images)
		response := map[string]any{
			"success": true,
			"data":    parsed,
			"model":   model,
		}
		if usage := generate.NormalizeUsage(usageData); usage != nil {
			response["usage"] = usage
		}
		httpx.WriteJSON(w, http.StatusOK, response)
	})
}

func coverMultiDeconstructPrompt(imageCount int) string {
	if imageCount > 1 {
		return `你是一位顶尖的视觉总监和反向提示词工程专家。请对比分析所提供的 ` + generate.Itoa(imageCount) + ` 张同系列爆款封面，提炼它们共同的核心视觉语法与可变插槽，严格只输出合法的 JSON 格式，禁止输出任何前置或后置说明文本。

JSON 必须包含且仅包含以下结构：
{
  "layout": {
    "gridType": "同系列共有构图体系(例如: 居中压顶咬合 / 左右分屏 / 杂志侧压 / 对角切分)",
    "subjectAreaRatio": "主体在各图中占高度的平均区间(例如: 62%-72%)",
    "subjectAnchor": "主体的稳定锚定区间(例如: 水平居中偏下)",
    "whiteSpaceRatio": "留白呼吸感平均占比(例如: 15%-25%)",
    "depthLayering": "共同的图文遮挡层级关系(例如: 文字压商品上沿咬合)"
  },
  "typography": {
    "titleFontFamily": "共同采用的字体字重风格(例如: 超粗无衬线Black / 现代力量黑体)",
    "titleArrangement": "标题字组排布共性与变体(例如: 默认双行错位，可变单行拉通)",
    "letterSpacing": "字距控制特点(例如: 紧凑吃满(-2%))",
    "artTreatment": "艺术字修饰手法合集(例如: 黑底黄字块 / 极细白色描边 / 纸片衬底)"
  },
  "colorPalette": {
    "backgroundTone": "背景基调描述与色系区间(例如: 哑光碳黑/冷灰)",
    "dominantColor": "画面第一主色 Hex 或名(例如: #18181B 炭黑)",
    "accentColor": "点睛强调色提取规律(例如: #F59E0B 科技黄或亮橙)",
    "contrastLevel": "对比度策略(例如: 极高反差 / 局部荧光)",
    "colorSourceRule": "颜色提取规则(例如: 强调色取自商品本身，背景克制深沉)"
  },
  "textureAndLight": {
    "backgroundTexture": "背景材质共性(例如: 细微纸质纤维噪点 / 磨砂深空质感)",
    "lightDirection": "主光方向(例如: 左上方45度柔光 / 顶部自然顶光)",
    "shadowStyle": "投影质感(例如: 真实微弱接触阴影)"
  },
  "decorations": {
    "elements": ["这批封面的典型装饰元素列表，如: 同源短下划线", "圆点标签", "参数角标"],
    "subTextLayout": "辅助文字出现规律(例如: 极细英文标签紧贴主标)"
  },
  "copywritingStyle": {
    "grammar": "文案句式共同特征(例如: 数字量化强结论 / 痛点反差提问)",
    "wordCountRange": "标题字数特征(例如: 7-12字)"
  },
  "summary": "一句话归纳这套风格 Skill 的核心设计灵魂与最适配的商品品类(不超过60字)"
}`
	}

	return coverDeconstructPrompt()
}

func coverDeconstructPrompt() string {
	return `你是一位顶尖的视觉总监和反向提示词工程专家。请深度反向拆解所提供的优质封面图像的设计语法，严格只输出合法的 JSON 格式，禁止输出任何前置或后置说明文本。

JSON 必须包含且仅包含以下结构：
{
  "layout": {
    "gridType": "构图类型(例如: 居中压顶咬合 / 左右分屏 / 杂志侧压 / 对角切分 / 满幅出血)",
    "subjectAreaRatio": "主体占画面高度百分比(例如: 65%)",
    "subjectAnchor": "主体位置锚定(例如: 水平居中偏下 / 偏右黄金分割)",
    "whiteSpaceRatio": "画面留白呼吸感占比(例如: 20%)",
    "depthLayering": "图文前后遮挡层次(例如: 前大字后商品 / 文字压商品上沿咬合 / 纯平贴合)"
  },
  "typography": {
    "titleFontFamily": "字体字重风格(例如: 超粗无衬线Black / 现代力量黑体 / 精致无衬线 / 复古宋体 / 潮酷手写)",
    "titleArrangement": "标题行数与字组排布(例如: 双行错位 / 单行拉通 / 阶阶递进)",
    "letterSpacing": "字距控制(例如: 紧凑吃满(-2%) / 适度宽松(+3%))",
    "artTreatment": "艺术字修饰手法(例如: 黑底黄字块 / 极细白色描边 / 纸片衬底 / 荧光笔划 / 局部高亮 / 扁平纯色)"
  },
  "colorPalette": {
    "backgroundTone": "背景基调描述与色系(例如: 米白纸感灰 / 哑光极夜黑 / 纯白演播室)",
    "dominantColor": "画面第一主色 Hex 或名(例如: #18181B 炭黑)",
    "accentColor": "点睛强调色 Hex 或名(例如: #F59E0B 科技黄)",
    "contrastLevel": "明度对比(例如: 极高反差 / 中高反差温润调 / 柔和微对比)",
    "colorSourceRule": "颜色提取规则(例如: 强调色取自商品本身 / 品牌固定对比色)"
  },
  "textureAndLight": {
    "backgroundTexture": "背景材质(例如: 细微纸质纤维噪点 / 磨砂深空质感 / 柔光影棚台面 / 纯净平涂)",
    "lightDirection": "主光方向(例如: 左上方45度柔光 / 顶部自然顶光 / 正面漫反射)",
    "shadowStyle": "投影质感(例如: 真实微弱接触阴影 / 悬浮弥散柔光 / 无投影纯扁平)"
  },
  "decorations": {
    "elements": ["装饰元素列表，如: 同源短下划线", "圆点标签", "参数角标", "无额外元素"],
    "subTextLayout": "辅助文字排布(例如: 无副标题 / 顶部极细英文标签 / 紧贴主标的参数行)"
  },
  "copywritingStyle": {
    "grammar": "文案句式特征(例如: 数字量化强结论 / 痛点反差提问 / 品牌型号加定位词)",
    "wordCountRange": "标题字数特征(例如: 7-12字)"
  },
  "summary": "一句话提炼这种封面的核心设计神韵与适用领域(不超过60字)"
}`
}
