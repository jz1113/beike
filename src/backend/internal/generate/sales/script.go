package sales

import (
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// ScriptShot matches frontend shot contract
type ScriptShot struct {
	ShotId          int               `json:"shotId"`
	Type            string            `json:"type"`
	Duration        int               `json:"duration"`
	Description     string            `json:"description"`
	Camera          string            `json:"camera"`
	VisualSource    string            `json:"visualSource"`
	Transition      string            `json:"transition"`
	Voiceover       string            `json:"voiceover"`
	SpeechMode      string            `json:"speechMode,omitempty"`
	Prompt          string            `json:"prompt,omitempty"`
	ImageIndex      int               `json:"imageIndex"`
	SelectionReason string            `json:"selectionReason,omitempty"`
	Motion          string            `json:"motion,omitempty"`
	TextOverlay     map[string]string `json:"textOverlay,omitempty"`
}

// ScriptSEO matches frontend seo contract
type ScriptSEO struct {
	Title            string   `json:"title"`
	Hashtags         []string `json:"hashtags"`
	CoverText        string   `json:"coverText"`
	InteractionGuide string   `json:"interactionGuide"`
	Description      string   `json:"description"`
}

// SalesScript represents a full script with shots
type SalesScript struct {
	ID            string         `json:"id"`
	Title         string         `json:"title"`
	Beat          string         `json:"beat,omitempty"`
	FullPrompt    string         `json:"fullPrompt,omitempty"`
	TotalDuration int            `json:"totalDuration"`
	Shots         []ScriptShot   `json:"shots"`
	SEO           ScriptSEO      `json:"seo"`
	DeliveryMode  string         `json:"deliveryMode,omitempty"`
	Assets        []PlannedAsset `json:"assets,omitempty"`
}

// Script handles e-commerce short video script generation
func Script(cfg config.Config) http.Handler {
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
		handleWorkflowScript(w, r, cfg, payload)
	})
}
