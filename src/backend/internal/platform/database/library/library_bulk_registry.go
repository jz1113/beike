package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"strings"
	"time"
)

type backupRegistry struct {
	id, assetType, sourceID, status, provenance string
	version                                     int64
	sourceRef, publishedAt, disabledReason      sql.NullString
	quality, confidence                         sql.NullFloat64
}

type backupReplacement struct {
	motherID, snapshot, images, createdAt string
}

func parseBackupRegistries(raw any) ([]backupRegistry, error) {
	if raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, LibraryFailure{Message: "备份资产审核状态格式无效"}
	}
	ids := map[string]struct{}{}
	assets := map[string]struct{}{}
	rows := []backupRegistry{}
	for _, value := range list {
		object, ok := value.(map[string]any)
		if !ok {
			return nil, LibraryFailure{Message: "备份资产审核状态条目无效"}
		}
		row, err := oneBackupRegistry(object)
		if err != nil {
			return nil, err
		}
		key := row.assetType + "\x00" + row.sourceID
		if _, ok := ids[row.id]; ok {
			return nil, LibraryFailure{Message: "备份资产审核状态条目重复"}
		}
		if _, ok := assets[key]; ok {
			return nil, LibraryFailure{Message: "备份资产审核状态条目重复"}
		}
		ids[row.id] = struct{}{}
		assets[key] = struct{}{}
		rows = append(rows, row)
	}
	return rows, nil
}

func oneBackupRegistry(object map[string]any) (backupRegistry, error) {
	id, _ := object["id"].(string)
	assetType, _ := object["assetType"].(string)
	sourceID, _ := object["sourceAssetId"].(string)
	status, _ := object["status"].(string)
	provenance, _ := object["provenance"].(string)
	version, versionOK := backupVersion(object["version"])
	if id == "" || !backupAssetType(assetType) || sourceID == "" || !backupStatus(status) || provenance == "" || !versionOK {
		return backupRegistry{}, LibraryFailure{Message: "备份资产审核状态条目无效"}
	}
	publishedAt, err := backupOptionalString(object["publishedAt"], "publishedAt")
	if err != nil {
		return backupRegistry{}, err
	}
	if publishedAt.Valid && !backupTime(publishedAt.String) {
		return backupRegistry{}, LibraryFailure{Message: "注册表发布时间无效"}
	}
	sourceRef, err := backupOptionalString(object["sourceRef"], "sourceRef")
	if err != nil {
		return backupRegistry{}, err
	}
	disabled, err := backupOptionalString(object["disabledReason"], "disabledReason")
	if err != nil {
		return backupRegistry{}, err
	}
	quality, err := backupOptionalNumber(object["qualityScore"], "qualityScore")
	if err != nil {
		return backupRegistry{}, err
	}
	confidence, err := backupOptionalNumber(object["confidence"], "confidence")
	if err != nil {
		return backupRegistry{}, err
	}
	return backupRegistry{
		id: id, assetType: assetType, sourceID: sourceID, status: status, provenance: provenance, version: version,
		sourceRef: sourceRef, publishedAt: publishedAt, disabledReason: disabled, quality: quality, confidence: confidence,
	}, nil
}

func parseBackupReplacements(raw any) ([]backupReplacement, error) {
	if raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, LibraryFailure{Message: "备份母组换图记录格式无效"}
	}
	seen := map[string]struct{}{}
	rows := []backupReplacement{}
	for _, value := range list {
		object, ok := value.(map[string]any)
		if !ok {
			return nil, LibraryFailure{Message: "备份母组换图记录无效"}
		}
		motherID, _ := object["motherAssetId"].(string)
		snapshot, _ := object["sourceSnapshotJson"].(string)
		images, _ := object["generatedImagesJson"].(string)
		createdAt, _ := object["createdAt"].(string)
		if motherID == "" || snapshot == "" || images == "" || createdAt == "" || !backupTime(createdAt) {
			return nil, LibraryFailure{Message: "备份母组换图记录无效"}
		}
		if _, ok := seen[motherID]; ok {
			return nil, LibraryFailure{Message: "备份母组换图记录无效"}
		}
		if !validReplacementPayload(snapshot, images) {
			return nil, LibraryFailure{Message: "备份母组换图内容无效"}
		}
		seen[motherID] = struct{}{}
		rows = append(rows, backupReplacement{motherID: motherID, snapshot: snapshot, images: images, createdAt: createdAt})
	}
	return rows, nil
}

