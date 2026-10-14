package library

import (
	"encoding/json"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func serveLibraryExport(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	exported, err := database.ExportLibrary(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	scenes := emptyItems(exported.Scenes)
	outfits := emptyItems(exported.Outfits)
	actions := emptyItems(exported.Actions)
	personas := emptyItems(exported.Personas)
	prompts := emptyItems(exported.FullPrompts)
	categories := emptyItems(exported.Categories)
	albums := emptyItems(exported.Albums)
	registries := emptyItems(exported.Registries)
	replacements := emptyItems(exported.Replacements)
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success                     bool              `json:"success"`
		Complete                    bool              `json:"complete"`
		MediaIncluded               bool              `json:"mediaIncluded"`
		Scenes                      []json.RawMessage `json:"scenes"`
		Outfits                     []json.RawMessage `json:"outfits"`
		Actions                     []json.RawMessage `json:"actions"`
		Personas                    []json.RawMessage `json:"personas"`
		FullPrompts                 []json.RawMessage `json:"fullPrompts"`
		ProductCategories           []json.RawMessage `json:"productCategories"`
		Albums                      []json.RawMessage `json:"albums"`
		PromptAssetRegistries       []json.RawMessage `json:"promptAssetRegistries"`
		FullPromptImageReplacements []json.RawMessage `json:"fullPromptImageReplacements"`
		Counts                      exportCounts      `json:"counts"`
	}{
		true, true, false, scenes, outfits, actions, personas, prompts, categories, albums, registries, replacements,
		exportCounts{len(scenes), len(outfits), len(actions), len(personas), len(prompts), len(categories), len(albums), len(registries), len(replacements)},
	})
}

type exportCounts struct {
	Scenes                      int `json:"scenes"`
	Outfits                     int `json:"outfits"`
	Actions                     int `json:"actions"`
	Personas                    int `json:"personas"`
	FullPrompts                 int `json:"fullPrompts"`
	ProductCategories           int `json:"productCategories"`
	Albums                      int `json:"albums"`
	PromptAssetRegistries       int `json:"promptAssetRegistries"`
	FullPromptImageReplacements int `json:"fullPromptImageReplacements"`
}
