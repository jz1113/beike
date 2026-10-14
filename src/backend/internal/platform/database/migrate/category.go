package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"regexp"
)

func applyProductSubcategory(ctx context.Context, db execer) error {
	present, err := hasColumn(ctx, db, "FullPromptAsset", "productSubcategory")
	if err != nil {
		return err
	}
	if !present {
		if err := exec(ctx, db, `ALTER TABLE "FullPromptAsset" ADD COLUMN "productSubcategory" TEXT`); err != nil {
			return err
		}
	}
	return exec(ctx, db, `CREATE INDEX IF NOT EXISTS "FullPromptAsset_productSubcategory_idx" ON "FullPromptAsset"("productSubcategory")`)
}

func applyFolderArchiving(ctx context.Context, db execer) error {
	present, err := hasColumn(ctx, db, "AssetProductCategory", "isArchived")
	if err != nil || present {
		return err
	}
	return exec(ctx, db, `ALTER TABLE "AssetProductCategory" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false`)
}

func applySubcategoryBackfill(ctx context.Context, db execer) error {
	rows, err := db.QueryContext(ctx, `SELECT "id", "title", "shotPromptsJson" FROM "FullPromptAsset"
		WHERE "productSubcategory" IS NULL AND "shotPromptsJson" IS NOT NULL AND "provenance" <> 'legacy_single'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type group struct{ id, title, shots string }
	var groups []group
	for rows.Next() {
		var item group
		var shots sql.NullString
		if err := rows.Scan(&item.id, &item.title, &shots); err != nil {
			return err
		}
		item.shots = shots.String
		groups = append(groups, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range groups {
		if len(parseGroupShots(item.shots)) != 4 {
			continue
		}
		subcategory := inferPromptGroupSubcategory(item.title, item.shots)
		if subcategory == "" {
			continue
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productSubcategory" = ? WHERE "id" = ? AND "productSubcategory" IS NULL`, subcategory, item.id); err != nil {
			return err
		}
	}
	return nil
}

func applyMajorCategoryBackfill(ctx context.Context, db execer) error {
	var categoryWorkspace string
	err := db.QueryRowContext(ctx, `SELECT "workspaceId" FROM "AssetProductCategory" WHERE "id" = ? AND "parentId" IS NULL`, "digital_3c").Scan(&categoryWorkspace)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	albums, err := db.QueryContext(ctx, `SELECT "id", "workspaceId", "productCategoryId" FROM "PromptAlbum"`)
	if err != nil {
		return err
	}
	defer albums.Close()
	type album struct{ id, workspace, category string }
	var albumRows []album
	for albums.Next() {
		var item album
		var category sql.NullString
		if err := albums.Scan(&item.id, &item.workspace, &category); err != nil {
			return err
		}
		item.category = category.String
		albumRows = append(albumRows, item)
	}
	if err := albums.Err(); err != nil {
		return err
	}
	groups, err := loadCategoryGroups(ctx, db, `SELECT "id", "workspaceId", "albumId", "title", "shotPromptsJson", "productCategoryIds", "productSubcategory" FROM "FullPromptAsset" WHERE "provenance" <> 'legacy_single'`)
	if err != nil {
		return err
	}
	byAlbum := map[string][]categoryGroup{}
	for _, group := range groups {
		if group.albumID == "" {
			continue
		}
		key := group.workspace + ":" + group.albumID
		byAlbum[key] = append(byAlbum[key], group)
	}
	available := func(workspace string) bool {
		return categoryWorkspace == workspace || categoryWorkspace == officialWorkspace
	}
	for _, album := range albumRows {
		if album.category != "" || !available(album.workspace) {
			continue
		}
		members := byAlbum[album.workspace+":"+album.id]
		if len(members) == 0 || albumHasNonDigital(members) {
			continue
		}
		if err := exec(ctx, db, `UPDATE "PromptAlbum" SET "productCategoryId" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryId" IS NULL`, "digital_3c", album.id, album.workspace); err != nil {
			return err
		}
		for _, group := range members {
			if len(parseStringList(group.categories)) > 0 {
				continue
			}
			if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productCategoryIds" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = ?`, `["digital_3c"]`, group.id, group.workspace, group.categories); err != nil {
				return err
			}
		}
	}
	for _, group := range groups {
		if group.albumID != "" || !available(group.workspace) || len(parseStringList(group.categories)) > 0 || !isDigitalGroup(group) {
			continue
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productCategoryIds" = ? WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = ?`, `["digital_3c"]`, group.id, group.workspace, group.categories); err != nil {
			return err
		}
	}
	return nil
}

type categoryGroup struct {
	id, workspace, albumID, title, shots, categories, subcategory string
}

