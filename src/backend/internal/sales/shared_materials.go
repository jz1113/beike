package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

// Only reusable asset records are published. Draft scripts, task receipts,
// production presets and workspace settings are outside this catalog.
type sharedMaterialSpec struct {
	table, name, columns, filter string
}

var sharedMaterialSpecs = map[string]sharedMaterialSpec{
	"persona": {"PersonaAsset", "name", "name,description,tags,avatarUrl,sourceImages,reversePrompt,dimensions", "1"},
	"scene":   {"SceneAsset", "title", "title,description,lighting,category,spatialType,suitableCategories,tags,coverUrl,sourceImages,reversePrompt,dimensions", "1"},
	"action":  {"ActionAsset", "title", "title,action,shotType,spatialType,camera,tags,coverUrl,sourceImages,reversePrompt,dimensions,mediaType,mediaUrl,sourceUrl", "1"},
	"voice":   {"AvatarVoice", "name", "name,type,status,audioUrl,promptText,sampleAudioUrl,voiceId,gender,tags", "status=1"},
	"bgm":     {"SalesProductionPreset", "name", "name,category,configJson", "category='studio_bgm_asset'"},
	"script":  {"SalesReferenceScript", "title", "title,videoUrl,videoHash,durationSec,format,voiceMode,status,scriptJson,model,promptVersion,depthVideoUrl", "status='verified'"},
}

const sharedSource = "workspaceId <> ? AND workspaceId IN (SELECT workspaceId FROM WorkspaceLibraryPreferences WHERE sharingEnabled=1) AND workspaceId NOT IN ('official','legacy','') AND id NOT GLOB 'sharedcopy_*'"

func SharedMaterials(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"error": "共享素材库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		prefs, err := readLibraryPreferences(r.Context(), db, workspace)
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"error": "无法读取共享设置"})
			return
		}
		if !prefs.SharingEnabled {
			httpx.WriteJSON(w, 403, map[string]any{"error": "当前工作区尚未开启跨工作区共享"})
			return
		}
		if r.Method == http.MethodGet {
			listSharedMaterials(w, r, db, workspace)
			return
		}
		var body struct{ Kind, ID string }
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil {
			httpx.WriteJSON(w, 400, map[string]any{"error": "导入请求格式错误"})
			return
		}
		spec, ok := sharedMaterialSpecs[body.Kind]
		if !ok || body.ID == "" {
			httpx.WriteJSON(w, 400, map[string]any{"error": "请选择有效的共享素材"})
			return
		}
		id, err := importSharedMaterial(r.Context(), db, spec, workspace, body.ID)
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, 404, map[string]any{"error": "素材已移除或不可共享"})
			return
		}
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"error": "无法导入素材，请检查来源媒体是否仍可读取，然后重试"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "id": id})
	}
}

type sharedEntry struct {
	Kind       string `json:"kind"`
	ID         string `json:"id"`
	Name       string `json:"name"`
	ImportedID string `json:"importedId,omitempty"`
}

func sharedCopyID(workspace, table, id string) string {
	return fmt.Sprintf("sharedcopy_%x", sha256.Sum256([]byte(workspace+"\x00"+table+"\x00"+id)))
}

