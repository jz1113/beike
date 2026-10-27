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
	if err == nil {
		full = chineseSalesDirecting(full, shots)
		for i := range prompts {
			prompts[i].Prompt = chineseSalesDirecting(prompts[i].Prompt, shots)
		}
		err = validateChineseSalesDirecting(full, prompts, shots)
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
	// A deterministic preamble binds continuous reference numbering and exact timing.
	response["fullPrompt"] = workflowFinalConstraints(payload, shots, refs, target, ratio) + "\n" + full
	for i, shot := range shots {
		prompts[i].Prompt = speechDirection(shot.SpeechMode) + "\n" + prompts[i].Prompt
	}
	response["prompts"] = prompts
	if usage := generate.NormalizeUsage(raw); usage != nil {
		response["usage"] = usage
	}
	httpx.WriteJSON(w, 200, withSalesSkill(response))
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
	intro := strings.NewReplacer("{{target}}", strconv.Itoa(target), "{{ratio}}", ratio).Replace(salesSkillDirective("video", "intro"))
	intro = "【视频要求】\n" + intro + "\n" + fashionVideoRenderRules()

	lines := []string{intro, "【商品外观】\n" + salesSkillDirective("video", "colorFidelity")}
	if color := strings.TrimSpace(generate.StringField(payload, "selectedColor")); color != "" {
		lines = append(lines, strings.ReplaceAll(salesSkillDirective("video", "selectedColor"), "{{color}}", color))
	}
	if len(refs) > 0 {
		lines = append(lines, "【图片参考职责】")
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
	lines = append(lines, "【分段声音要求】")
	start := 0
	for _, shot := range shots {
		// The generated full prompt has already been checked for every verbatim line.
		// Keep timing and source deterministic without repeating dialogue or implying a cut.
		lines = append(lines, fmt.Sprintf("%d–%d秒：", start, start+shot.Duration)+speechDirection(shot.SpeechMode))
		start += shot.Duration
	}
	return chineseSalesDirecting(strings.Join(lines, "\n"), nil)
}

func workflowFinalizeBody(model string, payload map[string]any, shots []ScriptShot, refs []actualReference, catalog []CatalogImage, target int, ratio string) map[string]any {
	facts, _ := json.Marshal(map[string]any{"shots": shots, "assets": payload["assets"], "productAnalysis": payload["productAnalysis"], "productDescription": payload["productDescription"], "category": payload["category"], "selectedColor": payload["selectedColor"], "videoModel": payload["videoModel"], "videoRefMode": payload["videoRefMode"], "videoResolution": payload["videoResolution"]})
	system := salesSkillInstructions("finalize") + `
只执行实际图片定稿，严格保持输入时间轴、画幅、原文台词与 speechMode。不要求人物或场景绘图提示词，不输出 imagePrompt。参考编号以 actualReferences 的实际顺序为准，商品对照原图目录编号不等于成片编号。
fullPrompt 和每项 prompt 的画面、动作、声音及标题全部使用中文；出镜说话、画外音、商品规格、标志、生活记录均写中文，不把英文协议值、字段名、品牌原文或内部标识带进提示词正文。JSON 字段名和 speechMode 枚举值按协议保留英文，已确认的台词原文逐字保留。
完整提示词按模板用【中文章节名】独立换行，段落之间换行，时间轴每个时间范围独占一段。只写当前商品及实际镜头的执行内容，不照抄教程，不重复请求前言中的通用规则、参考职责或声音时间轴。
只输出 JSON {"fullPrompt":"完整视频提示词，逐段声音来源明确，每段台词原文仅写一次","prompts":[{"shotId":1,"speechMode":"on_camera","prompt":"本段实际图定稿，完整保留本段台词原文一次"}]}。speechMode 只能为 on_camera 或 voiceover，必须逐段与输入一致；示例值不是默认值。prompts 必须与原 shotId 一一对应。`

	return withLongOutput(chatBody(model, system, workflowVisionParts(workflowFinalConstraints(payload, shots, refs, target, ratio)+"\n请求事实："+string(facts), refs, catalog), 0.3))
}
