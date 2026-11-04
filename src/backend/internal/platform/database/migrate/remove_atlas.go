package migrate

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
)

type removedAtlasAsset struct{ id, workspace, kind, table string }

// Remove only assets with importer-owned metadata, media paths or registry provenance.
func applyRemoveAtlas(ctx context.Context, db execer) error {
	removed := map[string]map[string]bool{}
	rows, err := db.QueryContext(ctx, `SELECT "workspaceId","sourceAssetId" FROM "PromptAssetRegistry" WHERE "provenance"='atlas' AND "assetType" IN ('persona','action')`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var workspace, id string
		if err := rows.Scan(&workspace, &id); err != nil {
			rows.Close()
			return err
		}
		if removed[workspace] == nil {
			removed[workspace] = map[string]bool{}
		}
		removed[workspace][id] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, spec := range []struct{ table, kind, image string }{
		{"PersonaAsset", "persona", "avatarUrl"}, {"ActionAsset", "action", "coverUrl"},
	} {
		rows, err := db.QueryContext(ctx, `SELECT a."id",a."workspaceId",COALESCE(a."dimensions",''),COALESCE(a.`+ident(spec.image)+`,''),COALESCE(a."sourceImages",''),
			EXISTS(SELECT 1 FROM "PromptAssetRegistry" r WHERE r."workspaceId"=a."workspaceId" AND r."sourceAssetId"=a."id" AND r."assetType"=? AND r."provenance"='atlas') FROM `+ident(spec.table)+` a`, spec.kind)
		if err != nil {
			return err
		}
		var assets []removedAtlasAsset
		for rows.Next() {
			var id, workspace, dimensions, image, sources string
			var registered bool
			if err := rows.Scan(&id, &workspace, &dimensions, &image, &sources, &registered); err != nil {
				rows.Close()
				return err
			}
			var metadata map[string]json.RawMessage
			_ = json.Unmarshal([]byte(dimensions), &metadata)
			var atlasID string
			_ = json.Unmarshal(metadata["atlasId"], &atlasID)
			if registered || strings.TrimSpace(atlasID) != "" || isAtlasMedia(image) || isAtlasMedia(sources) {
				assets = append(assets, removedAtlasAsset{id, workspace, spec.kind, spec.table})
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, asset := range assets {
			if removed[asset.workspace] == nil {
				removed[asset.workspace] = map[string]bool{}
			}
			removed[asset.workspace][asset.id] = true
			for _, table := range []string{"PromptAssetCategoryLink", "PromptAssetUsageEvent"} {
				if err := exec(ctx, db, `DELETE FROM `+ident(table)+` WHERE "workspaceId"=? AND ("assetId"=? OR "assetId" IN (SELECT "id" FROM "PromptAssetRegistry" WHERE "workspaceId"=? AND "assetType"=? AND "sourceAssetId"=?))`, asset.workspace, asset.id, asset.workspace, asset.kind, asset.id); err != nil {
					return err
				}
			}
			if err := exec(ctx, db, `DELETE FROM "SalesAssetViewJob" WHERE "workspaceId"=? AND "assetId"=? AND "kind"=?`, asset.workspace, asset.id, asset.kind); err != nil {
				return err
			}
			if err := exec(ctx, db, `UPDATE "PromptAssetRegistry" SET "sourceRef"=NULL WHERE "workspaceId"=? AND "sourceRef" IN (SELECT "id" FROM "PromptAssetRegistry" WHERE "workspaceId"=? AND "assetType"=? AND "sourceAssetId"=?)`, asset.workspace, asset.workspace, asset.kind, asset.id); err != nil {
				return err
			}
			if err := exec(ctx, db, `DELETE FROM "PromptAssetRegistry" WHERE "workspaceId"=? AND "assetType"=? AND "sourceAssetId"=?`, asset.workspace, asset.kind, asset.id); err != nil {
				return err
			}
			if err := exec(ctx, db, `DELETE FROM `+ident(asset.table)+` WHERE "workspaceId"=? AND "id"=?`, asset.workspace, asset.id); err != nil {
				return err
			}
		}
	}
	for _, table := range []string{"PromptAssetCategoryLink", "PromptAssetUsageEvent", "SalesAssetViewJob"} {
		query := `DELETE FROM ` + ident(table) + ` AS a WHERE EXISTS (SELECT 1 FROM "PromptAssetRegistry" r WHERE r."workspaceId"=a."workspaceId" AND (r."sourceAssetId"=a."assetId" OR r."id"=a."assetId") AND r."provenance"='atlas' AND r."assetType" IN ('persona','action')`
		if table == "SalesAssetViewJob" {
			query += ` AND r."assetType"=a."kind"`
		}
		if err := exec(ctx, db, query+`)`); err != nil {
			return err
		}
	}
	if err := exec(ctx, db, `UPDATE "PromptAssetRegistry" AS a SET "sourceRef"=NULL WHERE EXISTS (SELECT 1 FROM "PromptAssetRegistry" r WHERE r."workspaceId"=a."workspaceId" AND r."id"=a."sourceRef" AND r."provenance"='atlas' AND r."assetType" IN ('persona','action'))`); err != nil {
		return err
	}
	if err := exec(ctx, db, `DELETE FROM "PromptAssetRegistry" WHERE "provenance"='atlas' AND "assetType" IN ('persona','action')`); err != nil {
		return err
	}
	if err := clearSavedAtlasReferences(ctx, db, removed); err != nil {
		return err
	}
	return removeUnusedAtlasTaxonomy(ctx, db)
}

func isAtlasMedia(value string) bool { return strings.Contains(value, "/azhuo/assets/atlas/") }

func clearSavedAtlasReferences(ctx context.Context, db execer, removed map[string]map[string]bool) error {
	for _, spec := range []struct{ table, column string }{
		{"SalesProduct", "draftJson"}, {"SalesProductionPreset", "configJson"},
		{"WorkshopWorkspace", "snapshotJson"}, {"WorkshopBatch", "snapshotJson"},
		{"AssistantTurn", "snapshotJson"}, {"AssistantTurnItem", "actionJson"},
	} {
		rows, err := db.QueryContext(ctx, `SELECT "id","workspaceId",`+ident(spec.column)+` FROM `+ident(spec.table)+` WHERE `+ident(spec.column)+` IS NOT NULL`)
		if err != nil {
			return err
		}
		type record struct{ id, workspace, body string }
		var records []record
		for rows.Next() {
			var item record
			if err := rows.Scan(&item.id, &item.workspace, &item.body); err != nil {
				rows.Close()
				return err
			}
			records = append(records, item)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, item := range records {
			if !json.Valid([]byte(item.body)) {
				continue
			}
			var value any
			decoder := json.NewDecoder(strings.NewReader(item.body))
			decoder.UseNumber()
			if decoder.Decode(&value) != nil {
				continue
			}
			if !clearAtlasJSON(value, removed[item.workspace]) {
				continue
			}
			body, err := json.Marshal(value)
			if err != nil {
				return err
			}
			if err := exec(ctx, db, `UPDATE `+ident(spec.table)+` SET `+ident(spec.column)+`=? WHERE "id"=? AND "workspaceId"=?`, string(body), item.id, item.workspace); err != nil {
				return err
			}
		}
	}
	return nil
}

func clearAtlasJSON(value any, removed map[string]bool) bool {
	return clearAtlasJSONField(value, removed, "")
}

var atlasMediaURLToken = regexp.MustCompile(`https?://[^\s"'<>，。；！？、()\[\]{}]+|/storage/[^\s"'<>，。；！？、()\[\]{}]+`)

func stripAtlasMediaURLs(text string) string {
	return atlasMediaURLToken.ReplaceAllStringFunc(text, func(token string) string {
		if isAtlasMedia(token) {
			return ""
		}
		return token
	})
}

func atlasAssetReferenceField(key, parent string) bool {
	if parent == "beatActionIds" || parent == "actionIds" || parent == "personaIds" || parent == "usedActionIds" || parent == "previousActionIds" {
		return true
	}
	switch key {
	case "personaId", "actionId", "assetId", "sourceAssetId", "lockedPersonaId", "lockedActionId", "selectedPersonaAssetId", "selectedActionAssetId", "appliedPersonaId", "appliedActionId":
		return true
	}
	return false
}

func clearAtlasJSONField(value any, removed map[string]bool, parent string) bool {
	changed := false
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			// Retain old source fingerprints so restored plans fail their stale-source check.
			if key == "adaptedSourceKey" || key == "spokenCopySourceKey" {
				continue
			}
			if text, ok := child.(string); ok {
				next := stripAtlasMediaURLs(text)
				if removed[text] && atlasAssetReferenceField(key, parent) {
					next = ""
					if key == "lockedPersonaId" || key == "lockedActionId" {
						next = "auto"
					}
				}
				if next != text {
					item[key], changed = next, true
				}
			} else if clearAtlasJSONField(child, removed, key) {
				changed = true
			}
		}
	case []any:
		for i, child := range item {
			if text, ok := child.(string); ok {
				next := stripAtlasMediaURLs(text)
				if removed[text] && atlasAssetReferenceField("", parent) {
					next = ""
				}
				if next != text {
					item[i], changed = next, true
				}
			} else if clearAtlasJSONField(child, removed, parent) {
				changed = true
			}
		}
	}
	return changed
}

// A generated category may have since been reused for a user's own material.
func removeUnusedAtlasTaxonomy(ctx context.Context, db execer) error {
	return exec(ctx, db, `DELETE FROM "SalesScriptTaxonomy" AS t WHERE substr(t."id",1,15)='taxonomy_atlas_'
		AND NOT EXISTS (SELECT 1 FROM "ActionAsset" a WHERE a."workspaceId"=t."workspaceId" AND instr(COALESCE(a."productCategoryIds",''),'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "PersonaAsset" a WHERE a."workspaceId"=t."workspaceId" AND instr(COALESCE(a."productCategoryIds",''),'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "SceneAsset" a WHERE a."workspaceId"=t."workspaceId" AND instr(COALESCE(a."productCategoryIds",''),'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "OutfitAsset" a WHERE a."workspaceId"=t."workspaceId" AND instr(COALESCE(a."productCategoryIds",''),'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "FullPromptAsset" a WHERE a."workspaceId"=t."workspaceId" AND instr(COALESCE(a."productCategoryIds",''),'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "SalesReferenceScript" s WHERE s."workspaceId"=t."workspaceId" AND instr(s."scriptJson",'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "SalesProduct" p WHERE p."workspaceId"=t."workspaceId" AND instr(p."draftJson",'"'||t."id"||'"')>0)
		AND NOT EXISTS (SELECT 1 FROM "SalesProductionPreset" p WHERE p."workspaceId"=t."workspaceId" AND instr(p."configJson",'"'||t."id"||'"')>0)`)
}
