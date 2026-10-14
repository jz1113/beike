package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
)

type legacyPrompt struct {
	id                                           string
	albumID, albumName, title, reversePrompt     sql.NullString
	sourceIndex                                  sql.NullInt64
	coverURL, sourceImages, category, productIDs sql.NullString
	hasHuman, favorite                           int
}

func applyContentPromptGroups(ctx context.Context, db execer) error {
	if err := execScript(ctx, db, sourceText("content_prompt_groups.sql"), true); err != nil {
		return err
	}
	return backfillLegacyContentGroups(ctx, db)
}

func backfillLegacyContentGroups(ctx context.Context, db execer) error {
	rows, err := db.QueryContext(ctx, `SELECT "id", "albumId", "albumName", "title", "reversePromptZh", "sourceImageIndex", "coverUrl", "sourceImages", "category", "productCategoryIds", "hasHuman", "isFavorite"
		FROM "FullPromptAsset" WHERE "groupIndex" IS NULL AND "provenance" <> 'legacy_single'
		ORDER BY "albumId", "sourceImageIndex", "createdAt"`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var items []legacyPrompt
	for rows.Next() {
		var row legacyPrompt
		if err := rows.Scan(&row.id, &row.albumID, &row.albumName, &row.title, &row.reversePrompt, &row.sourceIndex, &row.coverURL, &row.sourceImages, &row.category, &row.productIDs, &row.hasHuman, &row.favorite); err != nil {
			return err
		}
		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	buckets := map[string][]legacyPrompt{}
	var keys []string
	for _, row := range items {
		if !row.albumID.Valid || row.albumID.String == "" || !row.sourceIndex.Valid || row.sourceIndex.Int64 == 0 {
			continue
		}
		groupIndex := int((row.sourceIndex.Int64-1)/4) + 1
		key := fmt.Sprintf("%s:%d", row.albumID.String, groupIndex)
		if _, ok := buckets[key]; !ok {
			keys = append(keys, key)
		}
		buckets[key] = append(buckets[key], row)
	}
	for _, key := range keys {
		group := buckets[key]
		first := group[0]
		groupIndex := int((first.sourceIndex.Int64-1)/4) + 1
		indexes := make([]int, len(group))
		for i, row := range group {
			indexes[i] = int(row.sourceIndex.Int64)
		}
		sort.Ints(indexes)
		var existing string
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "FullPromptAsset" WHERE "albumId" = ? AND "groupIndex" = ?`, first.albumID.String, groupIndex).Scan(&existing)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == sql.ErrNoRows {
			var architecture []string
			var shotLines []string
			shots := make([]legacyShot, 0, len(group))
			anyHuman := false
			anyFavorite := false
			for index, row := range group {
				architecture = append(architecture, fmt.Sprintf("图%d（原图#%d）：沿用历史反推中的构图与动作关系", index+1, row.sourceIndex.Int64))
				shotLines = append(shotLines, fmt.Sprintf("图%d（原图#%d）：\n%s", index+1, row.sourceIndex.Int64, row.reversePrompt.String))
				shotType := "pure_product"
				if row.hasHuman != 0 {
					shotType = "model_shot"
					anyHuman = true
				}
				if row.favorite != 0 {
					anyFavorite = true
				}
				shots = append(shots, legacyShot{
					ShotNo: index + 1, Title: firstNonEmpty(row.title.String, fmt.Sprintf("图组分镜 %d", index+1)),
					Prompt: row.reversePrompt.String, HasHuman: row.hasHuman != 0, ShotType: shotType, Selected: true,
				})
			}
			label := firstNonEmpty(first.albumName.String, first.title.String)
			contentSummary := label + "：由历史单图母本回填的连续内容图组。"
			persona := "本组无人物"
			if anyHuman {
				persona = "历史图组有人物；人物与穿搭请按整组替换"
			}
			indexJSON, _ := json.Marshal(indexes)
			shotJSON, _ := json.Marshal(shots)
			slots, _ := json.Marshal(legacySlots{
				Persona: "group_replaceable", Outfit: "group_replaceable", Scene: "group_replaceable",
				Locked: []string{"scene_continuity", "shot_order", "framing", "action_or_placement"},
			})
			prompt := "【整条内容总结】" + contentSummary + "\n\n【固定图组架构】" + joinLines(architecture) + "\n\n【图组分镜提示词】\n\n" + joinParagraphs(shotLines)
			now := isoNow()
			if err := exec(ctx, db, `INSERT INTO "FullPromptAsset" ("id", "title", "albumName", "reversePromptZh", "sourceImageIndex", "sourceImageIndices", "groupIndex", "contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson", "coverUrl", "sourceImages", "hasHuman", "personaSummary", "category", "provenance", "isFavorite", "createdAt", "updatedAt", "albumId", "productCategoryIds", "isUniversal")
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_group', ?, ?, ?, ?, ?, 0)`,
				"legacy_group_"+newUUID(), label+" · 图组 "+fmt.Sprint(groupIndex), nullIfEmpty(first.albumName.String), prompt, first.sourceIndex.Int64,
				string(indexJSON), groupIndex, contentSummary, joinLines(architecture), string(slots), string(shotJSON),
				nullIfEmpty(first.coverURL.String), nullIfEmpty(first.sourceImages.String), boolInt(anyHuman), persona,
				first.category.String, boolInt(anyFavorite), now, now, first.albumID.String, first.productIDs.String); err != nil {
				return err
			}
		}
		placeholders := make([]string, len(group))
		args := make([]any, len(group))
		for i, row := range group {
			placeholders[i] = "?"
			args[i] = row.id
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "provenance" = 'legacy_single' WHERE "id" IN (`+joinComma(placeholders)+`)`, args...); err != nil {
			return err
		}
	}
	return nil
}

type legacyShot struct {
	ShotNo   int    `json:"shot_no"`
	Title    string `json:"title"`
	Prompt   string `json:"prompt"`
	HasHuman bool   `json:"has_human"`
	ShotType string `json:"shot_type"`
	Selected bool   `json:"selected"`
}

type legacySlots struct {
	Persona string   `json:"persona"`
	Outfit  string   `json:"outfit"`
	Scene   string   `json:"scene"`
	Locked  []string `json:"locked"`
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func joinLines(lines []string) string {
	out := ""
	for i, line := range lines {
		if i > 0 {
			out += "\n"
		}
		out += line
	}
	return out
}

func joinParagraphs(lines []string) string {
	out := ""
	for i, line := range lines {
		if i > 0 {
			out += "\n\n"
		}
		out += line
	}
	return out
}

func joinComma(parts []string) string {
	out := ""
	for i, part := range parts {
		if i > 0 {
			out += ", "
		}
		out += part
	}
	return out
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
