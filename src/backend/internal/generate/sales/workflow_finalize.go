package sales

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

func handleWorkflowFinalize(w http.ResponseWriter, r *http.Request, cfg config.Config, payload map[string]any) {
	operation := generate.StringField(payload, "operation")
	if operation == "validate-assets" {
		workflowError(w, http.StatusGone, fmt.Errorf("自动素材校验已停用，请在素材页人工确认图片后定稿"))
		return
	}
	if operation != "finalize" {
		workflowError(w, 400, fmt.Errorf("operation 必须为 finalize"))
		return
	}
	catalog, err := workflowCatalog(payload)
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	shots, err := strictShots(payload, true, catalog)
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	refs, err := workflowReferences(payload, catalog)
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	if err := validateSpeakingReferences(shots, refs); err != nil {
		workflowError(w, 400, err)
		return
	}
	target, ratio, err := workflowTiming(payload)
	if err == nil {
		err = exactDuration(shots, target)
	}
	if err != nil {
		workflowError(w, 400, err)
		return
	}
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	base, key := resolveCredentials(cfg, r, payload)
	if base == "" || key == "" {
		workflowError(w, 502, fmt.Errorf("视觉模型凭据不可用"))
		return
	}
	body := workflowFinalizeBody(model, payload, shots, refs, catalog, target, ratio)
	content, raw, status, err := postChatJSON(r.Context(), base, key, body, chatWait)
	if errors.Is(err, errTruncatedOutput) {
		workflowError(w, 502, fmt.Errorf("视频定稿失败：%w", err))
		return
	}
	if err != nil || status < 200 || status >= 300 {
		workflowError(w, 502, fmt.Errorf("视频定稿失败：%s", analysisFailureReason(status, err)))
		return
	}
	response := map[string]any{"success": true, "model": model}
	prompts, full, err := parseWorkflowPrompts(content, shots)
	languageWarnings := []string{}
	if err == nil {
		fullResult := chineseSalesDirectingWithReport(full, shots)
		full = fullResult.Text
		languageWarnings = append(languageWarnings, fullResult.Converted...)
		for i := range prompts {
			promptResult := chineseSalesDirectingWithReport(prompts[i].Prompt, shots)
			prompts[i].Prompt = promptResult.Text
			languageWarnings = append(languageWarnings, promptResult.Converted...)
		}
		err = validateChineseSalesDirectingWithAllowlist(full, prompts, shots, []string{
			generate.StringField(payload, "brand"),
			generate.StringField(payload, "productName"),
		})
	}
	if err == nil {
		err = validateFinalSpeech(full, prompts, shots)
	}
	if err == nil {
		err = validateFinalImageNumbers(full, prompts, len(refs))
	}
	if err != nil {
		workflowError(w, 502, err)
		return
	}
	if len(languageWarnings) > 0 {
		response["languageWarnings"] = uniqueSalesLanguageTerms(languageWarnings)
	}
	// A deterministic preamble binds continuous reference numbering and exact timing.
	finalFullResult := chineseSalesDirectingWithReport(workflowFinalConstraints(payload, shots, refs, target, ratio)+"\n"+full, shots)
	response["fullPrompt"] = finalFullResult.Text
	if len(finalFullResult.Converted) > 0 {
		languageWarnings = append(languageWarnings, finalFullResult.Converted...)
		response["languageWarnings"] = uniqueSalesLanguageTerms(languageWarnings)
	}
	for i, shot := range shots {
		prompts[i].Prompt = speechDirection(shot.SpeechMode) + "\n" + prompts[i].Prompt
	}
	response["prompts"] = prompts
	if usage := generate.NormalizeUsage(raw); usage != nil {
		response["usage"] = usage
	}
	httpx.WriteJSON(w, 200, withSalesSkill(response))
}

func uniqueSalesLanguageTerms(values []string) []string {
	unique := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		key := strings.ToLower(strings.TrimSpace(value))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		unique = append(unique, strings.TrimSpace(value))
	}
	return unique
}

var unresolvedFinalReference = regexp.MustCompile(`(?i)\{\{\s*Mixed\b[^}]*\}\}|</?node-asset\b`)

var finalImageNumber = regexp.MustCompile(`(?:图片|参考图|图)\s*([0-9]+)`)

func validateFinalImageNumbers(full string, prompts []finalPrompt, count int) error {
	texts := []string{full}
	for _, prompt := range prompts {
		texts = append(texts, prompt.Prompt)
	}
	for _, text := range texts {
		if unresolvedFinalReference.MatchString(text) {
			return fmt.Errorf("定稿残留未绑定的参考占位，请改用实际图片编号")
		}
		for _, match := range finalImageNumber.FindAllStringSubmatch(text, -1) {
			index, err := strconv.Atoi(match[1])
			if err != nil || index < 1 || index > count {
				return fmt.Errorf("定稿引用了不存在的实际图片编号 %s", match[1])
			}
		}
	}
	return nil
}

func parseWorkflowPrompts(content string, shots []ScriptShot) ([]finalPrompt, string, error) {
	var parsed struct {
		FullPrompt string        `json:"fullPrompt"`
		Prompts    []finalPrompt `json:"prompts"`
	}
	object, ok := scriptJSONObject(content)
	if !ok || json.Unmarshal(object, &parsed) != nil || strings.TrimSpace(parsed.FullPrompt) == "" {
		return nil, "", fmt.Errorf("缺少完整视频提示词或 JSON 无效")
	}
	if len(parsed.Prompts) != len(shots) {
		return nil, "", fmt.Errorf("定稿分镜数量不完整")
	}
	expected := map[int]bool{}
	for _, shot := range shots {
		expected[shot.ShotId] = true
	}
	byID := map[int]finalPrompt{}
	for _, prompt := range parsed.Prompts {
		if !expected[prompt.ShotID] || byID[prompt.ShotID].ShotID != 0 || strings.TrimSpace(prompt.Prompt) == "" {
			return nil, "", fmt.Errorf("定稿分镜编号未知、重复或缺少提示词")
		}
		byID[prompt.ShotID] = finalPrompt{ShotID: prompt.ShotID, SpeechMode: prompt.SpeechMode, Prompt: strings.TrimSpace(prompt.Prompt)}
	}
	out := make([]finalPrompt, 0, len(shots))
	for _, shot := range shots {
		out = append(out, byID[shot.ShotId])
	}
	return out, strings.TrimSpace(parsed.FullPrompt), nil
}

