package videosales

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// Select assigns one collected product image to each storyboard shot.
func Select(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}
		var protocolOK bool
		r, protocolOK = generate.BindTextProtocol(w, r, payload)
		if !protocolOK {
			return
		}
		if err := checkWorkflowVersion(payload); err != nil {
			workflowError(w, 400, err)
			return
		}
		shots := parseSelectShots(payload)
		catalog := parseCatalog(payload)
		if workflowV3(payload) {
			catalog, err = workflowCatalog(payload)
			if err == nil {
				shots, err = strictShots(payload, false, nil)
			}
			if err != nil {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
				return
			}
		}
		if len(shots) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "没有可配图的分镜"})
			return
		}
		if len(catalog) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "没有可选择的商品图"})
			return
		}
		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)
		vision := LimitVisionImages(catalog, 8)
		failure := "请配置多模态模型地址和密钥"
		if key != "" && base != "" {
			content, raw, status, callErr := postChatJSON(r.Context(), base, key, selectChatBody(model, shots, vision), chatWait)
			if callErr != nil || status < 200 || status >= 300 {
				failure = "选图模型调用失败：" + analysisFailureReason(status, callErr)
			} else {
				var parsed struct {
					Assignments []ImageAssignment `json:"assignments"`
				}
				if json.Unmarshal([]byte(content), &parsed) != nil || len(parsed.Assignments) == 0 {
					failure = "选图结果无效"
				} else {
					assigned, applyErr := ApplyStrictAssignments(shots, parsed.Assignments, vision)
					if applyErr != nil {
						httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": applyErr.Error()})
						return
					}
					writeAssignments(w, model, assigned, raw, false)
					return
				}
			}
		}
		if allowed, _ := payload["allowFallback"].(bool); !allowed || workflowV3(payload) || !generate.TextFallbackAllowed(r.Context(), model) {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": failure})
			return
		}
		assigned := AssignImageIndexes(shots, nil, len(catalog))
		for i := range assigned {
			assigned[i].SelectionReason = "模型不可用，按镜头顺序使用商品图"
		}
		writeAssignments(w, model, assigned, nil, true)
	})
}

func writeAssignments(w http.ResponseWriter, model string, shots []ScriptShot, raw map[string]any, degraded bool) {
	assignments := make([]ImageAssignment, 0, len(shots))
	for _, shot := range shots {
		assignments = append(assignments, ImageAssignment{ShotID: shot.ShotId, ImageIndex: shot.ImageIndex, Reason: shot.SelectionReason})
	}
	body := map[string]any{"success": true, "assignments": assignments, "model": model, "degraded": degraded}
	if raw != nil {
		if usage := generate.NormalizeUsage(raw); usage != nil {
			body["usage"] = usage
		}
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func selectChatBody(model string, shots []ScriptShot, vision []CatalogImage) map[string]any {
	var lines []string
	for _, shot := range shots {
		lines = append(lines, fmt.Sprintf("镜头 %d，类型 %s，画面：%s，口播：%s", shot.ShotId, shot.Type, shot.Description, shot.Voiceover))
	}
	intro := "为每个镜头选择一张最合适的商品参考图，并说明选择理由。优先能看清商品的主图或规格图，少用大段文字详情图。imageIndex 必须使用下面给出的图片编号，不要遗漏镜头。\n" +
		strings.Join(lines, "\n") +
		"\n只输出 JSON：{\"assignments\":[{\"shotId\":1,\"imageIndex\":0,\"reason\":\"这张主图能看清包装正面\"}]}"
	return map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": "你负责为带货分镜挑选商品参考图。不要发明目录里没有的图片编号。"},
			{"role": "user", "content": visionParts(intro, vision)},
		},
		"temperature":     0.2,
		"response_format": map[string]string{"type": "json_object"},
	}
}

func parseSelectShots(payload map[string]any) []ScriptShot {
	raw, ok := payload["shots"].([]any)
	if !ok {
		return nil
	}
	shots := make([]ScriptShot, 0, len(raw))
	for _, item := range raw {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		shotID := generate.IntField(obj, "shotId")
		if shotID == 0 {
			shotID = len(shots) + 1
		}
		shots = append(shots, ScriptShot{
			ShotId:      shotID,
			Type:        generate.StringField(obj, "type"),
			Description: generate.StringField(obj, "description"),
			Voiceover:   generate.StringField(obj, "voiceover"),
		})
	}
	return shots
}
