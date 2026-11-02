package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type studioPersona struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Description       string   `json:"description"`
	Tags              string   `json:"tags"`
	Dimensions        string   `json:"dimensions,omitempty"`
	IdentityURL       string   `json:"identityUrl,omitempty"`
	AvatarURL         string   `json:"avatarUrl"`
	FullBodyURL       string   `json:"fullBodyUrl"`
	FaceURL           string   `json:"faceUrl"`
	SourceImages      []string `json:"sourceImages"`
	HasReferenceImage bool     `json:"hasReferenceImage"`
	Source            string   `json:"source"`
	DefaultVoiceID    string   `json:"defaultVoiceId,omitempty"`
}

type studioScene struct {
	Dimensions         string   `json:"dimensions,omitempty"`
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Lighting           string   `json:"lighting"`
	Category           string   `json:"category"`
	SpatialType        string   `json:"spatialType"`
	Tags               string   `json:"tags"`
	SuitableCategories []string `json:"suitableCategories"`
	CoverURL           string   `json:"coverUrl"`
	SourceImages       []string `json:"sourceImages"`
	Source             string   `json:"source"`
}

type studioVoice struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	VoiceID        string   `json:"voiceId"`
	TtsVoice       string   `json:"ttsVoice"`
	Gender         string   `json:"gender"`
	VoiceGroup     string   `json:"voiceGroup,omitempty"`
	Tags           []string `json:"tags"`
	SampleAudioURL string   `json:"sampleAudioUrl"`
	PromptText     string   `json:"promptText"`
	Source         string   `json:"source"`
}

type storedPreset struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Category  string         `json:"category"`
	Config    map[string]any `json:"config"`
	IsDefault bool           `json:"isDefault"`
	CreatedAt string         `json:"createdAt"`
	UpdatedAt string         `json:"updatedAt"`
}

func StudioAssets(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "资产库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		ctx := r.Context()
		assets, err := readStudioAssets(ctx, db, workspace)
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取素材资产库失败，请重试；当前素材选择已保留"})
			return
		}
		httpx.WriteJSON(w, 200, assets)
	}
}

func parseSourceImageList(raw, primary string) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(u string) {
		trimmed := strings.TrimSpace(u)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			out = append(out, trimmed)
		}
	}
	var parsed []string
	if strings.TrimSpace(raw) != "" && json.Unmarshal([]byte(raw), &parsed) == nil {
		for _, item := range parsed {
			add(item)
		}
	}
	add(primary)
	return out
}

