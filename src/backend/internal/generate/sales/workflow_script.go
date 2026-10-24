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
	if err := validateScriptReferences(normalized, catalog); err != nil {
		workflowError(w, 502, err)
		return
	}
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
		script.Shots = normalizeFashionSpeechModes(script.Shots, generate.StringField(payload, "videoMode"))
	}
	if err := validateSpeechModes(script.Shots, generate.StringField(payload, "category") == "fashion"); err != nil {
		workflowError(w, 502, err)
		return
	}
	if err := validateSpeakingAssetPlan(script.Shots, script.Assets); err != nil {
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
		if err := validateFashionPresentation(script.Shots, generate.StringField(payload, "videoMode")); err != nil {
			workflowError(w, 502, err)
			return
		}
		if err := validateFashionVoiceover(script.Shots, target); err != nil {
			workflowError(w, 502, err)
			return
		}
	}
	if len(script.Shots) > 40 {
		workflowError(w, 502, fmt.Errorf("分镜数量不能超过40"))
		return
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
	system := genericScriptRules() + `
这是 workflowVersion:3：所有品类都先脚本→自动素材计划→实际素材视觉校验→实际图定稿→一次生成一条整段视频。分镜是整段时间轴，不是逐镜头提交任务。
每套 script 必须有 deliveryMode:"single" 和 assets 数组；按脚本实际需要规划1至4张静帧，禁止每个分镜机械生成一张，禁止强制人物或人脸。不需要预先提供人物图片、视频模型或视频参数。
assets 元素格式：{"id":"scene_1","kind":"person|face|scene|keyframe","label":"素材名称","prompt":"可直接绘图的中文静帧提示词","required":true,"referenceAssetIds":[],"usesProduct":false}。
referenceAssetIds 只能依赖数组里已出现的素材ID，不能自引用、循环或未知引用。只有必须继承同一人物身份或具体空间时才建立依赖；有商品原图就直接引用商品原图，不要先重画平铺图再让上身图依赖平铺图。互不依赖的静帧应并行生成，不为相同商品建立多余的串行依赖。人脸可以依赖人物；同一人物、场景应复用。需要展示商品的静帧 usesProduct:true，尤其衣服上身图必须 usesProduct:true 并保持商品颜色、款式、版型、纹理，不得把商品事实当作创意改变。没有商品的纯人物或场景不要伪造商品依赖。
需要展示商品的静帧 usesProduct:true，并填写 productImageIndexes 数组，使用下方实际可见且允许的商品目录原始编号，按这张静帧的目标视角选图；不得复用不相干分镜的选图。未使用商品的素材 productImageIndexes:[]。正面、背面和细节分别选择对应证据；若只有背面证据，就不要规划声称看得清正面胸前细节的素材。每张 prompt 明确唯一目标视角，并说明对应原图中可见的领口、图案或标志位置，未知细节不编造；相反视角只用于补充结构，不能当主视角。生成图不能作为商品事实覆盖原图，不把前序背面画面照搬为正面。每张仅生成单一静帧，不输出正反拼图或多视图。
商品颜色、款式、包装是事实，selectedColor 是目标颜色事实，不可与其他颜色混用。未知卖点不编造。口播的使用效果只能复述已有资料或knownFacts的明确证据，不能由罗纹、材质比例、厚度、图片外观推断穿着或实测结果；没有明确资料禁止写不闷、不往上滑、不缩水、不起球、保暖、不勒、透气、显瘦等效果断言，改写为可见结构、位置或穿搭建议。口播不要出现价格、金额或优惠。素材绘图提示词只描述一张实际照片，不含运镜、时长、字幕和口播。分镜口播有精确时间轴，视频模型生成声音，全程无字幕。
每个分镜 duration 必须正整数，合计精确等于 targetDuration，totalDuration 也必须等于它，禁止近似、增加片尾或默默修正时长。不输出固定竖屏，不假设视频模型能力。`
	category := generate.StringField(payload, "category")
	if category == "fashion" {
		low, high := fashionVoiceoverBudget(target)
		system += "\n仅服饰品类遵循以下叙事，并在脚本 JSON 中输出 beat，取值为 unbox、lifestyle 或 accessory。\n" + fashionNarrativeRules() + "\n" + fashionStillRules() + "\n" + fashionCameraRules() + "\n" + fashionVoiceoverRules() + fmt.Sprintf("\n本次目标 %d 秒，口播汉字合计写 %d 到 %d 个，标点、数字、字母和省略号不计，不得少于 %d 个，也不得超过 %d 个。每一段至少一句能说完的话，不必写满同一密度，单段不超过约每秒 6 个字。卖点用口语说出来，不念论证箭头；口播和同一段画面是同一处。只锁定当前这一件。\n", target, low, high, low, high) + "服饰 videoMode 为 live_presenter 时让同一人物对镜头现场讲解，必须包含 on_camera 分镜，开场和收尾优先露脸说完整短句；product_closeup 是兼容保留的商品展示方式，不代表必须近景；它与 graphic_montage 都为商品展示，scene_demo 为手部或背影展示，这些无露脸模式全部使用 voiceover，不强加人脸。未指定 videoMode 时默认优先出镜人物讲解。根据具体脚本决定是否需要人物或人脸。锁定同一人物及当前这一件单品，衣服上身素材必须 usesProduct:true。"
	}
	system += "\nvoiceover 字段只存台词原文，不代表旁白；每段必须输出 speechMode，取值 on_camera（出镜人物说话）或 voiceover（画外音）。description 和 prompt 写清声音来源与可执行动作。\n" + salesSpeechRules()
	if category == "fashion" {
		system += fashionPresentationRule(generate.StringField(payload, "videoMode"))
	}
	system += workflowScriptOutputExample(target, category, LimitVisionImages(catalog, 8), generate.StringField(payload, "videoMode"))
	facts := map[string]any{"productName": payload["productName"], "category": category, "productDescription": payload["productDescription"], "productAnalysis": payload["productAnalysis"], "brand": payload["brand"], "selectedColor": payload["selectedColor"], "targetAudience": payload["targetAudience"], "videoMode": payload["videoMode"], "targetDuration": target, "aspectRatio": ratio}
	encoded, _ := json.Marshal(facts)
	return withLongOutput(chatBody(model, system, visionParts("请求商品事实及参数："+string(encoded)+"\n以下是允许查看的商品图片，只理解商品，尚未选图，不要输出 imageIndex。", LimitVisionImages(catalog, 8)), 0.5))
}

