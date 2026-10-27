package sales

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
		workflowError(w, 502, fmt.Errorf("口播脚本生成失败：%w", err))
		return
	}
	if err != nil || status < 200 || status >= 300 {
		workflowError(w, 502, fmt.Errorf("脚本模型调用失败：%s", analysisFailureReason(status, err)))
		return
	}
	script, normalized, err := oneSalesScript(content)
	if err != nil {
		workflowError(w, 502, err)
		return
	}
	if err := validateWorkflowScript(script, normalized, catalog, target, generate.StringField(payload, "videoMode")); err != nil {
		// Local speech limits are deterministic and easy for the model to repair.
		// Retry once with the exact failing segment instead of asking the user to
		// repeat product analysis or manually trim generated copy.
		if !isRecoverableSpeechValidationError(err) {
			workflowError(w, 502, err)
			return
		}
		repairBody := salesJSONRecoveryBody(body, fmt.Sprintf("上一版脚本未通过口播校验：%s。请根据原始商品事实重新输出完整 scripts JSON；只压缩或重写超限口播，保留可核实事实、镜头结构、素材依赖和总时长，不要输出说明。", err))
		repairedContent, repairedRaw, repairedStatus, repairErr := postChatJSON(r.Context(), base, key, repairBody, chatWait)
		if errors.Is(repairErr, errTruncatedOutput) {
			workflowError(w, 502, fmt.Errorf("口播脚本生成失败：%w", repairErr))
			return
		}
		if repairErr != nil || repairedStatus < 200 || repairedStatus >= 300 {
			workflowError(w, 502, fmt.Errorf("脚本模型调用失败：%s", analysisFailureReason(repairedStatus, repairErr)))
			return
		}
		repairedScript, repairedNormalized, parseErr := oneSalesScript(repairedContent)
		if parseErr != nil {
			workflowError(w, 502, parseErr)
			return
		}
		if validationErr := validateWorkflowScript(repairedScript, repairedNormalized, catalog, target, generate.StringField(payload, "videoMode")); validationErr != nil {
			workflowError(w, 502, validationErr)
			return
		}
		script, normalized, raw = repairedScript, repairedNormalized, repairedRaw
	}

	if !scriptReady(script) {
		workflowError(w, 502, fmt.Errorf("脚本缺少可用分镜或提示词"))
		return
	}
	// Presentation normalization never repairs timing or missing shot IDs.
	script = normalizeScriptPresentation(script)
	script.Beat = normalizeFashionBeat(script.Beat, name)

	response := map[string]any{"success": true, "scripts": []map[string]any{workflowScriptResponse(script)}, "model": model}
	if usage := generate.NormalizeUsage(raw); usage != nil {
		response["usage"] = usage
	}
	httpx.WriteJSON(w, 200, withSalesSkill(response))
}

func validateWorkflowScript(script SalesScript, normalized string, catalog []CatalogImage, target int, videoMode string) error {
	if len(script.Shots) > 40 {
		return fmt.Errorf("分镜数量不能超过40")
	}
	if err := validateScriptReferences(normalized, catalog); err != nil {
		return err
	}
	if err := exactDuration(script.Shots, target); err != nil {
		return err
	}
	if script.TotalDuration != target {
		return fmt.Errorf("脚本 totalDuration 与目标时长不符")
	}
	if script.DeliveryMode != "single" {
		return fmt.Errorf("脚本 deliveryMode 必须为 single")
	}
	if err := validateAssetPlan(script.Assets); err != nil {
		return err
	}
	if err := validateSpeechModes(script.Shots, true); err != nil {
		return err
	}
	if err := validateFashionPresentation(script.Shots, videoMode); err != nil {
		return err
	}
	if err := validateSpeakingAssetPlan(script.Shots, script.Assets); err != nil {
		return err
	}
	for _, asset := range script.Assets {
		text := asset.Label + asset.Prompt
		if !asset.UsesProduct && (strings.Contains(text, "上身") || strings.Contains(text, "试穿") || strings.Contains(text, "穿上") || strings.Contains(text, "穿着该")) {
			return fmt.Errorf("衣服上身素材 %s 必须 usesProduct:true", asset.ID)
		}
	}
	return validateFashionVoiceover(script.Shots, target)
}

func isRecoverableSpeechValidationError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "口播") && (strings.Contains(message, "不要超过") || strings.Contains(message, "应写") || strings.Contains(message, "至少写一句"))
}

