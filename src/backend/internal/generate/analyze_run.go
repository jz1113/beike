package generate

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
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
	binding, bindingErr := loadWorkshopBinding(cfg, r, payload)
	if bindingErr != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": bindingErr.Error()})
		return
	}
	content := workshopAnalyzeContent(cfg, payload, binding, shotCount)
	messages := []any{map[string]any{"role": "user", "content": content}}
	text, data, status, err := ChatCompletionJSON(r.Context(), base, apiKey, model, messages, 0.4, 240*time.Second)
	if err != nil || status >= 300 || text == "" {
		message := "视觉分析失败"
		if err != nil {
			message = err.Error()
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": message})
		return
	}
	parsed := DecodeObject(text)
	if parsed == nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "视觉模型没有返回合法 JSON"})
		return
	}
	prompts, promptErr := finalizeWorkshopPrompts(parsed, binding, shotCount)
	if promptErr != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"error": promptErr.Error()})
		return
	}
	fingerprint := TextField(parsed, "productFingerprint", "product_fingerprint")
	role := TextField(parsed, "productRole", "product_role")
	scene := TextField(parsed, "masterScene", "master_scene")
	look := TextField(parsed, "lookBible", "look_bible")
	style := TextField(parsed, "styleBible", "style_bible")
	identity := TextField(parsed, "identityBible", "identity_bible")
	action := TextField(parsed, "actionDigest")
	saveAnalysis(cfg, r, title, fingerprint, model, prompts)
	var group any
	if scene != "" {
		group = map[string]any{"scene": scene, "actionDigest": action}
	}
	body := map[string]any{
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
		"usedActionIds": []any{}, "assetTrace": workshopTrace(binding),
		"qualityChecks": []any{}, "usedAssetLibrary": false, "assemblySource": "skill",
	}
	attachUsage(body, data)
	httpx.WriteJSON(w, http.StatusOK, body)
}

func TextField(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := data[key].(string); ok {
			return text
		}
	}
	return ""
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
	_, _ = dbcatalog.CreatePromptRecord(r.Context(), db, workspaceOf(r), dbcatalog.PromptDraft{
		ProductTitle: title, Fingerprint: fingerprint, ModelUsed: model, StyleName: "技能创作", PromptsJSON: string(raw),
	})
}
