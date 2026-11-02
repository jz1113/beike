package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
)

type atlasImportRequest struct {
	Kind           string            `json:"kind"`
	IDs            []string          `json:"ids"`
	PreferredAngle string            `json:"preferredAngle"`
	Audience       string            `json:"audience"`
	CustomNames    map[string]string `json:"customNames"`
}

func validAtlasAudience(raw string) string {
	switch strings.TrimSpace(raw) {
	case "adult_male", "adult_female", "senior_male", "senior_female", "child_male", "child_female", "unknown":
		return strings.TrimSpace(raw)
	default:
		return "adult_female"
	}
}

func atlasDeterministicID(workspace, domain, itemID string) string {
	sum := sha256.Sum256([]byte(workspace + "\x00" + domain + "\x00" + itemID))
	return "c" + hex.EncodeToString(sum[:])[:24]
}

func copyFileAtomic(srcPath, destPath string) error {
	in, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	tmp := destPath + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tmp)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return os.Rename(tmp, destPath)
}

func tryDownloadRemotePortrait(ctx context.Context, client *http.Client, remoteURL, destPath string) bool {
	if client == nil || !strings.HasPrefix(remoteURL, "https://") {
		return false
	}
	dlCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(dlCtx, http.MethodGet, remoteURL, nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return false
	}
	tmp := destPath + ".dl.tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return false
	}
	n, copyErr := io.Copy(out, io.LimitReader(resp.Body, 20<<20))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || n < 256 {
		_ = os.Remove(tmp)
		return false
	}
	if os.Rename(tmp, destPath) != nil {
		_ = os.Remove(tmp)
		return false
	}
	return true
}

func ensureAtlasRegistry(ctx context.Context, db *sql.DB, workspace, assetType, assetID, now string) {
	sum := sha256.Sum256([]byte(workspace + "\x00reg\x00" + assetType + "\x00" + assetID))
	regID := "reg_" + hex.EncodeToString(sum[:12])
	_, _ = db.ExecContext(ctx, `
		INSERT INTO "PromptAssetRegistry" (
			"id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		) VALUES (?, ?, ?, ?, 'published', 1, 'atlas', NULL, NULL, NULL, ?, NULL, ?, ?)
		ON CONFLICT ("workspaceId", "assetType", "sourceAssetId") DO NOTHING`,
		regID, workspace, assetType, assetID, now, now, now)
}

func ensureAtlasCategory(ctx context.Context, db *sql.DB, workspace, categoryName, now string) string {
	label := strings.TrimSpace(categoryName)
	if label == "" {
		label = "姿态参考"
	}
	fullLabel := "姿态 · " + label
	runes := []rune(fullLabel)
	if len(runes) > 36 {
		fullLabel = string(runes[:36])
	}
	var existingID string
	err := db.QueryRowContext(ctx, `SELECT "id" FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? AND "kind"='category' AND "name"=?`, workspace, fullLabel).Scan(&existingID)
	if err == nil && existingID != "" {
		return existingID
	}
	sum := sha256.Sum256([]byte(workspace + "\x00atlas-tax\x00" + fullLabel))
	taxID := "taxonomy_atlas_" + hex.EncodeToString(sum[:10])
	_, insertErr := db.ExecContext(ctx, `INSERT OR IGNORE INTO "SalesScriptTaxonomy" ("id","workspaceId","kind","name","createdAt","updatedAt") VALUES (?,?,'category',?,?,?)`, taxID, workspace, fullLabel, now, now)
	if insertErr != nil {
		return ""
	}
	_ = db.QueryRowContext(ctx, `SELECT "id" FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? AND "kind"='category' AND "name"=?`, workspace, fullLabel).Scan(&existingID)
	return existingID
}

// AtlasImport 按需将选中的 RuiC-PoseAtlas 人脸或 5 视角姿态组幂等迁入当前工作区。
func AtlasImport(cfg config.Config) http.HandlerFunc {
	return atlasImportHandler(cfg, network.SafeClient())
}

