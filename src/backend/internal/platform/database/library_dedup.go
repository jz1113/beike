package database

import (
	"context"
	"database/sql"
	"regexp"
	"strings"
	"time"
)

var outfitTitlePattern = regexp.MustCompile(`(?:外套|大衣|风衣|西装|开衫|衬衫|卫衣|T恤|针织衫|针织|连衣裙|长裙|短裙|百褶裙|蓬蓬裙|马面裙|短裤|长裤|牛仔裤|阔腿裤|套组|套装|穿搭|穿著|搭配|叠穿|刺绣半裙|蕾丝裙|工装外套)`)
var outfitTitleConfirm = regexp.MustCompile(`(?:外套|套组|套装|穿搭|裙|西装|针织)`)
var actionTitlePattern = regexp.MustCompile(`(?:姿势|姿态|蹲坐|侧卧|俯视|仰视|掩面|端捧|举手|倚靠|漫步|奔跑|用餐|笑颜|近景|抓拍|特写|合拢|侧颜|回眸|微动|随拍|自拍|打结|露肩|肖像|甜笑|大笑|微笑|欢笑|凝视|互动|小憩|沉思|立姿|坐姿|站姿)`)
var actionDescriptionPattern = regexp.MustCompile(`(?:构图|抓拍|姿势|姿态|近景|特写|俯视|蹲坐|侧卧)`)
var personaTitlePattern = regexp.MustCompile(`(?:金发少女|复古少女|京都卷发女子|时尚博主|卷发女子|金橘发|波西米亚女子|波浪卷发|短发女生|黑长直|鹅蛋脸|猫系脸|清秀五官)`)
var scenePersonPattern = regexp.MustCompile(`与(?:复古)?(?:少女|女生|女郎|人物|模特|行人)`)
var sceneTitleTail = regexp.MustCompile(`[，,。.；;\s]+$`)

type dedupScene struct {
	id, workspace, title, description, lighting, category, tags string
	cover                                                       sql.NullString
}

func DeduplicateLibrary(ctx context.Context, db *sql.DB, workspace string) (int, int, error) {
	migrated, cleaned, err := migrateMisplacedScenes(ctx, db, workspace)
	if err != nil {
		return 0, 0, err
	}
	outfitCleaned, err := deduplicateOutfits(ctx, db, workspace)
	if err != nil {
		return 0, 0, err
	}
	actionCleaned, err := deduplicateNamedAssets(ctx, db, workspace, "ActionAsset", "title")
	if err != nil {
		return 0, 0, err
	}
	personaCleaned, err := deduplicateNamedAssets(ctx, db, workspace, "PersonaAsset", "name")
	if err != nil {
		return 0, 0, err
	}
	return migrated, cleaned + outfitCleaned + actionCleaned + personaCleaned, nil
}

func migrateMisplacedScenes(ctx context.Context, db *sql.DB, workspace string) (int, int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", IFNULL("title", ''), IFNULL("description", ''), IFNULL("lighting", ''),
			IFNULL("category", ''), IFNULL("tags", ''), "coverUrl"
		FROM "SceneAsset" WHERE "workspaceId" IN (?, ?) ORDER BY "createdAt" DESC`, workspace, officialWorkspace)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	scenes := []dedupScene{}
	for rows.Next() {
		var scene dedupScene
		if err := rows.Scan(&scene.id, &scene.workspace, &scene.title, &scene.description, &scene.lighting, &scene.category, &scene.tags, &scene.cover); err != nil {
			return 0, 0, err
		}
		scenes = append(scenes, scene)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	migrated, cleaned := 0, 0
	seen := map[string]struct{}{}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, scene := range scenes {
		full := scene.title + " " + scene.description
		if outfitTitlePattern.MatchString(scene.title) && outfitTitleConfirm.MatchString(scene.title) {
			if err := moveSceneToOutfit(ctx, db, workspace, now, scene); err != nil {
				return 0, 0, err
			}
			migrated++
			continue
		}
		if actionTitlePattern.MatchString(scene.title) || actionDescriptionPattern.MatchString(scene.description) {
			if err := moveSceneToAction(ctx, db, workspace, now, scene, full); err != nil {
				return 0, 0, err
			}
			migrated++
			continue
		}
		if personaTitlePattern.MatchString(scene.title) {
			if err := moveSceneToPersona(ctx, db, workspace, now, scene); err != nil {
				return 0, 0, err
			}
			migrated++
			continue
		}
		title := strings.TrimSpace(sceneTitleTail.ReplaceAllString(scenePersonPattern.ReplaceAllString(scene.title, "空间"), ""))
		description := sanitizeScenePrompt(scene.description)
		lighting := "自然采光与清晰物理接触阴影"
		if scene.lighting != "" {
			lighting = sanitizeScenePrompt(scene.lighting)
		}
		key := strings.ToLower(title)
		if _, ok := seen[key]; ok {
			if err := deleteCurrentRow(ctx, db, "SceneAsset", scene.id, workspace); err != nil {
				return 0, 0, err
			}
			cleaned++
			continue
		}
		seen[key] = struct{}{}
		if title != scene.title || description != scene.description || lighting != scene.lighting {
			if _, err := db.ExecContext(ctx, `
				UPDATE "SceneAsset" SET "title" = ?, "description" = ?, "lighting" = ?, "updatedAt" = ?
				WHERE "id" = ? AND "workspaceId" = ?`, title, description, lighting, now, scene.id, workspace); err != nil {
				return 0, 0, err
			}
		}
	}
	return migrated, cleaned, nil
}

func moveSceneToOutfit(ctx context.Context, db *sql.DB, workspace, now string, scene dedupScene) error {
	bottom := "高腰垂感半身长裙"
	if len([]rune(scene.description)) > 10 {
		bottom = string([]rune(scene.description)[:100])
	}
	category := scene.category
	if category == "" {
		category = "general"
	}
	id, err := newLibraryID()
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO "OutfitAsset" ("id", "workspaceId", "title", "top", "bottom", "shoes", "colorPalette", "category", "tags", "coverUrl", "createdAt", "updatedAt")
		VALUES (?, ?, ?, ?, ?, '法式复古单鞋', '经典复古配色', ?, ?, ?, ?, ?)`,
		id, workspace, scene.title, scene.title, bottom, category, scene.tags, nullString(scene.cover), now, now); err != nil {
		return err
	}
	return deleteCurrentRow(ctx, db, "SceneAsset", scene.id, workspace)
}