func workflowFinalConstraints(payload map[string]any, shots []ScriptShot, refs []actualReference, target int, ratio string) string {
	// Keep this preamble executable and short. The finalize model already receives
	// the full skill stage in its system message; repeating the render manual here
	// crowds out the actual timeline and encourages static, one-frame outputs.
	intro := fmt.Sprintf("一次生成一条完整视频，总时长精确 %d 秒，画幅 %s，原生480P，生成后转码为720×1280。前3秒出现并兑现强钩子。分镜是同一条视频的连续时间轴，按脚本决定连续动作或明确切镜；相邻时间段必须有可观察的新事件、状态变化或切点，不能只更换台词而保持同一姿势、构图和商品状态。", target, ratio)
	lines := []string{"【视频要求】\n" + intro, "【商品外观】\n" + salesSkillDirective("video", "colorFidelity")}
	if color := strings.TrimSpace(generate.StringField(payload, "selectedColor")); color != "" {
		lines = append(lines, strings.ReplaceAll(salesSkillDirective("video", "selectedColor"), "{{color}}", color))
	}
	if len(refs) > 0 {
		lines = append(lines, "【图片参考职责】\n只写实际提交顺序中的图片编号；人物图继承同一东亚角色的完整身份，商品图只约束当前商品规格的颜色、版型、图案和结构，场景图只约束对应镜头的布局、光向与陈设。新场景不搬入人物图背景，不保留未绑定参考占位或内部编号。")
	}
	for i, ref := range refs {
		role := salesSkillDirective("referenceRoles", "default")
		switch ref.Kind {
		case "product":
			role = salesSkillDirective("referenceRoles", "product")
		case "scene":
			role = salesSkillDirective("referenceRoles", "scene")
		case "face":
			role = salesSkillDirective("referenceRoles", "face")
		}
		lines = append(lines, fmt.Sprintf("图片%d：%s。", i+1, role))
	}
	lines = append(lines, "【场景与道具】\n按脚本选择连续讲述、同空间切镜或短途日常动线；按时间轴指定的机位、相机距离和画面范围执行，各场景使用自身参考的光向和陈设，不覆盖其他场景。动作必须写清起始状态、动作/切镜和结果状态；连续后段继承前段动作状态，只写变化。\n【分段声音要求】")
	start := 0
	for _, shot := range shots {
		// Keep source deterministic without copying the dialogue into the preamble.
		lines = append(lines, fmt.Sprintf("%d–%d秒：", start, start+shot.Duration)+speechDirection(shot.SpeechMode)+" 台词只保留在本时间段一次；出镜段嘴部清楚可见，画外音段按脚本构图，不强加人脸或画内开口。")
		start += shot.Duration
	}
	lines = append(lines, "【输出边界】\n视频模型只生成干净画面和声音，不生成字幕、贴纸、价格条、参数文字或其他可读文字；默认后期加入压低混音的BGM，字幕与信息层最后叠加。")
	return chineseSalesDirecting(strings.Join(lines, "\n"), nil)
}

func workflowFinalizeBody(model string, payload map[string]any, shots []ScriptShot, refs []actualReference, catalog []CatalogImage, target int, ratio string) map[string]any {
	facts, _ := json.Marshal(map[string]any{"shots": shots, "assets": payload["assets"], "productAnalysis": payload["productAnalysis"], "productDescription": payload["productDescription"], "brand": payload["brand"], "productName": payload["productName"], "category": payload["category"], "selectedColor": payload["selectedColor"], "videoModel": payload["videoModel"], "videoRefMode": payload["videoRefMode"], "videoResolution": payload["videoResolution"]})
	system := salesSkillInstructions("finalize") + `
只执行实际图片定稿，严格保持输入时间轴、画幅、原文台词与 speechMode。不要求人物或场景绘图提示词，不输出 imagePrompt。参考编号以 actualReferences 的实际顺序为准，商品对照原图目录编号不等于成片编号。
fullPrompt 和每项 prompt 的画面、动作、声音及标题全部使用中文；出镜说话、画外音、商品规格、标志、生活记录均写中文，不把英文协议值、字段名、品牌原文或内部标识带进提示词正文。JSON 字段名和 speechMode 枚举值按协议保留英文，已确认的台词原文逐字保留。
完整提示词按模板用【中文章节名】独立换行，段落之间换行，时间轴每个时间范围独占一段。只写当前商品及实际镜头的执行内容，不照抄教程，不重复请求前言中的通用规则、参考职责或声音时间轴。
只输出 JSON {"fullPrompt":"完整视频提示词，逐段声音来源明确，每段台词原文仅写一次","prompts":[{"shotId":1,"speechMode":"on_camera","prompt":"本段实际图定稿，完整保留本段台词原文一次"}]}。speechMode 只能为 on_camera 或 voiceover，必须逐段与输入一致；示例值不是默认值。prompts 必须与原 shotId 一一对应。`

	return withLongOutput(chatBody(model, system, workflowVisionParts(workflowFinalConstraints(payload, shots, refs, target, ratio)+"\n请求事实："+string(facts), refs, catalog), 0.3))
}