func atlasImportHandler(cfg config.Config, client *http.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, msg string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": msg})
		}
		var body atlasImportRequest
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		if dec.Decode(&body) != nil || dec.Decode(new(any)) != io.EOF {
			fail(http.StatusBadRequest, "图鉴导入请求格式错误")
			return
		}
		body.Kind = strings.TrimSpace(body.Kind)
		if body.Kind != "face" && body.Kind != "pose" {
			fail(http.StatusBadRequest, "请选择要导入的图鉴类型（人像或姿态）")
			return
		}
		ids := dedupStrings(body.IDs)
		if len(ids) == 0 || len(ids) > 60 {
			fail(http.StatusBadRequest, "单次请选择 1 至 60 项图鉴资产进行导入")
			return
		}
		atlasDir := cfg.AtlasCatalogDir()
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			fail(http.StatusInternalServerError, "资产库暂不可用")
			return
		}
		defer db.Close()

		workspace := httpx.WorkspaceFrom(r)
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")

		var importedIDs []string
		importedCount, skippedCount := 0, 0
		if body.Kind == "face" {
			importedIDs, importedCount, skippedCount, err = importAtlasFaces(r.Context(), db, client, atlasDir, workspace, now, ids, body)
		} else {
			importedIDs, importedCount, skippedCount, err = importAtlasPoses(r.Context(), db, atlasDir, workspace, now, ids, body)
		}
		if err != nil {
			fail(http.StatusBadRequest, err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":     true,
			"kind":        body.Kind,
			"imported":    importedCount,
			"skipped":     skippedCount,
			"importedIds": importedIDs,
		})
	}
}

func importAtlasFaces(ctx context.Context, db *sql.DB, client *http.Client, atlasDir, workspace, now string, ids []string, body atlasImportRequest) ([]string, int, int, error) {
	facesFile, err := loadAtlasFacesFile(atlasDir)
	if err != nil {
		return nil, 0, 0, errors.New("本机尚未同步人像图鉴，请先执行 pnpm setup:atlas")
	}
	byID := make(map[string]atlasFaceItemRaw, len(facesFile.Images))
	for _, item := range facesFile.Images {
		byID[item.ID] = item
	}
	audience := validAtlasAudience(body.Audience)
	importedIDs := make([]string, 0, len(ids))
	imported, skipped := 0, 0

	for _, rawID := range ids {
		item, ok := byID[rawID]
		if !ok {
			return nil, 0, 0, fmt.Errorf("未找到人像编号 %s", rawID)
		}
		personaID := atlasDeterministicID(workspace, "atlas-persona", item.ID)
		var existing string
		if db.QueryRowContext(ctx, `SELECT "id" FROM "PersonaAsset" WHERE "workspaceId"=? AND "id"=?`, workspace, personaID).Scan(&existing) == nil && existing != "" {
			skipped++
			importedIDs = append(importedIDs, personaID)
			continue
		}
		localURL, copyErr := localizeAtlasFaceMedia(ctx, client, atlasDir, workspace, item)
		if copyErr != nil {
			return nil, 0, 0, copyErr
		}
		name, desc, tags := describeAtlasFace(item, body.CustomNames[item.ID])
		sourcesJSON, _ := json.Marshal([]string{localURL})
		views := map[string]string{"main": localURL, "face": localURL}
		if item.Sec == "styling" {
			views = map[string]string{"main": localURL, "upperBody": localURL}
		}
		dimsJSON, _ := json.Marshal(map[string]any{"audience": audience, "atlasId": item.ID, "personaViews": views})
		_, execErr := db.ExecContext(ctx, `
			INSERT INTO "PersonaAsset" (
				"id", "workspaceId", "name", "description", "tags", "avatarUrl", "sourceImages", "dimensions",
				"provenance", "usageCount", "isFavorite", "createdAt", "updatedAt", "albumId", "productCategoryIds", "isUniversal"
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, 0, ?, ?, NULL, '[]', 0)`,
			personaID, workspace, name, desc, tags, localURL, string(sourcesJSON), string(dimsJSON), now, now)
		if execErr != nil {
			return nil, 0, 0, errors.New("保存人像资产失败，请重试")
		}
		ensureAtlasRegistry(ctx, db, workspace, "persona", personaID, now)
		imported++
		importedIDs = append(importedIDs, personaID)
	}
	return importedIDs, imported, skipped, nil
}
