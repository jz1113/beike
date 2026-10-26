package sales

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

type finalPrompt struct {
	ShotID int    `json:"shotId"`
	Prompt string `json:"prompt"`
}

// Finalize writes one video prompt from the pictures that were actually generated.
func Finalize(cfg config.Config) http.Handler {
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
		if err := checkFashionCategory(payload); err != nil {
			workflowError(w, 400, err)
			return
		}
		handleWorkflowFinalize(w, r, cfg, payload)
	})
}

func shotsHaveImages(shots []ScriptShot, catalog []CatalogImage) error {
	valid := map[int]bool{}
	for _, image := range catalog {
		valid[image.Index] = true
	}
	for _, shot := range shots {
		if !valid[shot.ImageIndex] {
			return fmt.Errorf("镜头 %d 没有有效参考图", shot.ShotId)
		}
	}
	return nil
}
