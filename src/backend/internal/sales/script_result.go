package sales

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"beike.local/cloud/src/backend/internal/gateway"
)

type scriptBeatCheck struct {
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Action     string  `json:"action"`
	Expression string  `json:"expression"`
	Transition string  `json:"transition"`
}
type scriptShotCheck struct {
	Start float64           `json:"start"`
	End   float64           `json:"end"`
	Beats []scriptBeatCheck `json:"beats"`
}
type scriptCheck struct {
	Title       string            `json:"title"`
	DurationSec float64           `json:"durationSec"`
	Format      string            `json:"format"`
	VoiceMode   string            `json:"voiceMode"`
	Shots       []scriptShotCheck `json:"shots"`
}

func validateScriptObject(object map[string]any) (scriptCheck, error) {
	if object == nil {
		return scriptCheck{}, errors.New("正文不是合法 JSON")
	}
	if err := validateScriptVisualFields(object); err != nil {
		return scriptCheck{}, err
	}
	raw, err := json.Marshal(object)
	if err != nil {
		return scriptCheck{}, errors.New("脚本 JSON 序列化失败")
	}
	var check scriptCheck
	if json.Unmarshal(raw, &check) != nil {
		return scriptCheck{}, errors.New("时间轴或表情衔接字段类型错误")
	}
	if err := validateScriptTimeline(check); err != nil {
		return scriptCheck{}, err
	}
	return check, nil
}

// Reject malformed performance fields before client normalization can erase them.
func parseScriptCompletion(data map[string]any) (map[string]any, error) {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, errors.New("模型没有返回内容")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	finish, _ := choice["finish_reason"].(string)
	text, _ := message["content"].(string)
	switch finish {
	case "length":
		return nil, errors.New("输出达到长度上限，请截取更短的参考视频")
	case "content_filter":
		return nil, errors.New("返回内容被渠道安全策略拦截")
	case "stop":
	default:
		return nil, errors.New("模型返回未完成")
	}
	object := gateway.DecodeObject(text)
	groupFlatShotActions(object)
	if _, err := validateScriptObject(object); err != nil {
		return nil, err
	}
	return object, nil
}

func validateScriptTimeline(script scriptCheck) error {
	if script.DurationSec <= 0 || script.DurationSec > 600 || math.IsNaN(script.DurationSec) {
		return errors.New("视频时长无效或超过 10 分钟")
	}
	if len(script.Shots) == 0 || len(script.Shots) > 40 {
		return errors.New("镜头数量应为 1—40 个")
	}
	limit := script.DurationSec + 0.5
	previous := 0.0
	for i, shot := range script.Shots {
		if shot.Start < 0 || shot.End <= shot.Start || shot.End > limit || shot.Start < previous-0.25 {
			return fmt.Errorf("镜头 %d 的时间无效或与前一镜重叠", i+1)
		}
		if len(shot.Beats) == 0 {
			return fmt.Errorf("镜头 %d 未返回可用动作段（beats），请补充该镜头的动作和起止秒数", i+1)
		}
		if len(shot.Beats) > 24 {
			return fmt.Errorf("镜头 %d 返回了 %d 个动作段，单镜最多支持 24 段", i+1, len(shot.Beats))
		}
		beatPrevious := shot.Start
		for j, beat := range shot.Beats {
			if len([]rune(beat.Expression)) > 600 || len([]rune(beat.Transition)) > 400 {
				return fmt.Errorf("镜头 %d 的动作段 %d 的表情或衔接描述过长，请分别控制在 600 和 400 字以内", i+1, j+1)
			}
			if beat.Start < shot.Start-0.25 || beat.End > shot.End+0.25 || beat.End <= beat.Start || beat.Start < beatPrevious-0.25 {
				return fmt.Errorf("镜头 %d 的动作段 %d 超出镜头范围或重叠", i+1, j+1)
			}
			beatPrevious = beat.End
		}
		previous = shot.End
	}
	return nil
}