func workflowScriptBody(model string, payload map[string]any, catalog []CatalogImage, target int, ratio string) map[string]any {
	system := salesSkillInstructions("script") + `
当前执行 workflowVersion:3 的脚本与素材计划阶段。只返回一套 script，deliveryMode:"single"，分镜是整条视频的语义时间段。
接口约束：assets 必须为1至4项数组，每项字段为 id、kind(person|face|scene|keyframe)、label、prompt、required、referenceAssetIds、usesProduct、productImageIndexes。依赖只能引用前序素材ID，不得循环、重复或使用 product- 保留前缀；face 必须依赖同一 person。usesProduct:true 时 productImageIndexes 必须从实际可见的商品原始目录编号选择，按本张目标视角选图，未知细节不编造；无商品素材填空数组。上身图 usesProduct:true。每张静帧只写本张要求，不输出整段时间轴。
shots 每项 duration 为正整数，合计精确等于 targetDuration，totalDuration 也须精确等于它。声音来源 speechMode 每段明确，不得只改字段而在画面描述保留相反的说话方式。beat 取 unbox、lifestyle 或 accessory。visualSource 只能为 product_image 或 ai_generate，transition 为 direct_concat。
不要选择商品分镜图，不输出 imageIndex；不要求用户预先上传人物或选择视频模型。只交付脚本、素材计划和发布文案，不输出最终 fullPrompt。`
	category := generate.StringField(payload, "category")
	system += fashionVoiceoverBudgetPrompt(target)
	system += fashionPresentationRule(generate.StringField(payload, "videoMode"))
	system += workflowScriptOutputExample(target, category, LimitVisionImages(catalog, 8), generate.StringField(payload, "videoMode"))
	facts := map[string]any{"productName": payload["productName"], "category": category, "productDescription": payload["productDescription"], "productAnalysis": payload["productAnalysis"], "brand": payload["brand"], "selectedColor": payload["selectedColor"], "targetAudience": payload["targetAudience"], "videoMode": payload["videoMode"], "targetDuration": target, "aspectRatio": ratio}
	encoded, _ := json.Marshal(facts)
	return withLongOutput(chatBody(model, system, visionParts("请求商品事实及参数："+string(encoded)+"\n以下是允许查看的商品图片，只理解商品，尚未选图，不要输出 imageIndex。", LimitVisionImages(catalog, 8)), 0.5))
}

// The example describes the current continuous-video and asset-plan contract.
func workflowScriptOutputExample(target int, category string, catalog []CatalogImage, mode string) string {
	presenter := mode == "" || mode == "live_presenter"
	script := SalesScript{
		ID: "script_1", Title: "商品展示", DeliveryMode: "single", TotalDuration: target,
		SEO: ScriptSEO{Title: "发布标题", Hashtags: []string{"#商品展示"}, CoverText: "封面文案", InteractionGuide: "评论引导", Description: "发布描述"},
	}
	script.Beat = "lifestyle"

	lead := salesSkillDirective("scriptExample", "lead")
	tail := salesSkillDirective("scriptExample", "tail")
	if !presenter {
		lead = salesSkillDirective("scriptExample", "leadVoiceover")
		tail = salesSkillDirective("scriptExample", "tailVoiceover")
	}
	voiceovers := []string{lead + tail}
	types := []string{"hook"}
	durations := []int{target}
	if target >= 10 {
		opening := target * 3 / 10
		durations = []int{opening, target - opening*2, opening}
		types = []string{"hook", "detail", "closing"}
		voiceovers = []string{lead, tail, salesSkillDirective("scriptExample", "closing")}
	}
	for i, duration := range durations {
		low, high := fashionPreferredVoiceoverBudget(duration)
		voiceover := fmt.Sprintf("本段约 %d–%d 个汉字，直接输出可念的台词，不输出这些编写说明：%s", max(low, installedSalesSkill.SpeechLimits.MinShotHan), max(high, installedSalesSkill.SpeechLimits.MinShotHan), voiceovers[i])
		script.Shots = append(script.Shots, ScriptShot{
			ShotId: i + 1, Type: types[i], Duration: duration,
			Description: salesSkillDirective("scriptExample", "description"), Camera: salesSkillDirective("scriptExample", "camera"), VisualSource: "ai_generate",
			Transition: "direct_concat", SpeechMode: "voiceover", Voiceover: voiceover, Prompt: salesSkillDirective("scriptExample", "prompt"),
		})
		if presenter {
			script.Shots[i].SpeechMode = "on_camera"
			script.Shots[i].Description = salesSkillDirective("scriptExample", "presenterDescription")
			script.Shots[i].Camera = salesSkillDirective("scriptExample", "presenterCamera")
			script.Shots[i].Prompt = salesSkillDirective("scriptExample", "presenterPrompt")
		}
	}
	example := workflowScriptResponse(script)
	indexes := []int{}
	if len(catalog) > 0 {
		indexes = append(indexes, catalog[0].Index)
	}
	var assetPrompt string
	assetPrompt = salesSkillDirective("scriptExample", "assetPrompt")

	if presenter {
		assetPrompt = salesSkillDirective("scriptExample", "presenterAssetPrompt")
	}
	example["assets"] = []map[string]any{{
		"id": "scene_1", "kind": "scene", "label": "商品展示场景", "prompt": assetPrompt,
		"required": true, "referenceAssetIds": []string{}, "usesProduct": len(indexes) > 0, "productImageIndexes": indexes,
	}}
	if presenter {
		example["assets"].([]map[string]any)[0]["id"] = "presenter_1"
		example["assets"].([]map[string]any)[0]["kind"] = "person"
		example["assets"].([]map[string]any)[0]["label"] = "出镜讲解者（填写东亚成年角色及具体年龄）"
	}
	raw, _ := json.Marshal(map[string]any{"scripts": []map[string]any{example}})
	return "\n只输出以下结构的一个 JSON 对象；示例仅说明字段格式，不得照抄商品事实、镜头数量或口播。scripts 必须是长度为1的数组，shots、assets、referenceAssetIds、productImageIndexes、hashtags 必须是数组，空依赖写 []，示例 productImageIndexes 仅说明编号格式，须按本张目标视角从实际可见商品目录选取，不能照抄。shotId、duration、totalDuration 必须是整数，required、usesProduct 必须是布尔值；description、camera、voiceover、prompt 必须是字符串，不要改写成对象。无需 textOverlay，尚未选图，禁止 imageIndex。\n" + string(raw)
}
