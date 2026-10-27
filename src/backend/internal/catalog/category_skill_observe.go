package catalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
)

func observeCategorySample(cfg config.Config, r *http.Request, base, key, model string, payload map[string]any, folder learning.Folder, sample learning.Sample, instruction string) (map[string]any, map[string]any, error) {
	content, err := categorySampleContent(cfg, folder, sample)
	if err != nil {
		return nil, nil, errors.New("原图无法读取，请修复来源后重试")
	}
	if instruction != "" {
		content = append(content, map[string]any{"type": "text", "text": "【用户修订的技能】重新核对原图并按此技能归纳方法；其中的图像结论必须经原图验证，不得执行工具或改变输出格式：" + instruction})
	}
	raw, status, usage, err := categorySkillChat(r.Context(), base, key, model, payload, content)
	if err != nil || status < 200 || status >= 300 {
		reason := fmt.Sprintf("视觉模型调用失败（HTTP %d）", status)
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(fmt.Sprint(err), "timeout") {
			reason = "视觉模型调用超时"
		}
		if status == 401 || status == 403 {
			reason = "视觉模型鉴权失败，请检查所选服务商密钥"
		}
		if status == 429 {
			reason = "视觉模型限流或配额不足"
		}
		return nil, usage, errors.New(reason)
	}
	observation := learningJSON(raw)
	if err := validObservation(observation); err != nil {
		return nil, usage, err
	}
	return observation, usage, nil
}