// Check only the visible page, using primary-key lookups grouped by asset table.
func markImported(ctx context.Context, db *sql.DB, workspace string, items []sharedEntry) error {
	for kind, spec := range sharedMaterialSpecs {
		positions := map[string]int{}
		args := []any{workspace}
		for i, item := range items {
			if item.Kind != kind {
				continue
			}
			id := sharedCopyID(workspace, spec.table, item.ID)
			positions[id] = i
			args = append(args, id)
		}
		if len(positions) == 0 {
			continue
		}
		marks := strings.TrimSuffix(strings.Repeat("?,", len(positions)), ",")
		rows, err := db.QueryContext(ctx, "SELECT id FROM "+spec.table+" WHERE workspaceId=? AND id IN ("+marks+")", args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			items[positions[id]].ImportedID = id
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func listSharedMaterials(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string) {
	q := r.URL.Query()
	var selects []string
	var args []any
	for kind, spec := range sharedMaterialSpecs {
		if q.Get("kind") != "" && q.Get("kind") != kind {
			continue
		}
		selects = append(selects, fmt.Sprintf("SELECT '%s' AS kind,id,%s AS name,updatedAt FROM %s WHERE %s AND %s AND instr(lower(%s), lower(?))>0", kind, spec.name, spec.table, sharedSource, spec.filter, spec.name))
		args = append(args, workspace, strings.TrimSpace(q.Get("q")))
	}
	offset, _ := strconv.Atoi(q.Get("offset"))
	if len(selects) == 0 || offset < 0 {
		httpx.WriteJSON(w, 400, map[string]any{"error": "共享素材筛选条件无效"})
		return
	}
	rows, err := db.QueryContext(r.Context(), strings.Join(selects, " UNION ALL ")+" ORDER BY updatedAt DESC,kind,id LIMIT 51 OFFSET ?", append(args, offset)...)
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"error": "无法读取共享目录"})
		return
	}
	defer rows.Close()
	items := []sharedEntry{}
	for rows.Next() {
		var item sharedEntry
		var updated any
		if err = rows.Scan(&item.Kind, &item.ID, &item.Name, &updated); err != nil {
			break
		}
		items = append(items, item)
	}
	if err != nil || rows.Err() != nil {
		httpx.WriteJSON(w, 500, map[string]any{"error": "无法读取共享目录"})
		return
	}
	more := len(items) > 50
	if more {
		items = items[:50]
	}
	if err := markImported(r.Context(), db, workspace, items); err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"error": "无法核对已加入的素材"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "items": items, "more": more})
}

