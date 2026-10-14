package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

type LibraryImport struct {
	Items    []json.RawMessage
	Warnings []string
}

type backupItem struct {
	assetType string
	sourceID  string
	data      map[string]any
}

func BulkImportLibrary(ctx context.Context, db *sql.DB, workspace string, rawItems []any, rawRegistries, rawReplacements, rawCategories, rawAlbums any) (LibraryImport, error) {
	items, err := prepareBackupItems(rawItems)
	if err != nil {
		return LibraryImport{}, err
	}
	registries, err := parseBackupRegistries(rawRegistries)
	if err != nil {
		return LibraryImport{}, err
	}
	replacements, err := parseBackupReplacements(rawReplacements)
	if err != nil {
		return LibraryImport{}, err
	}
	categories, err := parseBackupCategories(rawCategories)
	if err != nil {
		return LibraryImport{}, err
	}
	albums, err := parseBackupAlbums(rawAlbums)
	if err != nil {
		return LibraryImport{}, err
	}
	seen := map[string]struct{}{}
	for _, item := range items {
		if item.sourceID == "" {
			continue
		}
		key := item.assetType + "\x00" + item.sourceID
		if _, ok := seen[key]; ok {
			return LibraryImport{}, LibraryFailure{Message: "备份资产 ID 重复"}
		}
		seen[key] = struct{}{}
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return LibraryImport{}, err
	}
	defer func() { _ = tx.Rollback() }()
	maps := &backupMaps{categoryMap: map[string]string{}, albumMap: map[string]string{}, unresolved: map[string]struct{}{}}
	if backupNeedsOrganization(categories, albums, items) {
		if err := restoreBackupOrganization(ctx, tx, workspace, now, categories, albums, items, maps); err != nil {
			return LibraryImport{}, err
		}
	} else {
		maps.valid, err = knownCategoryIDs(ctx, tx, workspace)
		if err != nil {
			return LibraryImport{}, err
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].assetType == "scene" && items[j].assetType != "scene"
	})
	sceneIDs := map[string]string{}
	createdIDs := map[string]string{}
	created := []json.RawMessage{}
	var missingScenes int
	for _, item := range items {
		data := item.data
		remapBackupData(data, item.assetType, maps)
		if item.assetType == "action" {
			if sceneID, ok := data["sceneId"].(string); ok && sceneID != "" {
				if mapped, ok := sceneIDs[sceneID]; ok {
					data["sceneId"] = mapped
				} else {
					data["sceneId"] = nil
					missingScenes++
				}
			}
		}
		if item.assetType == "full_prompt" {
			if err := prepareImportedPrompt(ctx, tx, workspace, data); err != nil {
				return LibraryImport{}, err
			}
		}
		id, err := newLibraryID()
		if err != nil {
			return LibraryImport{}, err
		}
		if err := insertBackupAsset(ctx, tx, item.assetType, id, workspace, now, data); err != nil {
			return LibraryImport{}, err
		}
		if item.sourceID != "" {
			createdIDs[item.assetType+"\x00"+item.sourceID] = id
		}
		if item.assetType == "scene" && item.sourceID != "" {
			sceneIDs[item.sourceID] = id
		}
		table, columns, _ := libraryAssetTable(item.assetType)
		row, err := loadLibraryItem(ctx, tx, table, columns, id, workspace)
		if err != nil {
			return LibraryImport{}, err
		}
		created = append(created, row)
	}
	restored, missingRegistries, missingRefs, err := restoreBackupRegistries(ctx, tx, workspace, now, registries, createdIDs)
	if err != nil {
		return LibraryImport{}, err
	}
	missingReplacements, err := restoreBackupReplacements(ctx, tx, workspace, replacements, createdIDs)
	if err != nil {
		return LibraryImport{}, err
	}
	if err := overlayImportedPromptNumbers(ctx, tx, workspace, created); err != nil {
		return LibraryImport{}, err
	}
	if err := tx.Commit(); err != nil {
		return LibraryImport{}, err
	}
	warnings := backupImportWarnings(maps, registries, restored, missingRegistries, missingRefs, missingReplacements, missingScenes, len(created), len(createdIDs))
	return LibraryImport{Items: created, Warnings: warnings}, nil
}

func prepareBackupItems(rawItems []any) ([]backupItem, error) {
	items := make([]backupItem, 0, len(rawItems))
	for _, raw := range rawItems {
		object, ok := raw.(map[string]any)
		assetType, typeOK := object["assetType"].(string)
		if !ok || !typeOK {
			return nil, LibraryFailure{Message: "资产备份条目无效"}
		}
		data, err := pickBackupFields(assetType, object["data"])
		if err != nil {
			return nil, err
		}
		item := backupItem{assetType: assetType, data: data}
		if sourceID, ok := object["sourceId"].(string); ok {
			item.sourceID = sourceID
		}
		items = append(items, item)
	}
	return items, nil
}

