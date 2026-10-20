package videosales

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

func workflowError(w http.ResponseWriter, status int, err error) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": err.Error()})
}

func handleWorkflowScript(w http.ResponseWriter, r *http.Request, cfg config.Config, payload map[string]any) {
	catalog, err := workflowCatalog(payload)
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	target, ratio, err := workflowTiming(payload)
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	name := strings.TrimSpace(generate.StringField(payload, "productName"))
	if name == "" {
		workflowError(w, 400, fmt.Errorf("商品名称不能为空"))
		return
	}
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	base, key := resolveCredentials(cfg, r, payload)
	if base == "" || key == "" {
		workflowError(w, 502, fmt.Errorf("脚本模型凭据不可用"))
		return
	}
	body := workflowScriptBody(model, payload, catalog, target, ratio)
	content, raw, status, err := postChatJSON(r.Context(), base, key, body, chatWait)
	if errors.Is(err, errTruncatedOutput) {
		workflowError(w, 502, errTruncatedOutput)
		return
	}
	if err != nil || status < 200 || status >= 300 {
		workflowError(w, 502, fmt.Errorf("脚本模型调用失败：%s", analysisFailureReason(status, err)))
		return
	}
	var parsed struct {
		Scripts []SalesScript `json:"scripts"`
	}
	if json.Unmarshal([]byte(content), &parsed) != nil || len(parsed.Scripts) != 1 {
		workflowError(w, 502, fmt.Errorf("脚本结果必须为一套有效脚本 JSON"))
		return
	}
	if err := validateScriptReferences(content, catalog); err != nil {
		workflowError(w, 502, err)
		return
	}
	script := parsed.Scripts[0]
	if err := exactDuration(script.Shots, target); err != nil {
		workflowError(w, 502, err)
		return
	}
	if script.TotalDuration != target {
		workflowError(w, 502, fmt.Errorf("脚本 totalDuration 与目标时长不符"))
		return
	}
	if script.DeliveryMode != "single" {
		workflowError(w, 502, fmt.Errorf("脚本 deliveryMode 必须为 single"))
		return
	}
	if err := validateAssetPlan(script.Assets); err != nil {
		workflowError(w, 502, err)
		return
	}
	if generate.StringField(payload, "category") == "fashion" {
		for _, asset := range script.Assets {
			text := asset.Label + asset.Prompt
			if !asset.UsesProduct && (strings.Contains(text, "上身") || strings.Contains(text, "试穿") || strings.Contains(text, "穿上") || strings.Contains(text, "穿着该")) {
				workflowError(w, 502, fmt.Errorf("衣服上身素材 %s 必须 usesProduct:true", asset.ID))
				return
			}
		}
	}
	if !scriptReady(script) {
		workflowError(w, 502, fmt.Errorf("脚本缺少可用分镜或提示词"))
		return
	}
	// Timing was validated before legacy normalization; normalization never repairs it.
	script = normalizeScript(script)
	if generate.StringField(payload, "category") == "fashion" {
		script.Beat = normalizeFashionBeat(script.Beat, name)
	}
	response := map[string]any{"success": true, "scripts": []map[string]any{workflowScriptResponse(script)}, "model": model}
	if usage := generate.NormalizeUsage(raw); usage != nil {
		response["usage"] = usage
	}
	httpx.WriteJSON(w, 200, response)
}

func workflowScriptBody(model string, payload map[string]any, catalog []CatalogImage, target int, ratio string) map[string]any {
	system := genericScriptPrompt() + `
这是 workflowVersion:3：所有品类都先脚本→自动素材计划→实际素材视觉校验→实际图定稿→一次生成一条整段视频。分镜是整段时间轴，不是逐镜头提交任务。
每套 script 必须有 deliveryMode:"single" 和 assets 数组；按脚本实际需要规划1至4张静帧，禁止每个分镜机械生成一张，禁止强制人物或人脸。不需要预先提供人物图片、视频模型或视频参数。
assets 元素格式：{"id":"scene_1","kind":"person|face|scene|keyframe","label":"素材名称","prompt":"可直接绘图的中文静帧提示词","required":true,"referenceAssetIds":[],"usesProduct":false}。
referenceAssetIds 只能依赖数组里已出现的素材ID，不能自引用、循环或未知引用。人脸可以依赖人物；同一人物、场景应复用。需要展示商品的静帧 usesProduct:true，尤其衣服上身图必须 usesProduct:true 并保持商品颜色、款式、版型、纹理，不得把商品事实当作创意改变。没有商品的纯人物或场景不要伪造商品依赖。
商品颜色、款式、包装是事实，selectedColor 是目标颜色事实，不可与其他颜色混用。未知卖点不编造。素材绘图提示词只描述一张实际照片，不含运镜、时长、字幕和口播。分镜口播有精确时间轴，视频模型生成声音，全程无字幕。
每个分镜 duration 必须正整数，合计精确等于 targetDuration，totalDuration 也必须等于它，禁止近似、增加片尾或默默修正时长。不输出固定竖屏，不假设视频模型能力。`
	category := generate.StringField(payload, "category")
	if category == "fashion" {
		system += "\n仅服饰品类遵循以下叙事，并在脚本 JSON 中输出 beat，取值为 unbox、lifestyle 或 accessory。\n" + fashionNarrativeRules() + "\n根据具体脚本决定是否需要人物或人脸。锁定同一人物及单品，衣服上身素材必须 usesProduct:true。"
	}
	facts := map[string]any{"productName": payload["productName"], "category": category, "productDescription": payload["productDescription"], "productAnalysis": payload["productAnalysis"], "brand": payload["brand"], "priceRange": payload["priceRange"], "selectedColor": payload["selectedColor"], "targetAudience": payload["targetAudience"], "videoMode": payload["videoMode"], "targetDuration": target, "aspectRatio": ratio}
	encoded, _ := json.Marshal(facts)
	return withLongOutput(chatBody(model, system, visionParts("请求商品事实及参数："+string(encoded)+"\n以下是允许查看的商品图片，只理解商品，尚未选图，不要输出 imageIndex。", LimitVisionImages(catalog, 8)), 0.5))
}
