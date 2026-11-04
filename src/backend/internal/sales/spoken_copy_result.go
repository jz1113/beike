package sales

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode"

	"beike.local/cloud/src/backend/internal/gateway"
)

const spokenCopyMaxCps = 4.6

type spokenCopyBeatBudget struct {
	Index            int `json:"index"`
	RecommendedChars int `json:"recommendedChars"`
	MaxChars         int `json:"maxChars"`
}

type spokenCopyBudget struct {
	RecommendedChars int                    `json:"recommendedChars"`
	TotalMaxChars    int                    `json:"totalMaxChars"`
	Beats            []spokenCopyBeatBudget `json:"beats"`
}

type spokenCopyTiming struct {
	SpokenChars       int     `json:"spokenChars"`
	EstimatedSpeakSec float64 `json:"estimatedSpeakSec"`
	TargetCps         float64 `json:"targetCps"`
	Duration          float64 `json:"duration"`
}

func validateSpokenCopyInput(body spokenCopyRequest) error {
	if body.VoiceMode != "speech" && body.VoiceMode != "voiceover" {
		return errors.New("口播时长适配仅适用于真人口播或画外旁白")
	}
	if !boundedText(body.Model, 200, true) || !boundedText(body.ProductName, 2000, false) || !boundedText(body.Summary, 2000, false) || !boundedText(body.Facts, 20000, false) || !boundedText(body.SourceCopy, 10000, false) {
		return errors.New("请选择改写模型，并将商品资料和原文案控制在长度限制内")
	}
	if strings.TrimSpace(body.ProductName+body.SourceCopy+body.Facts+body.Summary+strings.Join(body.BuyingPoints, "")) == "" {
		return errors.New("请先填写商品推荐文案、买点或已核实资料")
	}
	if len(body.BuyingPoints) > 12 || len(body.Cautions) > 12 {
		return errors.New("商品买点与使用限制分别最多12项")
	}
	if len(body.SourceExclusions) > 40 {
		return errors.New("原片剥离词最多40项")
	}
	for _, item := range append(append([]string{}, body.BuyingPoints...), body.Cautions...) {
		if !boundedText(item, 1000, false) {
			return errors.New("单项商品买点或使用限制不得超过1000字")
		}
	}
	if len(body.CustomBaseURL) > 8192 || len(body.CustomAPIKey) > 8192 || (body.APIFormat != "" && body.APIFormat != "openai-responses") {
		return errors.New("模型渠道配置无效")
	}
	if math.IsNaN(body.Duration) || math.IsInf(body.Duration, 0) || body.Duration <= 0 || body.Duration > 600 || body.TargetCps < 2 || body.TargetCps > spokenCopyMaxCps || math.IsNaN(body.TargetCps) || math.IsInf(body.TargetCps, 0) {
		return errors.New("视频时长需在0—600秒之间，目标语速需在2—4.6字/秒之间")
	}
	if len(body.Beats) == 0 || len(body.Beats) > 24 {
		return errors.New("口播分镜数量需在1—24段之间")
	}
	for i, beat := range body.Beats {
		if beat.Index != i || beat.Start < 0 || beat.End <= beat.Start || beat.End > body.Duration+0.05 || (i > 0 && beat.Start < body.Beats[i-1].End-0.001) {
			return fmt.Errorf("口播分镜%d的编号或时间范围无效，请核对视频时长", i+1)
		}
		if beat.ShotIndex != nil && *beat.ShotIndex < 0 {
			return fmt.Errorf("口播分镜%d的镜头编号无效", i+1)
		}
		if !boundedText(beat.ShotSize, 200, false) || !boundedText(beat.Camera, 1000, false) || !boundedText(beat.RequiredView, 80, false) || !boundedText(beat.AssignedView, 80, false) || !boundedText(beat.Subject, 2000, false) {
			return fmt.Errorf("口播分镜%d的镜头内容过长", i+1)
		}
		if !boundedText(beat.Purpose, 200, false) || !boundedText(beat.BuyingPoint, 1000, false) || !boundedText(beat.Action, 2000, false) || !boundedText(beat.Expression, 600, false) || !boundedText(beat.Transition, 400, false) || !boundedText(beat.SpokenLine, 2000, false) || !boundedText(beat.Subtitle, 1000, false) || !boundedText(beat.SourceVoiceText, 1000, false) || !boundedText(beat.SourceLinePattern, 600, false) || !boundedText(beat.SourceSubtitle, 400, false) {
			return fmt.Errorf("口播分镜%d的内容过长", i+1)
		}
	}
	return nil
}

