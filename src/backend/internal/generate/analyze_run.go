package generate

import (
	"encoding/json"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func runAnalyze(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := rawString(payload, "model")
	if model == "" {
		model = "gpt-5.6-luna"
	}
	base, apiKey := imageSubmitCredentials(cfg, r, payload, model)
	shotCount := int(rawNumber(payload, "shotCount"))
	if shotCount == 0 {
		shotCount = 4
	}
	title := rawString(payload, "productTitle")
	messages := []any{map[string]any{"role": "user", "content": analyzePrompt(title, rawString(payload, "productProps"), shotCount, rawString(payload, "extraRequirements"))}}
	text, _, status, err := chatCompletion(r.Context(), base, apiKey, model, messages, 0.4, 90*time.Second)
	if err != nil || status >= 300 || text == "" {
		message := "视觉分析失败"
		if err != nil {
			message = err.Error()
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": message})
		return
	}
	parsed := decodeObject(text)
	if parsed == nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "视觉模型没有返回合法 JSON"})
		return
	}
	prompts, _ := parsed["prompts"].([]any)
	if prompts == nil {
		prompts = []any{}
	}
	fingerprint := textField(parsed, "productFingerprint", "product_fingerprint")
	role := textField(parsed, "productRole", "product_role")
	scene := textField(parsed, "masterScene", "master_scene")
	look := textField(parsed, "lookBible", "look_bible")
	style := textField(parsed, "styleBible", "style_bible")
	identity := textField(parsed, "identityBible", "identity_bible")
	action := textField(parsed, "actionDigest")
	saveAnalysis(cfg, r, title, fingerprint, model, prompts)
	var group any
	if scene != "" {
		group = map[string]any{"scene": scene, "actionDigest": action}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success":             true,
		"product_fingerprint": fingerprint, "productFingerprint": fingerprint,
		"product_role": role, "productRole": role,
		"master_scene": scene, "masterScene": scene,
		"look_bible": look, "lookBible": look,
		"look_parts": parsed["lookParts"], "lookParts": parsed["lookParts"],
		"style_bible": style, "styleBible": style,
		"identity_bible": identity, "identityBible": identity,
		"actionDigest": action, "groupSignature": group,
		"prompts": prompts, "modelUsed": model, "requestedModel": model,
		"modelSwitched": false, "triedModels": []string{model}, "rawOutput": text,
		"usage": usageOf(parsed), "usedActionIds": []any{}, "assetTrace": nil,
		"qualityChecks": []any{}, "usedAssetLibrary": false, "assemblySource": "model",
	})
}

func analyzePrompt(title, props string, shots int, extra string) string {
	return "你是商品买家秀分镜策划。只返回 JSON，字段包括 productFingerprint、productRole、masterScene、lookBible、styleBible、identityBible、actionDigest、prompts。" +
		"prompts 为长度 " + itoa(shots) + " 的数组，每项含 shot、prompt、shotType。" +
		"商品标题：" + title + "。商品属性：" + props + "。补充要求：" + extra + "。不要编造无法从标题确认的参数。"
}

func textField(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := data[key].(string); ok {
			return text
		}
	}
	return ""
}

func usageOf(data map[string]any) any {
	if usage, ok := data["usage"]; ok {
		return usage
	}
	return nil
}

func saveAnalysis(cfg config.Config, r *http.Request, title, fingerprint, model string, prompts []any) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	raw, _ := json.Marshal(prompts)
	if title == "" {
		title = "未命名商品"
	}
	_, _ = database.CreatePromptRecord(r.Context(), db, workspaceOf(r), database.PromptDraft{
		ProductTitle: title, Fingerprint: fingerprint, ModelUsed: model, StyleName: "📱 真实手机买家秀", PromptsJSON: string(raw),
	})
}