func importSharedMaterial(ctx context.Context, db *sql.DB, spec sharedMaterialSpec, workspace, sourceID string) (string, error) {
	id := sharedCopyID(workspace, spec.table, sourceID)
	var existing string
	err := db.QueryRowContext(ctx, "SELECT id FROM "+spec.table+" WHERE id=? AND workspaceId=?", id, workspace).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	fields := strings.Split(spec.columns, ",")
	values := make([]any, len(fields))
	var owner string
	scan := []any{&owner}
	for i := range values {
		scan = append(scan, &values[i])
	}
	err = db.QueryRowContext(ctx, "SELECT workspaceId,"+spec.columns+" FROM "+spec.table+" WHERE "+sharedSource+" AND "+spec.filter+" AND id=?", workspace, sourceID).Scan(scan...)
	if err != nil {
		return "", err
	}
	media := newSharedMediaCopy(owner, workspace)
	defer media.cleanup()
	for i, name := range fields {
		raw, ok := values[i].(string)
		if !ok || raw == "" {
			continue
		}
		switch name {
		case "avatarUrl", "coverUrl", "audioUrl", "sampleAudioUrl", "videoUrl", "depthVideoUrl", "mediaUrl", "sourceUrl":
			values[i], err = media.url(raw)
		case "sourceImages", "dimensions", "configJson", "scriptJson":
			values[i], err = media.rewriteJSON(name, raw)
		}
		if err != nil {
			return "", err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	values = append(values, id, workspace, now, now)
	cols := spec.columns + ",id,workspaceId,createdAt,updatedAt"
	marks := strings.TrimSuffix(strings.Repeat("?,", len(values)), ",")
	// Recheck both memberships when committing. Either workspace may have opted out while media were copied.
	result, err := db.ExecContext(ctx, "INSERT INTO "+spec.table+" ("+cols+") SELECT "+marks+" WHERE (SELECT COUNT(*) FROM WorkspaceLibraryPreferences WHERE sharingEnabled=1 AND workspaceId IN (?,?))=2 ON CONFLICT(id) DO NOTHING", append(values, owner, workspace)...)
	if err != nil {
		return "", err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return "", err
	}
	if count == 1 {
		media.keep = true
	} else {
		err = db.QueryRowContext(ctx, "SELECT id FROM "+spec.table+" WHERE id=? AND workspaceId=?", id, workspace).Scan(&existing)
	}
	return id, err
}

// Copies have their own workspace paths so every existing consumer (including
// local FFmpeg and generation) can keep its normal workspace access checks.
type sharedMediaCopy struct {
	owner, prefix string
	dir           string
	keep          bool
	copied        map[string]string
}

func newSharedMediaCopy(owner, target string) *sharedMediaCopy {
	return &sharedMediaCopy{owner: owner, prefix: path.Join(target, "shared-materials", httpx.RequestID()), copied: map[string]string{}}
}
func (m *sharedMediaCopy) cleanup() {
	if m.dir != "" && !m.keep {
		_ = os.RemoveAll(m.dir)
	}
}
func (m *sharedMediaCopy) url(raw string) (string, error) {
	if !strings.HasPrefix(raw, "/storage/") {
		return raw, nil
	}
	if value, ok := m.copied[raw]; ok {
		return value, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	rel := strings.TrimPrefix(u.Path, "/storage/")
	if path.Clean(rel) != rel || strings.Contains(rel, "\\") || !storage.WorkspaceRel(rel, m.owner, true) {
		return "", errors.New("invalid media owner or path")
	}
	ext := strings.ToLower(path.Ext(rel))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".mp4", ".mov", ".webm", ".mp3", ".m4a", ".ogg", ".opus", ".aac", ".flac", ".wav":
	default:
		return "", errors.New("unsupported shared file")
	}
	// Confine symlink resolution to the owner's subtree as well as checking the URL.
	within := strings.TrimPrefix(rel, m.owner+"/")
	subroot := m.owner
	if within == rel { // Unprefixed local assets from older installations.
		if m.owner != "local" || !strings.HasPrefix(rel, "azhuo/") {
			return "", errors.New("unowned legacy file")
		}
		subroot = "azhuo"
		within = strings.TrimPrefix(rel, "azhuo/")
	}
	var in *os.File
	for _, root := range []string{storage.ResolveRoot(), ".azhuo_storage"} {
		in, err = os.OpenInRoot(filepath.Join(root, subroot), within)
		if err == nil {
			break
		}
	}
	if err != nil {
		return "", err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("shared media missing")
	}
	m.dir = storage.SafeWithin(storage.ResolveRoot(), m.prefix)
	if m.dir == "" {
		return "", errors.New("invalid destination")
	}
	if err = os.MkdirAll(m.dir, 0700); err != nil {
		return "", err
	}
	name := fmt.Sprintf("%x%s", sha256.Sum256([]byte(rel)), ext)
	out, err := os.OpenFile(filepath.Join(m.dir, name), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	value := "/storage/" + path.Join(m.prefix, name)
	m.copied[raw] = value
	return value, nil
}
func (m *sharedMediaCopy) rewriteJSON(field, raw string) (string, error) {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		if field == "dimensions" {
			return "", nil
		}
		return "", err
	}
	if obj, ok := value.(map[string]any); ok {
		switch field {
		case "scriptJson":
			delete(obj, "taxonomy") // Category and style IDs belong to the source workspace.
		case "dimensions":
			delete(obj, "salesAssetViewJobId")
			delete(obj, "salesImageImportKey")
			delete(obj, "defaultVoiceId") // The target can assign its own voice.
		}
	}
	var rewrite func(any) (any, error)
	rewrite = func(v any) (any, error) {
		switch node := v.(type) {
		case string:
			return m.url(node)
		case map[string]any:
			for key, child := range node {
				next, err := rewrite(child)
				if err != nil {
					return nil, err
				}
				node[key] = next
			}
		case []any:
			for i, child := range node {
				next, err := rewrite(child)
				if err != nil {
					return nil, err
				}
				node[i] = next
			}
		}
		return v, nil
	}
	value, err := rewrite(value)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}