func moveSceneToAction(ctx context.Context, db *sql.DB, workspace, now string, scene dedupScene, full string) error {
	camera := "iPhone 50mm 生活镜头"
	switch {
	case strings.Contains(scene.title, "俯视") || strings.Contains(full, "俯角"):
		camera = "高角度俯视镜头"
	case strings.Contains(scene.title, "特写") || strings.Contains(scene.title, "近景"):
		camera = "85mm f/1.8 特写镜头"
	case strings.Contains(full, "35mm"):
		camera = "35mm 全景镜头"
	}
	shotType := "medium_full_body"
	if strings.Contains(scene.title, "特写") || strings.Contains(scene.title, "近景") || strings.Contains(scene.title, "侧颜") {
		shotType = "close_up"
	} else if strings.Contains(scene.title, "俯视") {
		shotType = "high_angle_seated_full_body"
	}
	action := scene.description
	if action == "" {
		action = scene.title
	}
	id, err := newLibraryID()
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO "ActionAsset" ("id", "workspaceId", "shotType", "title", "action", "camera", "reversePrompt", "createdAt", "updatedAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, shotType, scene.title, action, camera, action, now, now); err != nil {
		return err
	}
	return deleteCurrentRow(ctx, db, "SceneAsset", scene.id, workspace)
}

func moveSceneToPersona(ctx context.Context, db *sql.DB, workspace, now string, scene dedupScene) error {
	description := scene.description
	if description == "" {
		description = scene.title
	}
	id, err := newLibraryID()
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO "PersonaAsset" ("id", "workspaceId", "name", "description", "tags", "avatarUrl", "createdAt", "updatedAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, scene.title, description, scene.tags, nullString(scene.cover), now, now); err != nil {
		return err
	}
	return deleteCurrentRow(ctx, db, "SceneAsset", scene.id, workspace)
}

func deduplicateOutfits(ctx context.Context, db *sql.DB, workspace string) (int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", IFNULL("title", ''), IFNULL("top", ''), IFNULL("bottom", ''),
			IFNULL("shoes", ''), IFNULL("colorPalette", ''), IFNULL("tags", '')
		FROM "OutfitAsset" WHERE "workspaceId" IN (?, ?) ORDER BY "createdAt" DESC`, workspace, officialWorkspace)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type row struct {
		id, workspace string
		fields        outfitFields
	}
	outfits := []row{}
	for rows.Next() {
		var item row
		if err := rows.Scan(&item.id, &item.workspace, &item.fields.title, &item.fields.top, &item.fields.bottom, &item.fields.shoes, &item.fields.colorPalette, &item.fields.tags); err != nil {
			return 0, err
		}
		outfits = append(outfits, item)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	kept := []outfitFields{}
	cleaned := 0
	for _, outfit := range outfits {
		duplicate := false
		for _, existing := range kept {
			if outfitSimilarity(existing, outfit.fields) >= 0.7 {
				duplicate = true
				break
			}
		}
		if !duplicate {
			kept = append(kept, outfit.fields)
			continue
		}
		if err := deleteCurrentRow(ctx, db, "OutfitAsset", outfit.id, workspace); err != nil {
			return 0, err
		}
		cleaned++
	}
	return cleaned, nil
}

func deduplicateNamedAssets(ctx context.Context, db *sql.DB, workspace, table, column string) (int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", IFNULL("`+column+`", '') FROM "`+table+`"
		WHERE "workspaceId" IN (?, ?) ORDER BY "createdAt" DESC`, workspace, officialWorkspace)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	seen := map[string]struct{}{}
	cleaned := 0
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return 0, err
		}
		key := strings.ToLower(strings.TrimSpace(name))
		if _, ok := seen[key]; ok {
			if err := deleteCurrentRow(ctx, db, table, id, workspace); err != nil {
				return 0, err
			}
			cleaned++
			continue
		}
		seen[key] = struct{}{}
	}
	return cleaned, rows.Err()
}

func deleteCurrentRow(ctx context.Context, db *sql.DB, table, id, workspace string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM "`+table+`" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	return err
}