func pickBackupFields(assetType string, raw any) (map[string]any, error) {
	specs, ok := backupFieldSpecs[assetType]
	if !ok {
		return nil, LibraryFailure{Message: "不支持的资产类型: " + assetType}
	}
	object, ok := raw.(map[string]any)
	if !ok {
		return nil, LibraryFailure{Message: "资产备份条目必须为对象"}
	}
	data := map[string]any{}
	for key, value := range object {
		spec, ok := specs[key]
		if !ok {
			continue
		}
		if value == nil {
			if strings.HasSuffix(spec, "?") {
				data[key] = nil
			}
			continue
		}
		kind := strings.TrimSuffix(spec, "?")
		switch kind {
		case "string":
			text, ok := value.(string)
			if !ok {
				return nil, LibraryFailure{Message: "资产备份字段类型不正确: " + assetType + "." + key}
			}
			data[key] = text
		case "int":
			number, ok := value.(json.Number)
			if !ok {
				return nil, LibraryFailure{Message: "资产备份字段类型不正确: " + assetType + "." + key}
			}
			parsed, err := number.Int64()
			if err != nil || parsed < 0 {
				return nil, LibraryFailure{Message: "资产备份字段类型不正确: " + assetType + "." + key}
			}
			data[key] = parsed
		case "bool":
			flag, ok := value.(bool)
			if !ok {
				return nil, LibraryFailure{Message: "资产备份字段类型不正确: " + assetType + "." + key}
			}
			data[key] = flag
		}
	}
	return data, nil
}

func knownCategoryIDs(ctx context.Context, tx *sql.Tx, workspace string) (map[string]struct{}, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT "id" FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?)`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := map[string]struct{}{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = struct{}{}
	}
	return ids, rows.Err()
}

func insertBackupAsset(ctx context.Context, tx *sql.Tx, assetType, id, workspace, now string, data map[string]any) error {
	table, _, ok := libraryAssetTable(assetType)
	if !ok {
		return LibraryFailure{Message: "不支持的资产类型: " + assetType}
	}
	columns := []string{`"id"`, `"workspaceId"`, `"createdAt"`, `"updatedAt"`}
	args := []any{id, workspace, now, now}
	for key, value := range data {
		if !libraryColumn(key) {
			continue
		}
		columns = append(columns, `"`+key+`"`)
		stored, err := storedLibraryValue(value)
		if err != nil {
			return err
		}
		args = append(args, stored)
	}
	marks := strings.TrimRight(strings.Repeat("?,", len(args)), ",")
	_, err := tx.ExecContext(ctx, `INSERT INTO "`+table+`" (`+strings.Join(columns, ", ")+`) VALUES (`+marks+`)`, args...)
	return err
}

func itoaCount(value int) string {
	body, _ := json.Marshal(value)
	return string(body)
}

func backupNeedsOrganization(categories []backupCategory, albums []backupAlbum, items []backupItem) bool {
	if len(categories) > 0 || len(albums) > 0 {
		return true
	}
	for _, item := range items {
		if albumID, ok := item.data["albumId"].(string); ok && albumID != "" {
			return true
		}
	}
	return false
}

func backupImportWarnings(maps *backupMaps, registries []backupRegistry, restored, missingRegistries, missingRefs, missingReplacements, missingScenes, created, createdIDs int) []string {
	warnings := []string{}
	if maps.multiCategoryAlbums > 0 {
		warnings = append(warnings, itoaCount(maps.multiCategoryAlbums)+" 个旧图集包含多个商品品类，已保留首个品类")
	}
	if len(registries) > 0 {
		if missingRegistries > 0 {
			warnings = append(warnings, itoaCount(missingRegistries)+" 条审核记录未找到对应导入资产，已跳过")
		}
		if missingRefs > 0 {
			warnings = append(warnings, itoaCount(missingRefs)+" 条审核记录的来源母本未包含在备份中，已清空来源关联")
		}
		if createdIDs > restored {
			warnings = append(warnings, itoaCount(createdIDs-restored)+" 条资产缺少审核记录，后续将按现有规则补建")
		}
	} else if created > 0 {
		warnings = append(warnings, "备份不含资产审核记录，原审核状态无法恢复，导入后将按现有规则重新建立")
	}
	if missingReplacements > 0 {
		warnings = append(warnings, itoaCount(missingReplacements)+" 条母组换图记录未找到对应导入资产，已跳过")
	}
	if len(maps.unresolved) > 0 {
		warnings = append(warnings, itoaCount(len(maps.unresolved))+" 个旧商品品类 ID 无法映射，相关分类已清空")
	}
	if maps.invalidMeta > 0 {
		warnings = append(warnings, itoaCount(maps.invalidMeta)+" 项商品品类适配规则格式无效，已恢复为空列表")
	}
	if maps.invalidLists > 0 {
		warnings = append(warnings, itoaCount(maps.invalidLists)+" 条资产的商品品类列表格式无效，已清空分类")
	}
	if maps.albumsWithoutKey > 0 {
		warnings = append(warnings, itoaCount(maps.albumsWithoutKey)+" 个图集缺少来源标识，已创建独立图集")
	}
	if maps.nameConflicts > 0 {
		warnings = append(warnings, itoaCount(maps.nameConflicts)+" 个品类与现有同名品类的适配规则或归档状态不同，已独立导入")
	}
	if maps.idConflicts > 0 {
		warnings = append(warnings, itoaCount(maps.idConflicts)+" 个品类的原 ID 对应不同定义，已按备份内容重新映射")
	}
	if maps.positionConflicts > 0 {
		warnings = append(warnings, itoaCount(maps.positionConflicts)+" 个已存在品类的排序与备份不同，保留目标库排序")
	}
	if maps.albumSourceConflicts > 0 {
		warnings = append(warnings, itoaCount(maps.albumSourceConflicts)+" 个图集的来源标识已存在，已独立导入")
	}
	if maps.unmappedAlbums > 0 {
		warnings = append(warnings, itoaCount(maps.unmappedAlbums)+" 条图集关联无法恢复，已清空关联")
	}
	if missingScenes > 0 {
		warnings = append(warnings, itoaCount(missingScenes)+" 条动作的原场景未包含在备份中，已清空场景关联")
	}
	return warnings
}
