package library

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func deconstructRequestHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil || !json.Valid(body) {
			writeDeconstructFailure(w, "请求数据格式异常")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeDeconstructFailure(w, "请求数据格式异常")
			return
		}
		majorID := ""
		if category := deconstructCategoryValue(payload); category != "" {
			var err error
			majorID, err = resolveMajorCategory(cfg, r, category)
			if err != nil {
				writeDeconstructFailure(w, "服务器内部错误")
				return
			}
			if majorID == "" {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "所选商品大类不存在，请重新选择或使用自动识别"})
				return
			}
		}
		if message, failed := deconstructSubcategoryError(cfg, r, payload, majorID); failed {
			writeDeconstructFailure(w, "服务器内部错误")
			return
		} else if message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": message})
			return
		}
		if deconstructUnsafeBase(cfg, r, payload) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false,
				"error":   "当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。",
				"code":    "gateway_base_url",
			})
			return
		}
		images, _ := payload["imageUrls"].([]any)
		if len(images) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请至少提供 1 张参考风格或买家秀图片"})
			return
		}
		fullPrompt, _ := payload["fullPromptOnly"].(bool)
		review, _ := payload["reviewBeforeSave"].(bool)
		if fullPrompt && (len(images) != 4 || !review) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "衍生母本须由完整四图组先提炼候选，再确认入库"})
			return
		}
		if len(images) > 1 && len(images) < 4 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "图组母本必须恰好 4 张；当前不足 4 张，不会反推或入库", "code": "INCOMPLETE_CONTENT_GROUP"})
			return
		}
		if !deconstructHasKey(cfg, r, payload) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "系统尚未配置 AI 视觉接口密钥，请在设置中填入"})
			return
		}
		if !deconstructVisionReady(payload) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请先在设置中配置支持图像输入的多模态模型"})
			return
		}
		status, response := executeDeconstruct(cfg, r, payload, deconstructHooks{})
		httpx.WriteJSON(w, status, response)
	}
}

func writeDeconstructFailure(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": message, "code": "internal_error"})
}

func deconstructCategoryValue(payload map[string]any) string {
	value, _ := payload["targetCategory"].(string)
	if strings.TrimSpace(value) == "" {
		value, _ = payload["category"].(string)
	}
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" || normalized == "unknown" || normalized == "all" {
		return ""
	}
	if normalized == "digital" || normalized == "phone" {
		return "digital_3c"
	}
	return normalized
}

func resolveMajorCategory(cfg config.Config, r *http.Request, category string) (string, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	rows, err := db.QueryContext(r.Context(), `
		SELECT "id", "name", "aliases" FROM "AssetProductCategory"
		WHERE "workspaceId" = ? AND "parentId" IS NULL AND "isArchived" = 0`, httpx.WorkspaceFrom(r))
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var aliases sql.NullString
		if err := rows.Scan(&id, &name, &aliases); err != nil {
			return "", err
		}
		if strings.ToLower(id) == category || strings.ToLower(name) == category || aliasMatches(aliases.String, category) {
			return id, nil
		}
	}
	return "", rows.Err()
}

func deconstructSubcategoryError(cfg config.Config, r *http.Request, payload map[string]any, majorID string) (string, bool) {
	value, exists := payload["targetSubcategory"]
	if !exists || value == nil {
		return "", false
	}
	text, ok := value.(string)
	if !ok {
		return "商品细分文件夹无效，请重新选择", false
	}
	selected := strings.TrimSpace(text)
	if selected == "" {
		return "", false
	}
	if majorID == "" {
		return "请先选择商品大类，再指定细分文件夹", false
	}
	folderID := selected
	switch selected {
	case "phone", "case", "earphone", "tablet":
		folderID = "prompt_subcategory:digital_3c:" + selected
	}
	if !strings.HasPrefix(folderID, "prompt_subcategory:") {
		return "请选择资产库中的商品细分文件夹", false
	}
	parent, archived, found, err := subcategoryFolder(cfg, r, folderID)
	if err != nil {
		return "", true
	}
	builtin := digitalBuiltinFolder(majorID, selected, folderID)
	if found {
		if parent != majorID || archived {
			return "所选细分文件夹不存在、已删除或不属于当前商品大类，请重新选择", false
		}
		return "", false
	}
	if !builtin {
		return "所选细分文件夹不存在、已删除或不属于当前商品大类，请重新选择", false
	}
	return "", false
}

func digitalBuiltinFolder(majorID, selected, folderID string) bool {
	if majorID != "digital_3c" {
		return false
	}
	for _, name := range []string{"phone", "case", "earphone", "tablet"} {
		if selected == name || folderID == "prompt_subcategory:digital_3c:"+name {
			return true
		}
	}
	return false
}

func subcategoryFolder(cfg config.Config, r *http.Request, folderID string) (string, bool, bool, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return "", false, false, err
	}
	defer db.Close()
	var parent sql.NullString
	var archived sql.NullInt64
	err = db.QueryRowContext(r.Context(), `
		SELECT "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" = ?`, folderID, httpx.WorkspaceFrom(r)).Scan(&parent, &archived)
	if err == sql.ErrNoRows {
		return "", false, false, nil
	}
	if err != nil {
		return "", false, false, err
	}
	return parent.String, archived.Int64 != 0, true, nil
}

func aliasMatches(raw, category string) bool {
	var words []string
	if json.Unmarshal([]byte(raw), &words) != nil {
		return false
	}
	for _, word := range words {
		if strings.ToLower(strings.TrimSpace(word)) == category {
			return true
		}
	}
	return false
}

func deconstructUnsafeBase(cfg config.Config, r *http.Request, payload map[string]any) bool {
	base, _ := payload["customBaseUrl"].(string)
	base = strings.TrimSpace(base)
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if base == "" {
		return false
	}
	format, _ := payload["apiFormat"].(string)
	allowHTTP, _ := payload["allowInsecureHttp"].(bool)
	return !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(base) && !(format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(base))
}

func deconstructVisionReady(payload map[string]any) bool {
	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	format, _ := payload["apiFormat"].(string)
	if model == "" {
		return true
	}
	if format == "openai-responses" || strings.HasPrefix(model, "deepseek-official:") {
		return visionCapable(model)
	}
	return true
}

func visionCapable(model string) bool {
	if strings.HasPrefix(model, "deepseek-official:") {
		return strings.TrimPrefix(model, "deepseek-official:") == "deepseek-flash"
	}
	lower := strings.ToLower(model)
	if strings.Contains(lower, "embedding") || strings.Contains(lower, "embed") || strings.Contains(lower, "whisper") || strings.Contains(lower, "tts") || strings.Contains(lower, "suno") || strings.Contains(lower, "rerank") {
		return false
	}
	if strings.Contains(lower, "deepseek") && !strings.Contains(lower, "vl") {
		return false
	}
	return strings.Contains(lower, "vision") || strings.Contains(lower, "gemini") || strings.Contains(lower, "claude") || strings.Contains(lower, "grok") || strings.Contains(lower, "4o") || strings.Contains(lower, "qwen-vl") || strings.Contains(lower, "luna") || strings.Contains(lower, "gpt-4") || strings.Contains(lower, "gpt-5")
}

func deconstructHasKey(cfg config.Config, r *http.Request, payload map[string]any) bool {
	key, _ := payload["customApiKey"].(string)
	if strings.TrimSpace(key) != "" || strings.TrimSpace(r.Header.Get("x-custom-api-key")) != "" {
		return true
	}
	if cfg.Production() {
		return false
	}
	return strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY")) != "" || strings.TrimSpace(os.Getenv("AI_API_KEY")) != ""
}