// Keep workflow output separate from the legacy script example: the current
// contract requires a delivery mode and an asset plan before image selection.
func workflowScriptOutputExample(target int, category string, catalog []CatalogImage, mode string) string {
	presenter := category == "fashion" && (mode == "" || mode == "live_presenter")
	script := SalesScript{
		ID: "script_1", Title: "商品展示", DeliveryMode: "single", TotalDuration: target,
		SEO: ScriptSEO{Title: "发布标题", Hashtags: []string{"#商品展示"}, CoverText: "封面文案", InteractionGuide: "评论引导", Description: "发布描述"},
	}
	if category == "fashion" {
		script.Beat = "lifestyle"
	}
	voiceovers := []string{
		"开场：点出使用场合，字数匹配时长，禁止空号召",
		"中段：写一个使用后果，字数匹配时长，禁止空号召",
		"收尾：说清楚怎么用，字数匹配时长，禁止空号召",
	}
	if category == "fashion" {
		low, high := fashionVoiceoverBudget(target)
		lead := "用一个场合或一件具体的事对镜头开口，把第一条事实嵌进去。"
		tail := "把事实说成对镜头的话，不要写近看怎样、走远怎样"
		if !presenter {
			lead = "用一个场合或一件具体的事用画外音自然开口，把第一条事实嵌进去。"
			tail = "全程使用画外音配合商品或无露脸展示，不要写近看怎样、走远怎样"
		}
		span := fmt.Sprintf("全片汉字合计 %d 到 %d 个。本段至少一句口语，不必写满；单段不超过约每秒 6 个字。%s", low, high, tail)
		voiceovers = []string{
			"开场须直接可念：" + lead + span,
			"中段须直接可念：换装或转身可以少说，只讲这一镜正在看的那一处，禁止只用精致、好看、高级或百搭。" + span,
			"收尾须直接可念：用另一条事实说清怎么穿、什么时候穿，可以征求意见。禁止就看这一件、可以直接入手、简单好搭、值得入、基础百搭、闭眼入。" + span,
		}
	}
	durations := []int{target / 3, target / 3, target - 2*(target/3)}
	for i, duration := range durations {
		script.Shots = append(script.Shots, ScriptShot{
			ShotId: i + 1, Type: []string{"hook", "detail", "closing"}[i], Duration: duration,
			Description: "依照商品事实描述本段连续画面", Camera: "缓慢推近", VisualSource: "ai_generate",
			Transition: "direct_concat", SpeechMode: "voiceover", Voiceover: voiceovers[i], Prompt: "连续实拍画面提示词，包含本段口播原文和声音，无字幕",
		})
		if category == "fashion" {
			script.Shots[i].Camera = "中全景，固定机位，保持正常展示距离"
			script.Shots[i].Description = "在正常距离展示整件商品与穿搭比例，动作自然，商品和标志不靠近镜头"
		}
		if presenter && i != 1 {
			script.Shots[i].SpeechMode = "on_camera"
			script.Shots[i].Description = "同一人物头顶至腰部或大腿的正面中景对镜头亲口讲解，完整嘴部无遮挡，语句结束后再展示动作"
			script.Shots[i].Camera = "中景，手机固定机位，保持距离，嘴部可见"
			script.Shots[i].Prompt = "人物现场说出台词原文，发音与唇形逐字同步，停顿时自然停嘴，无字幕"
		}
	}
	example := workflowScriptResponse(script)
	indexes := []int{}
	if len(catalog) > 0 {
		indexes = append(indexes, catalog[0].Index)
	}
	assetPrompt := "自然光下的真实桌面场景，若展示商品则外观和颜色必须与所选原图一致"
	if category == "fashion" {
		assetPrompt = "自然光下的一张生活实拍照片，正常距离展示整件商品及周围空间，保留轮廓与自然比例，不裁成局部或 logo 大画面，外观和颜色以商品原图为准"
	}
	if presenter {
		assetPrompt = "一张生活实拍静帧：出镜讲解者，写明按当前服装及目标人群选定的东亚成年角色、具体年龄、外貌及发型，保持同一身份，保留自然纹理的真实肤质；脚本里的具体房间，窗光从一侧进来，头顶至腰部或大腿的正面或轻微侧面中景，完整嘴唇清楚可见，手、手机、衣领和商品不遮嘴，表情自然放松。不含秒数、运镜和口播。若展示当前这一件，写清是举着还是已经穿上，外观与商品原图一致"
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
