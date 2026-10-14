package migrate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

var assetTables = []string{"SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "FullPromptAsset"}

func albumSourceKey(name string, raw any, fallback string) string {
	var parsed []any
	switch value := raw.(type) {
	case string:
		_ = json.Unmarshal([]byte(value), &parsed)
	case []any:
		parsed = value
	}
	var sources []string
	for _, item := range parsed {
		text, ok := item.(string)
		if ok && strings.TrimSpace(text) != "" {
			sources = append(sources, text)
		}
	}
	sources = uniqueSorted(sources)
	var payload any
	if len(sources) > 0 && strings.TrimSpace(name) != "" {
		payload = []any{strings.TrimSpace(name), sources}
	} else {
		payload = []any{"single", fallback}
	}
	body, _ := json.Marshal(payload)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func uniqueSorted(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

type albumPreview struct {
	ID        string   `json:"id"`
	SourceKey string   `json:"sourceKey"`
	Name      string   `json:"name"`
	AssetIDs  []string `json:"assetIds"`
}

type organizationPreview struct {
	Counts map[string]int `json:"counts"`
	Albums []albumPreview `json:"albums"`
}

func previewAssetOrganization(ctx context.Context, db execer) (organizationPreview, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, albumName, title, sourceImages FROM "FullPromptAsset" ORDER BY id`)
	if err != nil {
		return organizationPreview{}, err
	}
	defer rows.Close()
	groups := map[string]*albumPreview{}
	var order []string
	for rows.Next() {
		var id, title string
		var albumName, sourceImages sqlNull
		if err := rows.Scan(&id, &albumName, &title, &sourceImages); err != nil {
			return organizationPreview{}, err
		}
		name := albumName.value
		key := albumSourceKey(name, sourceImages.value, id)
		group, ok := groups[key]
		if !ok {
			label := name
			if strings.TrimSpace(label) == "" {
				label = title
			}
			if strings.TrimSpace(label) == "" {
				label = "未命名图集"
			}
			group = &albumPreview{ID: "album_" + key[:32], SourceKey: key, Name: label, AssetIDs: []string{}}
			groups[key] = group
			order = append(order, key)
		}
		group.AssetIDs = append(group.AssetIDs, id)
	}
	if err := rows.Err(); err != nil {
		return organizationPreview{}, err
	}
	preview := organizationPreview{Counts: map[string]int{}, Albums: make([]albumPreview, 0, len(order))}
	for _, table := range assetTables {
		n, err := countRows(ctx, db, table)
		if err != nil {
			return organizationPreview{}, err
		}
		preview.Counts[table] = n
	}
	for _, key := range order {
		preview.Albums = append(preview.Albums, *groups[key])
	}
	return preview, nil
}

type sqlNull struct{ value string }

func (n *sqlNull) Scan(src any) error {
	if src == nil {
		n.value = ""
		return nil
	}
	switch value := src.(type) {
	case string:
		n.value = value
	case []byte:
		n.value = string(value)
	default:
		n.value = fmt.Sprint(value)
	}
	return nil
}

func applyAssetOrganization(ctx context.Context, db execer) error {
	preview, err := previewAssetOrganization(ctx, db)
	if err != nil {
		return err
	}
	exists, err := tableExists(ctx, db, "PromptAlbum")
	if err != nil {
		return err
	}
	already := false
	if exists {
		n, err := countRows(ctx, db, "PromptAlbum")
		if err != nil {
			return err
		}
		already = n > 0
	}
	script := sourceText("organization.sql")
	for _, statement := range splitSQL(script) {
		if match := alterColumn.FindStringSubmatch(statement); match != nil {
			present, err := hasColumn(ctx, db, match[1], match[2])
			if err != nil {
				return err
			}
			if present {
				continue
			}
		}
		rewritten := replaceFirst(statement, "CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
		rewritten = replaceFirst(rewritten, "CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ")
		rewritten = replaceFirst(rewritten, "CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ")
		rewritten = replaceFirst(rewritten, "INSERT INTO ", "INSERT OR IGNORE INTO ")
		if err := exec(ctx, db, rewritten); err != nil {
			return err
		}
	}
	if !already {
		for _, table := range assetTables {
			if err := exec(ctx, db, `UPDATE `+ident(table)+` SET "productCategoryIds" = '["jewelry"]'`); err != nil {
				return err
			}
		}
		for _, album := range preview.Albums {
			if err := exec(ctx, db, `INSERT INTO "PromptAlbum" (id, name, sourceKey, productCategoryId) VALUES (?, ?, ?, ?)`, album.ID, album.Name, album.SourceKey, "jewelry"); err != nil {
				return err
			}
			for _, id := range album.AssetIDs {
				if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET albumId = ? WHERE id = ?`, album.ID, id); err != nil {
					return err
				}
			}
		}
	}
	for _, table := range assetTables {
		n, err := countRows(ctx, db, table)
		if err != nil {
			return err
		}
		if n != preview.Counts[table] {
			return fmt.Errorf("Asset migration count mismatch: %s", table)
		}
	}
	return nil
}
