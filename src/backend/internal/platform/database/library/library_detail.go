package library

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

var ErrLibraryDetailMissing = errors.New("library detail missing")

func LibraryDetail(ctx context.Context, db *sql.DB, workspace, assetType, id string) (json.RawMessage, error) {
	table, columns, ok := libraryAssetTable(assetType)
	if !ok {
		return nil, ErrLibraryDetailMissing
	}
	item, err := loadSharedLibraryItem(ctx, db, table, columns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	registry, status, err := libraryRegistry(ctx, db, workspace, assetType, id)
	if err != nil {
		registry, status = nil, ""
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	eligible, reason := libraryProduction(assetType, fields, status)
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason)
	return extendJSON(item, extra)
}

func libraryRegistry(ctx context.Context, db *sql.DB, workspace, assetType, id string) (json.RawMessage, string, error) {
	var row libraryRegistryRecord
	err := db.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		FROM "PromptAssetRegistry"
		WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ?`,
		workspace, assetType, id).Scan(
		&row.id, &row.workspace, &row.assetType, &row.sourceID, &row.status, &row.version, &row.provenance,
		&row.sourceRef, &row.quality, &row.confidence, &row.publishedAt, &row.disabledReason, &row.createdAt, &row.updatedAt)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	body, err := orderedJSON([]any{
		"id", row.id, "workspaceId", row.workspace, "assetType", row.assetType, "sourceAssetId", row.sourceID,
		"status", row.status, "version", row.version, "provenance", row.provenance,
		"sourceRef", libraryNullText(row.sourceRef), "qualityScore", nullFloat(row.quality), "confidence", nullFloat(row.confidence),
		"publishedAt", libraryNullText(row.publishedAt), "disabledReason", libraryNullText(row.disabledReason),
		"createdAt", row.createdAt, "updatedAt", row.updatedAt,
	})
	return body, row.status, err
}

type libraryRegistryRecord struct {
	id, workspace, assetType, sourceID, status, provenance, createdAt, updatedAt string
	version                                                                      int64
	sourceRef, publishedAt, disabledReason                                       sql.NullString
	quality, confidence                                                          sql.NullFloat64
}

func libraryNullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func nullFloat(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func extendJSON(item json.RawMessage, extra []any) (json.RawMessage, error) {
	body := bytes.TrimSuffix(bytes.TrimRight(item, "\n"), []byte("}"))
	var buf bytes.Buffer
	buf.Write(body)
	for i := 0; i < len(extra); i += 2 {
		buf.WriteByte(',')
		key, err := json.Marshal(extra[i])
		if err != nil {
			return nil, err
		}
		var value bytes.Buffer
		encoder := json.NewEncoder(&value)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(extra[i+1]); err != nil {
			return nil, err
		}
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(bytes.TrimRight(value.Bytes(), "\n"))
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func libraryProduction(assetType string, fields map[string]any, registryStatus string) (bool, any) {
	issue := visualLibraryIssue(assetType, fields)
	eligible := !placeholderLibraryIdentity(assetType, fields) && issue == ""
	if issue != "" {
		return eligible, issue
	}
	if reason := libraryBlockReason(assetType, fields, registryStatus); reason != "" {
		return eligible, reason
	}
	return eligible, nil
}

func placeholderLibraryIdentity(assetType string, fields map[string]any) bool {
	if assetType != "persona" && assetType != "outfit" {
		return false
	}
	identity := strings.TrimSpace(firstLibraryText(fields, "name", "title"))
	if identity != "" {
		return placeholderIdentityPattern.MatchString(identity)
	}
	description := strings.TrimSpace(firstLibraryText(fields, "description", "reversePrompt"))
	return description == "" || placeholderIdentityPattern.MatchString(description)
}

func visualLibraryIssue(assetType string, fields map[string]any) string {
	if assetType != "persona" && assetType != "outfit" {
		return ""
	}
	title := strings.TrimSpace(firstLibraryText(fields, "title", "name"))
	if assetType == "outfit" {
		if outfitFragmentPattern.MatchString(title) && !outfitWholePattern.MatchString(title) {
			return "仅有衣物局部，不能作为可复用穿搭；请重新拆解或修正分类"
		}
		if libraryText(fields["top"]) != "" || libraryText(fields["bottom"]) != "" {
			if !reusableOutfit(fields) {
				return "未识别到清晰的服装款式，请核对原图后修正"
			}
		}
	}
	if assetType == "persona" && personaFacePattern.MatchString(title) {
		return "没有可辨识的人物面部，不能作为人物资产"
	}
	return ""
}

func libraryBlockReason(assetType string, fields map[string]any, registryStatus string) string {
	if placeholderLibraryIdentity(assetType, fields) {
		return "占位记录，不是可用的人物或穿搭资产"
	}
	if issue := visualLibraryIssue(assetType, fields); issue != "" {
		return issue
	}
	provenance := libraryText(fields["provenance"])
	if provenance == "reference_import" || provenance == "legacy_single" {
		return "参考素材尚未转为生产资产"
	}
	status := registryStatus
	if status == "" {
		status = "published"
	}
	if status != "published" {
		return "资产尚未发布或已停用"
	}
	if assetType == "full_prompt" && !completePromptGroup(fields) {
		return "母本缺少完整的四图分镜"
	}
	return ""
}

func reusableOutfit(fields map[string]any) bool {
	for _, key := range []string{"top", "bottom"} {
		text := strings.TrimSpace(libraryText(fields[key]))
		if text == "" || unknownDetailPattern.MatchString(text) || unknownWordPattern.MatchString(text) {
			continue
		}
		if garmentPattern.MatchString(text) && !outfitFragmentPattern.MatchString(text) {
			return true
		}
	}
	return false
}

func firstLibraryText(fields map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := libraryText(fields[key]); text != "" {
			return text
		}
	}
	return ""
}

func libraryText(value any) string {
	text, _ := value.(string)
	return text
}