func loadCategoryGroups(ctx context.Context, db execer, query string) ([]categoryGroup, error) {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var groups []categoryGroup
	for rows.Next() {
		var group categoryGroup
		var album, shots, subcategory sql.NullString
		if err := rows.Scan(&group.id, &group.workspace, &album, &group.title, &shots, &group.categories, &subcategory); err != nil {
			return nil, err
		}
		group.albumID, group.shots, group.subcategory = album.String, shots.String, subcategory.String
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func albumHasNonDigital(members []categoryGroup) bool {
	for _, group := range members {
		ids := parseStringList(group.categories)
		if len(ids) > 0 {
			if len(ids) != 1 || ids[0] != "digital_3c" {
				return true
			}
			continue
		}
		if !isDigitalGroup(group) {
			return true
		}
	}
	return false
}

func isDigitalGroup(group categoryGroup) bool {
	return isPromptGroupSubcategory(group.subcategory) || inferPromptGroupSubcategory(group.title, group.shots) != ""
}

func applyMajorCategoryEvidence(ctx context.Context, db execer) error {
	rows, err := db.QueryContext(ctx, `SELECT "id", "workspaceId", "albumId", "title", "shotPromptsJson", "productCategoryIds" FROM "FullPromptAsset" WHERE "productCategoryIds" = '[]' AND "provenance" <> 'legacy_single'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type evidenceGroup struct {
		id, workspace, albumID, title, shots, categories string
	}
	var groups []evidenceGroup
	for rows.Next() {
		var group evidenceGroup
		var album, shots sql.NullString
		if err := rows.Scan(&group.id, &group.workspace, &album, &group.title, &shots, &group.categories); err != nil {
			return err
		}
		group.albumID, group.shots = album.String, shots.String
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	var categoryWorkspace string
	err = db.QueryRowContext(ctx, `SELECT "workspaceId" FROM "AssetProductCategory" WHERE "id" = 'digital_3c' AND "parentId" IS NULL`).Scan(&categoryWorkspace)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	for _, group := range groups {
		if (categoryWorkspace != group.workspace && categoryWorkspace != officialWorkspace) || !hasRepeatedDigitalSubject(group.title, group.shots) {
			continue
		}
		if group.albumID != "" {
			var category sql.NullString
			err := db.QueryRowContext(ctx, `SELECT "productCategoryId" FROM "PromptAlbum" WHERE "id" = ? AND "workspaceId" = ?`, group.albumID, group.workspace).Scan(&category)
			if err == sql.ErrNoRows || (category.Valid && category.String != "" && category.String != "digital_3c") {
				continue
			}
			if err != nil && err != sql.ErrNoRows {
				return err
			}
			members, err := db.QueryContext(ctx, `SELECT "id", "productCategoryIds" FROM "FullPromptAsset" WHERE "albumId" = ? AND "workspaceId" = ? AND "provenance" <> 'legacy_single'`, group.albumID, group.workspace)
			if err != nil {
				return err
			}
			blocked := false
			for members.Next() {
				var id, categories string
				if err := members.Scan(&id, &categories); err != nil {
					members.Close()
					return err
				}
				if id != group.id && categories != `["digital_3c"]` {
					blocked = true
				}
			}
			members.Close()
			if blocked {
				continue
			}
			if err := exec(ctx, db, `UPDATE "PromptAlbum" SET "productCategoryId" = 'digital_3c' WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryId" IS NULL`, group.albumID, group.workspace); err != nil {
				return err
			}
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productCategoryIds" = '["digital_3c"]' WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = '[]'`, group.id, group.workspace); err != nil {
			return err
		}
	}
	return nil
}

var (
	digitalSubject = regexp.MustCompile(`(?i)手机(?:本体|壳|机身|背面|正面|镜头|屏幕)?|iPhone|Android|耳机|耳塞|平板|iPad|phone\s*case|earbuds|tablet`)
	otherSubject   = regexp.MustCompile(`项链|手链|手镯|戒指|耳环|耳饰|珠宝|首饰|鞋履|服饰|女装|男装|箱包|手袋`)
)

func hasRepeatedDigitalSubject(title, shotsJSON string) bool {
	if !digitalSubject.MatchString(title) || otherSubject.MatchString(title) {
		return false
	}
	shots := parseGroupShots(shotsJSON)
	if len(shots) != 4 {
		return false
	}
	matched := 0
	for _, shot := range shots {
		if digitalSubject.MatchString(sourcePromptSection(shot.Prompt, "主体")) {
			matched++
		}
	}
	return matched >= 2
}

func parseStringList(raw string) []string {
	var parsed []any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil
	}
	out := make([]string, 0, len(parsed))
	for _, item := range parsed {
		text, ok := item.(string)
		if !ok {
			return nil
		}
		out = append(out, text)
	}
	return out
}