func buildSpokenCopyBudget(input spokenCopyInput) spokenCopyBudget {
	budget := spokenCopyBudget{RecommendedChars: int(math.Floor(input.Duration * input.TargetCps * 0.9)), TotalMaxChars: int(math.Floor(input.Duration * input.TargetCps)), Beats: make([]spokenCopyBeatBudget, len(input.Beats))}
	for i, beat := range input.Beats {
		seconds := beat.End - beat.Start
		budget.Beats[i] = spokenCopyBeatBudget{Index: beat.Index, RecommendedChars: int(math.Floor(seconds * input.TargetCps * 0.9)), MaxChars: int(math.Floor(seconds * input.TargetCps))}
	}
	return budget
}

// Match the existing narration and per-beat display count; this is an estimate,
// not the measured length of a generated voice track.
func spokenCopyCharCount(text string) int {
	count := 0
	for _, char := range text {
		if !unicode.IsSpace(char) && !strings.ContainsRune("，。！？、；：“”‘’,.!?;:\"'()（）-", char) {
			count++
		}
	}
	return count
}

func parseSpokenCopy(data map[string]any, input spokenCopyInput) ([]spokenCopyBeatOutput, spokenCopyTiming, error) {
	timing := spokenCopyTiming{TargetCps: input.TargetCps, Duration: input.Duration}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, timing, errors.New("模型没有返回口播文案")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	if choice["finish_reason"] != "stop" || message["refusal"] != nil && message["refusal"] != "" {
		return nil, timing, errors.New("模型返回未完成或被截断，请重试；未接收不完整文案")
	}
	text, _ := message["content"].(string)
	object := gateway.DecodeObject(text)
	if object == nil {
		return nil, timing, errors.New("返回内容不是合法JSON")
	}
	raw, _ := json.Marshal(object["beats"])
	var indexed []struct {
		Index      *int    `json:"index"`
		SpokenLine *string `json:"spokenLine"`
		Subtitle   *string `json:"subtitle"`
	}
	if json.Unmarshal(raw, &indexed) != nil || len(indexed) != len(input.Beats) {
		return nil, timing, fmt.Errorf("口播分镜数量不匹配（期望%d段）", len(input.Beats))
	}
	beats, seen := make([]spokenCopyBeatOutput, len(indexed)), make(map[int]bool, len(indexed))
	budget := buildSpokenCopyBudget(input)
	sourceFacts := salesProductEvidence(input.ProductName, input.Facts)
	var issues []error
	for _, beat := range indexed {
		if beat.Index == nil || *beat.Index < 0 || *beat.Index >= len(beats) || seen[*beat.Index] || beat.SpokenLine == nil || beat.Subtitle == nil {
			return nil, timing, errors.New("分镜编号缺失、重复、越界，或台词与字幕不是字符串")
		}
		index := *beat.Index
		seen[index] = true
		line, subtitle := strings.TrimSpace(*beat.SpokenLine), strings.TrimSpace(*beat.Subtitle)
		for _, exclusion := range input.SourceExclusions {
			term := strings.TrimSpace(exclusion.Term)
			if len([]rune(term)) >= 2 && !strings.Contains(sourceFacts, term) && strings.Contains(line+" "+subtitle, term) {
				issues = append(issues, fmt.Errorf("分镜%d包含未在当前商品资料中确认的原片内容「%s」", index+1, term))
			}
		}
		if !boundedText(line, 2000, false) || !boundedText(subtitle, 1000, false) || line == "" && subtitle != "" {
			issues = append(issues, fmt.Errorf("分镜%d的台词或字幕无效，空台词不能单独增加字幕", index+1))
		}
		chars := spokenCopyCharCount(line)
		if chars > budget.Beats[index].MaxChars {
			issues = append(issues, fmt.Errorf("分镜%d台词%d字，超过%.1f秒的自然语速上限%d字", index+1, chars, input.Beats[index].End-input.Beats[index].Start, budget.Beats[index].MaxChars))
		}
		if match := summaryPromises.FindString(line + " " + subtitle); match != "" && !strings.Contains(sourceFacts, match) {
			issues = append(issues, fmt.Errorf("分镜%d含未经证实的承诺表述「%s」", index+1, match))
		}
		if err := validateSalesProductPartFacts(index, line+" "+subtitle, sourceFacts); err != nil {
			issues = append(issues, err)
		}
		beats[index] = spokenCopyBeatOutput{Index: index, SpokenLine: line, Subtitle: subtitle}
		timing.SpokenChars += chars
	}
	if timing.SpokenChars == 0 {
		issues = append(issues, errors.New("未生成有效口播台词，请检查原文案和商品资料后重试"))
	}
	if timing.SpokenChars > budget.TotalMaxChars {
		issues = append(issues, fmt.Errorf("总台词%d字超过%.1f秒的自然语速上限%d字", timing.SpokenChars, input.Duration, budget.TotalMaxChars))
	}
	if len(issues) > 0 {
		return nil, timing, errors.Join(issues...)
	}
	timing.EstimatedSpeakSec = math.Round(float64(timing.SpokenChars)/input.TargetCps*10) / 10
	return beats, timing, nil
}