func queryStudioPersonas(ctx context.Context, db *sql.DB, workspace string) ([]studioPersona, error) {
	out := []studioPersona{}
	seen := map[string]bool{}
	scanRow := func(id, name, desc, tags, avatar, sources, dims string) {
		if strings.TrimSpace(name) == "" || seen[id] {
			return
		}
		seen[id] = true
		imgs := parseSourceImageList(sources, avatar)
		face := strings.TrimSpace(avatar)
		if face == "" && len(imgs) > 0 {
			face = imgs[0]
		}
		fullBody := face
		for _, candidate := range imgs {
			if candidate != face {
				fullBody = candidate
				break
			}
		}
		if fullBody == "" && len(imgs) > 0 {
			fullBody = imgs[0]
		}
		face, fullBody, voice := studioPersonaAnchors(dims, imgs, face, fullBody)
		out = append(out, studioPersona{
			DefaultVoiceID: voice,
			ID:             id, Name: name, Description: desc, Tags: tags, Dimensions: strings.TrimSpace(dims),
			IdentityURL: studioPersonaIdentityURL(dims, imgs, avatar),
			AvatarURL:   face, FullBodyURL: fullBody, FaceURL: face, SourceImages: imgs,
			HasReferenceImage: len(imgs) > 0, Source: "persona_library",
		})
	}
	rows, err := db.QueryContext(ctx, `SELECT "id","name","description","tags",COALESCE("avatarUrl",''),COALESCE("sourceImages",''),COALESCE("dimensions",'') FROM "PersonaAsset" WHERE "workspaceId" = ? ORDER BY "isFavorite" DESC,"usageCount" DESC,"createdAt" DESC`, workspace)
	legacy := false
	if err != nil {
		rows, err = db.QueryContext(ctx, `SELECT "id","name","description","tags",COALESCE("avatarUrl",''),COALESCE("sourceImages",'') FROM "PersonaAsset" WHERE "workspaceId" = ? ORDER BY "isFavorite" DESC,"usageCount" DESC,"createdAt" DESC`, workspace)
		legacy = true
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, desc, tags, avatar, sources, dims string
		values := []any{&id, &name, &desc, &tags, &avatar, &sources}
		if !legacy {
			values = append(values, &dims)
		}
		if err := rows.Scan(values...); err != nil {
			return nil, err
		}
		scanRow(id, name, desc, tags, avatar, sources, dims)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	avatars, err := db.QueryContext(ctx, `SELECT "id","name","description",COALESCE("coverUrl",'') FROM "AvatarCharacter" WHERE "workspaceId" = ? AND "status"=1 ORDER BY "createdAt" DESC`, workspace)
	if err != nil {
		return nil, err
	}
	defer avatars.Close()
	for avatars.Next() {
		var id, name, desc, cover string
		if err := avatars.Scan(&id, &name, &desc, &cover); err != nil {
			return nil, err
		}
		if strings.TrimSpace(name) == "" || seen[id] {
			continue
		}
		seen[id] = true
		trimmedCover := strings.TrimSpace(cover)
		imgs := []string{}
		if trimmedCover != "" {
			imgs = []string{trimmedCover}
		}
		out = append(out, studioPersona{
			ID: id, Name: name, Description: desc, Tags: "数字人主播",
			IdentityURL: trimmedCover,
			AvatarURL:   trimmedCover, FullBodyURL: trimmedCover, FaceURL: trimmedCover, SourceImages: imgs,
			HasReferenceImage: trimmedCover != "", Source: "avatar_preset",
		})
	}
	return out, avatars.Err()
}

func queryStudioScenes(ctx context.Context, db *sql.DB, workspace string) ([]studioScene, error) {
	out := []studioScene{}
	seen := map[string]bool{}
	rows, err := db.QueryContext(ctx, `SELECT "id","title","description","lighting","category","spatialType",COALESCE("tags",''),COALESCE("suitableCategories",'[]'),COALESCE("coverUrl",''),COALESCE("sourceImages",''),COALESCE("dimensions",'') FROM "SceneAsset" WHERE "workspaceId" = ? ORDER BY "isFavorite" DESC,"usageCount" DESC,"createdAt" DESC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item studioScene
		var rawCats, rawSources string
		if err := rows.Scan(&item.ID, &item.Title, &item.Description, &item.Lighting, &item.Category, &item.SpatialType, &item.Tags, &rawCats, &item.CoverURL, &rawSources, &item.Dimensions); err != nil {
			return nil, err
		}
		if strings.TrimSpace(item.Title) == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		_ = json.Unmarshal([]byte(rawCats), &item.SuitableCategories)
		if item.SuitableCategories == nil {
			item.SuitableCategories = []string{}
		}
		item.SourceImages = parseSourceImageList(rawSources, item.CoverURL)
		if item.CoverURL == "" && len(item.SourceImages) > 0 {
			item.CoverURL = item.SourceImages[0]
		}
		item.Source = "scene_library"
		out = append(out, item)
	}
	return out, rows.Err()
}

func resolveTtsVoice(voiceID, gender string, tags []string) string {
	joined := strings.Join(tags, ",")
	switch voiceID {
	case "preset_voice_01", "v1":
		return "male-qn-jingying"
	case "preset_voice_02":
		return "male-qn-badao"
	case "preset_voice_03":
		return "female-yujie"
	case "preset_voice_04":
		return "female-shaonv"
	case "preset_voice_05":
		return "female-tianmei"
	}
	if trimmed := strings.TrimSpace(voiceID); trimmed != "" {
		return trimmed
	}
	if gender == "male" {
		return "male-qn-jingying"
	}
	if strings.Contains(joined, "热情") || strings.Contains(joined, "种草") {
		return "female-shaonv"
	}
	return "zh-female-commercial"
}

func queryStudioVoices(ctx context.Context, db *sql.DB, workspace string) ([]studioVoice, error) {
	out := []studioVoice{}
	rows, err := db.QueryContext(ctx, `SELECT "id","name","voiceId","gender",COALESCE("tags",'[]'),COALESCE("sampleAudioUrl",''),COALESCE("promptText",'') FROM "AvatarVoice" WHERE "workspaceId" = ? AND "status"=1 ORDER BY "createdAt" DESC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item studioVoice
		var rawTags string
		if err := rows.Scan(&item.ID, &item.Name, &item.VoiceID, &item.Gender, &rawTags, &item.SampleAudioURL, &item.PromptText); err != nil {
			return nil, err
		}
		if strings.TrimSpace(item.Name) != "" {
			_ = json.Unmarshal([]byte(rawTags), &item.Tags)
			if item.Tags == nil {
				item.Tags = []string{}
			}
			item.VoiceGroup = normalizeVoiceGroup(item.Gender, "", item.Tags, item.Name, item.PromptText)
			item.TtsVoice = resolveTtsVoice(item.VoiceID, item.Gender, item.Tags)
			item.Source = "voice_library"
			out = append(out, item)
		}
	}
	return out, rows.Err()
}

func Presets(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "生产预设存储不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodGet {
			rows, qErr := db.QueryContext(r.Context(), `SELECT "id","name","category","configJson","isDefault","createdAt","updatedAt" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"<>? ORDER BY "isDefault" DESC,"updatedAt" DESC LIMIT 60`, workspace, customBgmPresetCategory)
			if qErr != nil {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取生产预设失败"})
				return
			}
			defer rows.Close()
			items := []storedPreset{}
			for rows.Next() {
				var item storedPreset
				var raw string
				var def int
				if rows.Scan(&item.ID, &item.Name, &item.Category, &raw, &def, &item.CreatedAt, &item.UpdatedAt) == nil {
					item.IsDefault = def != 0
					_ = json.Unmarshal([]byte(raw), &item.Config)
					if item.Config == nil {
						item.Config = map[string]any{}
					}
					items = append(items, item)
				}
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "items": items})
			return
		}
		if r.Method != http.MethodPost {
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
			return
		}
		var body struct {
			ID        string         `json:"id"`
			Name      string         `json:"name"`
			Category  string         `json:"category"`
			Config    map[string]any `json:"config"`
			IsDefault bool           `json:"isDefault"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || strings.TrimSpace(body.Name) == "" || body.Config == nil {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "预设名称与配置不能为空"})
			return
		}
		name := strings.TrimSpace(body.Name)
		if len([]rune(name)) > 80 {
			name = string([]rune(name)[:80])
		}
		cat := strings.TrimSpace(body.Category)
		if cat == "" {
			cat = "all"
		}
		if cat == customBgmPresetCategory {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "配乐资产请在素材库中管理"})
			return
		}
		id := strings.TrimSpace(body.ID)
		if id == "" {
			id = "preset_" + httpx.RequestID()
		}
		now := time.Now().UTC().Format(time.RFC3339)
		item, err := saveProductionPreset(r.Context(), db, workspace, storedPreset{ID: id, Name: name, Category: cat, Config: body.Config, IsDefault: body.IsDefault, CreatedAt: now, UpdatedAt: now})
		if errors.Is(err, errPresetConflict) {
			httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": err.Error()})
			return
		}
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存生产预设失败"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": item})
	}
}

func PresetByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" || r.Method != http.MethodDelete {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "无效的预设删除请求"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "生产预设存储不可用"})
			return
		}
		defer db.Close()
		if _, err := db.ExecContext(r.Context(), `DELETE FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "id"=? AND "category"<>?`, httpx.WorkspaceFrom(r), id, customBgmPresetCategory); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "删除生产预设失败"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true})
	}
}
