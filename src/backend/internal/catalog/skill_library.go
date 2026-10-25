package catalog

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
)

func Skills(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeSkillError(w, http.StatusInternalServerError, "技能库加载失败")
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodGet {
			documents, err := dbcatalog.ListSkillDocuments(r.Context(), db, workspace)
			if err != nil {
				writeSkillError(w, 500, "技能库加载失败")
				return
			}
			page, err := dbcatalog.ListStyleRecipes(r.Context(), db, workspace, "", 1, 10000)
			if err != nil {
				writeSkillError(w, 500, "电商图文技能加载失败")
				return
			}
			items := []map[string]any{}
			for _, content := range documents {
				items = append(items, map[string]any{"kind": "assistant", "content": content})
			}
			for _, content := range page.Recipes {
				id, _ := content["id"].(string)
				version, err := dbcatalog.RememberSkillRevision(r.Context(), db, workspace, "workshop", id, content)
				if err != nil {
					writeSkillError(w, 500, "技能版本保存失败")
					return
				}
				content["libraryVersion"] = version
				items = append(items, map[string]any{"kind": "workshop", "content": content})
			}
			favorites, err := dbcatalog.SkillFavorites(r.Context(), db, workspace)
			if err != nil {
				writeSkillError(w, 500, "技能收藏加载失败")
				return
			}
			for _, item := range items {
				content := item["content"].(map[string]any)
				key := item["kind"].(string) + ":" + content["id"].(string)
				if favorite, exists := favorites[key]; exists {
					content["isFavorite"] = favorite
				}
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "skills": items, "hiddenOfficialRecipes": page.HiddenOfficialRecipes})
			return
		}
		if r.Method == http.MethodDelete {
			if err := dbcatalog.DeleteSkillDocument(r.Context(), db, workspace, r.URL.Query().Get("id"), r.URL.Query().Get("version")); err != nil {
				writeSkillError(w, 409, "技能已更新或删除，请刷新后重试")
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, (8<<20)+1))
		if err != nil || len(body) > 8<<20 {
			writeSkillError(w, 400, "技能内容过大或格式无效")
			return
		}
		var payload struct {
			Skill           map[string]any   `json:"skill"`
			Skills          []map[string]any `json:"skills"`
			ExpectedVersion string           `json:"expectedVersion"`
			Kind            string           `json:"kind"`
			ID              string           `json:"id"`
			IsFavorite      bool             `json:"isFavorite"`
		}
		if json.Unmarshal(body, &payload) != nil {
			writeSkillError(w, 400, "技能格式无效")
			return
		}
		if r.Method == http.MethodPost && r.URL.Query().Get("action") == "favorite" {
			if err := dbcatalog.SetSkillFavorite(r.Context(), db, workspace, payload.Kind, payload.ID, payload.IsFavorite); err != nil {
				writeSkillError(w, 400, "技能不存在或无法收藏")
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true})
			return
		}
		if r.Method == http.MethodPost && r.URL.Query().Get("action") == "import" {
			if len(payload.Skills) > 100 {
				writeSkillError(w, 400, "每次最多导入 100 个技能")
				return
			}
			for _, content := range payload.Skills {
				if !validAssistantSkill(content) {
					writeSkillError(w, 400, "导入技能缺少有效名称、正文或 ID")
					return
				}
			}
			if err := dbcatalog.ImportSkillDocuments(r.Context(), db, workspace, payload.Skills); err != nil {
				writeSkillError(w, 500, "技能导入失败，原件已保留")
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true})
			return
		}
		if !validAssistantSkill(payload.Skill) {
			writeSkillError(w, 400, "技能缺少有效名称、正文或 ID")
			return
		}
		content, err := dbcatalog.SaveSkillDocument(r.Context(), db, workspace, payload.Skill, payload.ExpectedVersion, r.Method == http.MethodPost)
		if err == dbcatalog.ErrSkillConflict {
			writeSkillError(w, 409, "技能已更新或 ID 已存在，请刷新后重试；编辑内容已保留")
			return
		}
		if err != nil {
			writeSkillError(w, 500, "技能保存失败，编辑内容已保留")
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "skill": content})
	})
}

func validAssistantSkill(content map[string]any) bool {
	for _, key := range []string{"id", "name", "prompt"} {
		text, ok := content[key].(string)
		if !ok || strings.TrimSpace(text) == "" || len(text) > 4<<20 {
			return false
		}
	}
	id, _ := content["id"].(string)
	if len(id) > 200 || content["isBuiltin"] == true {
		return false
	}
	// Preserve packages and metadata verbatim; optional runtime declarations must
	// retain their types instead of becoming malformed tool permissions.
	for _, key := range []string{"tools", "requires"} {
		if value, exists := content[key]; exists && value != nil {
			list, ok := value.([]any)
			if !ok {
				return false
			}
			for _, value := range list {
				if _, ok := value.(string); !ok {
					return false
				}
			}
		}
	}
	return validSkillPackage(content)
}

func writeSkillError(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
}
