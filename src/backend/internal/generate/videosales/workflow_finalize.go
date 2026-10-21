package videosales

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
	if !workflowV3(payload) {
		workflowError(w, 400, fmt.Errorf("operation 需要 workflowVersion:3"))
		return
	}
	operation := generate.StringField(payload, "operation")
	if operation != "validate-assets" && operation != "finalize" {
		workflowError(w, 400, fmt.Errorf("未知或缺少 operation"))
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
	target, ratio := 0, ""
	if operation == "finalize" {
		target, ratio, err = workflowTiming(payload)
		if err == nil {
			err = exactDuration(shots, target)
		}
		if err != nil {
			workflowError(w, 400, err)
			return
		}
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
	body := validationBody(model, payload, shots, refs, catalog)
	if operation == "finalize" {
		body = workflowFinalizeBody(model, payload, shots, refs, catalog, target, ratio)
	}
	content, raw, status, err := postChatJSON(r.Context(), base, key, body, chatWait)
	if errors.Is(err, errTruncatedOutput) {
		label := "素材校验失败"
		if operation == "finalize" {
			label = "视频定稿失败"
		}
		workflowError(w, 502, fmt.Errorf("%s：%w", label, err))
		return
	}
	if err != nil || status < 200 || status >= 300 {
		label := "素材校验失败"
		if operation == "finalize" {
			label = "视频定稿失败"
		}
		workflowError(w, 502, fmt.Errorf("%s：%s", label, analysisFailureReason(status, err)))
		return
	}
	response := map[string]any{"success": true, "model": model}
	if operation == "validate-assets" {
		validations, err := parseValidations(content, refs)
		if err != nil {
			workflowError(w, 502, err)
			return
		}
		response["validations"] = validations
	} else {
		prompts, full, err := parseWorkflowPrompts(content, shots)
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
	}
	if usage := generate.NormalizeUsage(raw); usage != nil {
		response["usage"] = usage
	}
	httpx.WriteJSON(w, 200, response)
}

var finalImageNumber = regexp.MustCompile(`(?:图片|参考图|图)\s*([0-9]+)`)

func validateFinalImageNumbers(full string, prompts []finalPrompt, count int) error {
	texts := []string{full}
	for _, prompt := range prompts {
		texts = append(texts, prompt.Prompt)
	}
	for _, text := range texts {
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
	if json.Unmarshal([]byte(content), &parsed) != nil || strings.TrimSpace(parsed.FullPrompt) == "" {
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
		byID[prompt.ShotID] = finalPrompt{ShotID: prompt.ShotID, Prompt: strings.TrimSpace(prompt.Prompt)}
	}
	out := make([]finalPrompt, 0, len(shots))
	for _, shot := range shots {
		out = append(out, byID[shot.ShotId])
	}
	return out, strings.TrimSpace(parsed.FullPrompt), nil
}

func workflowFinalConstraints(payload map[string]any, shots []ScriptShot, refs []actualReference, target int, ratio string) string {
	intro := fmt.Sprintf("一次生成一条完整视频，总时长精确 %d 秒，画幅 %s。分镜仅为同一视频时间轴，禁止增删时长。全程无字幕、无贴纸、无价格条，口播由视频模型生成，不要出现价格、金额或优惠。", target, ratio)
	if generate.StringField(payload, "category") == "fashion" {
		intro += fashionPaceNote() + "\n" + fashionFramingRules()
	}
	lines := []string{intro, salesSpeechRules()}
	for i, ref := range refs {
		lines = append(lines, fmt.Sprintf("图片%d：%s（ID=%s，类型=%s）；按实际图片锁定外观与连续性。", i+1, ref.Label, ref.ID, ref.Kind))
	}
	if color := strings.TrimSpace(generate.StringField(payload, "selectedColor")); color != "" {
		lines = append(lines, "商品颜色事实："+color+"；款式与商品原图一致，不可创意改色或换款。")
	}
	start := 0
	for _, shot := range shots {
		lines = append(lines, fmt.Sprintf("%d–%d秒：镜头%d，口播原文「%s」。", start, start+shot.Duration, shot.ShotId, shot.Voiceover)+speechDirection(shot.SpeechMode))
		start += shot.Duration
	}
	return strings.Join(lines, "\n")
}

func workflowFinalizeBody(model string, payload map[string]any, shots []ScriptShot, refs []actualReference, catalog []CatalogImage, target int, ratio string) map[string]any {
	facts, _ := json.Marshal(map[string]any{"shots": shots, "assets": payload["assets"], "productAnalysis": payload["productAnalysis"], "category": payload["category"], "selectedColor": payload["selectedColor"], "videoModel": payload["videoModel"], "videoRefMode": payload["videoRefMode"], "videoResolution": payload["videoResolution"]})
	system := `沿用每段 speechMode；voiceover 字段是台词原文，不默认代表旁白。fullPrompt 和对应分段 prompts 必须完整保留本段台词原文及声音来源，不增删改写。你负责所有商品品类的实际图片定稿。逐张观察实际参考图与商品原图，以真实图的外观而非计划中的想象写一条完整视频提示词。图片编号只能引用给出的实际图片连续编号，不得把商品对照图的目录编号当成图片编号，不得虚构缺失人物、人脸或场景。参考图是外观约束，不强迫图间幻灯片切换。逐张辨认商品正面、背面和局部，锁定领口、门襟、口袋、接缝、图案和标志所在部位；不能把背面写成正面、把镜像写成转身或把胸前标志移到背部。保持人物身份、商品颜色款式、空间与动作连续；只对服饰采用真实穿搭或鞋包展示规则，其余品类按自己的脚本。禁止编造事实。逐段包含准确起止秒数、原文口播、运镜、动作和衔接；全程无字幕。一次生成整段视频，不拆任务。不要求人物或场景绘图提示词，不生成 imagePrompt。没有提供的视频模型、分辨率、参考模式均不得自行默认或猜测；音频能力已经由调用方检查。严格按输入画幅、目标时长，不输出固定竖屏。只输出 JSON {"fullPrompt":"一条整段视频提示词","prompts":[{"shotId":1,"prompt":"本段定稿"}]}。`
	if generate.StringField(payload, "category") == "fashion" {
		system += "\n" + fashionFinalPromptRules()
	}
	return withLongOutput(chatBody(model, system, workflowVisionParts(workflowFinalConstraints(payload, shots, refs, target, ratio)+"\n请求事实："+string(facts), refs, catalog), 0.3))
}
