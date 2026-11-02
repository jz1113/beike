package sales

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func promptStorageFailure(w http.ResponseWriter, err error) {
	log.Printf("[sales-prompts] storage error: %v", err)
	httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "提示词读取或保存失败，请确认数据库迁移已完成后重试；本次操作未执行", "code": "sales_prompt_storage"})
}

func Prompts(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		items, err := loadSalesPrompts(r.Context(), cfg, httpx.WorkspaceFrom(r))
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompts": items})
	}
}

func PromptByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		d, found := findPromptDefinition(r.PathValue("id"))
		if !found {
			httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "提示词不存在"})
			return
		}
		var body struct {
			Prompt          json.RawMessage `json:"prompt"`
			ExpectedVersion string          `json:"expectedVersion"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || len(body.Prompt) == 0 || strings.TrimSpace(body.ExpectedVersion) == "" || len(body.ExpectedVersion) > 200 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请提供提示词与当前版本；恢复默认时将 prompt 设为 null"})
			return
		}
		var text *string
		if !bytes.Equal(bytes.TrimSpace(body.Prompt), []byte("null")) {
			var value string
			if json.Unmarshal(body.Prompt, &value) != nil || strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > 60000 {
				httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "提示词需为 1—60000 字的文本"})
				return
			}
			text = &value
		}
		item, err := saveSalesPrompt(r.Context(), cfg, httpx.WorkspaceFrom(r), d, text, body.ExpectedVersion)
		if errors.Is(err, errPromptConflict) {
			httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": "提示词已在其他页面更新，请重新加载后再保存", "prompt": item})
			return
		}
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompt": item})
	}
}
