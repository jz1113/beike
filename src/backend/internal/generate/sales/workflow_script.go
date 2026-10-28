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
		// Empty calls to action are deterministic and easy for the model to repair.
		// Retry once with the exact failing segment while preserving the product
		// facts, timing, shot structure, and asset dependencies.
		if !isRecoverableSpeechValidationError(err) {
			workflowError(w, 502, err)
			return
		}
		repairBody := salesJSONRecoveryBody(body, fmt.Sprintf("上一版脚本未通过口播校验：%s。请根据原始商品事实重新输出完整 scripts JSON；只重写触发校验的空号召，使其落到具体可见的穿法、结构或搭配选择，保留可核实事实、镜头结构、素材依赖和总时长，不要输出说明。", err))
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
	return strings.Contains(message, "口播") && strings.Contains(message, "空号召")
}

func workflowScriptBody(model string, payload map[string]any, catalog []CatalogImage, target int, ratio string) map[string]any {
	system := salesSkillInstructions("script") + `
当前执行 workflowVersion:3 的脚本与素材计划阶段。只返回一套 script，deliveryMode:"single"，分镜是整条视频的语义时间段。
商品分析中的 buyingPoints 是优先使用的购买理由；口播要把它落到对应商品事实、消费者收益和可见展示上。sellingPoints 仅作为原始事实线索，不能把没有证据的泛化评价写成购买承诺。
口播先在脑中写成一段可以连续朗读的自然种草分享，再按完整语义、换气和动作容量切成 shots。相邻段必须承接上一段，不能每段重新开场、重复报属性或把“请输出”“不要说明”等写作指令混进 voiceover。禁止属性清单式口播；优先用观察、解释和结果推进，保留少量自然语气词，但每句都要能直接对消费者说出口。
每个 shot 都必须写清“起始状态→可观察动作或剪辑→结果状态”。相邻段至少发生一项可见变化：人物位置、手与商品的接触、商品状态、相机距离/方向、场景或明确切镜。不能三段都保持同一姿势、同一画面范围和同一商品状态，只更换台词；如果连续动作无法表现变化，必须写明切镜及切点。
接口约束：assets 必须为1至4项数组，每项字段为 id、kind(person|face|scene|keyframe)、label、prompt、required、referenceAssetIds、usesProduct、productImageIndexes。依赖只能引用前序素材ID，不得循环、重复或使用 product- 保留前缀；face 必须依赖同一 person。usesProduct:true 时 productImageIndexes 必须从实际可见的商品原始目录编号选择，按本张目标视角选图，未知细节不编造；无商品素材填空数组。上身图 usesProduct:true。每张静帧只写本张要求，不输出整段时间轴。
shots 每项 duration 为正整数，合计精确等于 targetDuration，totalDuration 也须精确等于它。声音来源 speechMode 每段明确，不得只改字段而在画面描述保留相反的说话方式。若填写 beat，只能取 unbox、lifestyle 或 accessory；不确定时留空，由脚本内容和商品事实决定拍法。visualSource 只能为 product_image 或 ai_generate，transition 为 direct_concat。
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
	voiceovers := []string{
		"我今天想找一件，穿上就能把这个搭配问题解决掉的单品。",
		"你看，我把它调整到身上以后，刚才在意的地方就有变化了，细节也能看得更清楚。",
		"所以最后看整体效果，按这个穿法出门，选择理由就落在这里。",
	}
	if !presenter {
		voiceovers = []string{
			"我今天想找一件，能把这个搭配问题讲明白的单品。",
			"画面里先看它的关键结构，再看它和使用场景怎么接上。",
			"这样从细节到整体，最后的选择依据就比较清楚了。",
		}
	}
	types := []string{"hook"}
	durations := []int{target}
	if target >= 10 {
		opening := target * 3 / 10
		durations = []int{opening, target - opening*2, opening}
		types = []string{"hook", "detail", "closing"}
	}
	for i, duration := range durations {
		voiceover := voiceovers[i]
		description := []string{
			"从人物正在整理或拿起商品的状态开始，先让商品和选择问题同时进入画面；动作结果是主要商品部位第一次清楚可见。",
			"承接上一段的手位和商品状态，完成一次有目的的整理、展开、试穿观察或移动；动作结果是前段提出的关键部位或搭配关系发生可见变化。",
			"在前段结果上继续观察整体搭配或使用状态，必要时明确切到更能看清整体的机位；动作结果是给出与开头问题对应的选择依据并自然收住。",
		}[i]
		camera := []string{
			"手机固定或轻微跟随，保持正常距离，足以同时看清人物表情和主要商品部位；从动作进行中开口，不先站定摆拍。",
			"沿用上一段空间和光向，保持正常展示距离，跟随手部或身体完成一次展示，必要时在动作完成点明确跳切到新的相机距离；不能只做嘴部微动。",
			"根据整体展示目的调整相机距离或方向，保持正常展示距离和人物与商品比例自然；若切镜，写清切点和切后状态，不把连续段伪装成静帧。",
		}[i]
		prompt := []string{
			"连续实拍画面：起始时人物正在整理或拿起商品，随后把商品关键部位带入可见区域，结尾保持结果状态；声音与动作同步，无字幕。",
			"连续实拍画面：继承上一段的空间和手位，完成一次明确的展示动作并看到结果；若需要切镜，切在动作完成点，切后继续同一人物和商品状态；无字幕。",
			"连续实拍画面：从上一段结果继续，展示整体搭配或使用结果，必要时用一个明确切镜完成范围变化；结尾停在可验证的选择依据上；无字幕。",
		}[i]
		script.Shots = append(script.Shots, ScriptShot{
			ShotId: i + 1, Type: types[i], Duration: duration,
			Description: description, Camera: camera, VisualSource: "ai_generate",
			Transition: "direct_concat", SpeechMode: "voiceover", Voiceover: voiceover, Prompt: prompt,
		})
		if presenter {
			script.Shots[i].SpeechMode = "on_camera"
			script.Shots[i].Description = description + " 人物嘴部清楚可见，亲口说出台词，动作不遮嘴。"
			script.Shots[i].Camera = camera + " 出镜段保持嘴部清楚可见。"
			script.Shots[i].Prompt = prompt + " 人物亲口说出台词，口型与原文同步。"
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
		example["assets"].([]map[string]any)[0]["label"] = "出镜讲解者（填写东亚角色、具体年龄与完整外貌）"
	}
	raw, _ := json.Marshal(map[string]any{"scripts": []map[string]any{example}})
	return "\n只输出以下结构的一个 JSON 对象；示例仅说明字段格式、自然口播和状态变化写法，不得照抄商品事实、镜头数量或台词。scripts 必须是长度为1的数组，shots、assets、referenceAssetIds、productImageIndexes、hashtags 必须是数组，空依赖写 []，示例 productImageIndexes 仅说明编号格式，须按本张目标视角从实际可见商品目录选取，不能照抄。shotId、duration、totalDuration 必须是整数，required、usesProduct 必须是布尔值；description、camera、voiceover、prompt 必须是字符串，不要改写成对象。无需 textOverlay，尚未选图，禁止 imageIndex。voiceover 只能放可直接说出口的台词，不能放提示语、字段说明或“直接输出”等元话术。每段必须写清起始状态、动作/切镜和结果状态。\n" + string(raw)
}