func restoreBackupRegistries(ctx context.Context, tx *sql.Tx, workspace, now string, rows []backupRegistry, createdIDs map[string]string) (int, int, int, error) {
	registryIDs := map[string]string{}
	pending := [][2]string{}
	missing := 0
	for _, row := range rows {
		sourceID, ok := createdIDs[row.assetType+"\x00"+row.sourceID]
		if !ok {
			missing++
			continue
		}
		id, err := newLibraryID()
		if err != nil {
			return 0, 0, 0, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO "PromptAssetRegistry" (
				"id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
				"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
			) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
			id, workspace, row.assetType, sourceID, row.status, row.version, row.provenance,
			nullFloatArg(row.quality), nullFloatArg(row.confidence), nullTextArg(row.publishedAt), nullTextArg(row.disabledReason), now, now); err != nil {
			return 0, 0, 0, err
		}
		registryIDs[row.id] = id
		if row.sourceRef.Valid && row.sourceRef.String != "" {
			pending = append(pending, [2]string{id, row.sourceRef.String})
		}
	}
	missingRefs := 0
	for _, row := range pending {
		sourceRef, ok := registryIDs[row[1]]
		if !ok {
			missingRefs++
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE "PromptAssetRegistry" SET "sourceRef" = ? WHERE "id" = ?`, sourceRef, row[0]); err != nil {
			return 0, 0, 0, err
		}
	}
	return len(registryIDs), missing, missingRefs, nil
}

func restoreBackupReplacements(ctx context.Context, tx *sql.Tx, workspace string, rows []backupReplacement, createdIDs map[string]string) (int, error) {
	missing := 0
	for _, row := range rows {
		motherID, ok := createdIDs["full_prompt\x00"+row.motherID]
		if !ok {
			missing++
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO "FullPromptImageReplacement" (
				"motherAssetId", "workspaceId", "reviewId", "sourceSnapshotJson", "generatedImagesJson", "createdAt"
			) VALUES (?, ?, ?, ?, ?, ?)`,
			motherID, workspace, "restored_"+motherID, row.snapshot, row.images, row.createdAt); err != nil {
			return 0, err
		}
	}
	return missing, nil
}

func backupAssetType(value string) bool {
	switch value {
	case "scene", "outfit", "action", "persona", "full_prompt":
		return true
	default:
		return false
	}
}

func backupStatus(value string) bool {
	switch value {
	case "draft", "pending_review", "published", "needs_fix", "disabled", "archived":
		return true
	default:
		return false
	}
}

func backupVersion(value any) (int64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Int64()
		return parsed, err == nil && parsed >= 1 && parsed <= 2147483647
	case float64:
		return int64(typed), typed == math.Trunc(typed) && typed >= 1 && typed <= 2147483647
	case int:
		return int64(typed), typed >= 1
	default:
		return 0, false
	}
}

func backupOptionalString(value any, field string) (sql.NullString, error) {
	if value == nil {
		return sql.NullString{}, nil
	}
	text, ok := value.(string)
	if !ok {
		return sql.NullString{}, LibraryFailure{Message: "注册表字段类型不正确: " + field}
	}
	if text == "" {
		return sql.NullString{}, nil
	}
	return sql.NullString{String: text, Valid: true}, nil
}

func backupOptionalNumber(value any, field string) (sql.NullFloat64, error) {
	if value == nil {
		return sql.NullFloat64{}, nil
	}
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return sql.NullFloat64{}, LibraryFailure{Message: "注册表字段类型不正确: " + field}
		}
		return sql.NullFloat64{Float64: parsed, Valid: true}, nil
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return sql.NullFloat64{}, LibraryFailure{Message: "注册表字段类型不正确: " + field}
		}
		return sql.NullFloat64{Float64: typed, Valid: true}, nil
	default:
		return sql.NullFloat64{}, LibraryFailure{Message: "注册表字段类型不正确: " + field}
	}
}

func backupTime(value string) bool {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.000Z", "2006-01-02"} {
		if _, err := time.Parse(layout, value); err == nil {
			return true
		}
	}
	return false
}

func validReplacementPayload(snapshot, images string) bool {
	var object map[string]any
	if json.Unmarshal([]byte(snapshot), &object) != nil {
		return false
	}
	var list []any
	if json.Unmarshal([]byte(images), &list) != nil || len(list) != 4 {
		return false
	}
	for _, item := range list {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return false
		}
	}
	return true
}

func nullFloatArg(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func nullTextArg(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
