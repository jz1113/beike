package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"strings"
	"time"
)

type LifecycleError struct {
	Message string
	Status  int
	Code    string
}

func (e *LifecycleError) Error() string { return e.Message }

type AssetRegistry struct {
	ID             string   `json:"id"`
	WorkspaceID    string   `json:"workspaceId"`
	AssetType      string   `json:"assetType"`
	SourceAssetID  string   `json:"sourceAssetId"`
	Status         string   `json:"status"`
	Version        int      `json:"version"`
	Provenance     string   `json:"provenance"`
	SourceRef      *string  `json:"sourceRef"`
	QualityScore   *float64 `json:"qualityScore"`
	Confidence     *float64 `json:"confidence"`
	PublishedAt    *string  `json:"publishedAt"`
	DisabledReason *string  `json:"disabledReason"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

var lifecycleNext = map[string]string{
	"submit-review": "pending_review",
	"publish":       "published",
	"disable":       "disabled",
}

var lifecycleTransitions = map[string][]string{
	"draft":          {"pending_review", "archived"},
	"pending_review": {"published", "needs_fix", "draft", "archived"},
	"published":      {"needs_fix", "disabled", "archived"},
	"needs_fix":      {"pending_review", "published", "disabled", "archived"},
	"disabled":       {"published", "archived"},
	"archived":       {},
}

func ApplyAssetLifecycle(ctx context.Context, db *sql.DB, workspace, assetType, sourceID, action, reason string) (AssetRegistry, error) {
	current, err := ensureAssetRegistry(ctx, db, workspace, assetType, sourceID)
	if err != nil {
		return AssetRegistry{}, err
	}
	if action == "create-version" {
		return upsertAssetRegistry(ctx, db, workspace, registryWrite{
			assetType: assetType, sourceID: sourceID, status: "pending_review",
			provenance: current.Provenance, sourceRef: current.SourceRef, version: current.Version + 1,
		})
	}
	next, ok := lifecycleNext[action]
	if !ok {
		return AssetRegistry{}, &LifecycleError{Message: "不支持的资产生命周期操作", Status: 400, Code: "invalid_action"}
	}
	if !canTransitionAsset(current.Status, next) {
		return AssetRegistry{}, &LifecycleError{
			Message: "当前状态 " + current.Status + " 不能执行 " + action,
			Status:  409, Code: "illegal_transition",
		}
	}
	disabled := sql.NullString{}
	if action == "disable" {
		if reason == "" {
			reason = "人工停用"
		}
		disabled = sql.NullString{String: reason, Valid: true}
	}
	if err := updateAssetRegistryStatus(ctx, db, workspace, current.ID, next, disabled); err != nil {
		return AssetRegistry{}, err
	}
	row, err := getAssetRegistry(ctx, db, workspace, assetType, sourceID)
	if err != nil || row == nil {
		return AssetRegistry{}, &LifecycleError{Message: "资产生命周期操作失败", Status: 400, Code: "bad_request"}
	}
	return *row, nil
}

func canTransitionAsset(from, to string) bool {
	for _, candidate := range lifecycleTransitions[from] {
		if candidate == to {
			return true
		}
	}
	return false
}

func ensureAssetRegistry(ctx context.Context, db *sql.DB, workspace, assetType, sourceID string) (AssetRegistry, error) {
	existing, err := getAssetRegistry(ctx, db, workspace, assetType, sourceID)
	if err != nil {
		return AssetRegistry{}, err
	}
	if existing != nil {
		return *existing, nil
	}
	if _, err := insertAssetRegistry(ctx, db, workspace, registryWrite{
		assetType: assetType, sourceID: sourceID, status: "published", provenance: "manual", version: 1,
	}); err != nil {
		return AssetRegistry{}, err
	}
	row, err := getAssetRegistry(ctx, db, workspace, assetType, sourceID)
	if err != nil || row == nil {
		return AssetRegistry{}, &LifecycleError{Message: "资产生命周期操作失败", Status: 400, Code: "bad_request"}
	}
	return *row, nil
}

type registryWrite struct {
	assetType  string
	sourceID   string
	status     string
	provenance string
	sourceRef  *string
	version    int
}

func insertAssetRegistry(ctx context.Context, db *sql.DB, workspace string, input registryWrite) (bool, error) {
	id, err := database.NewID()
	if err != nil {
		return false, err
	}
	now := lifecycleNow()
	var published any
	if input.status == "published" {
		published = now
	}
	version := input.version
	if version == 0 {
		version = 1
	}
	provenance := input.provenance
	if provenance == "" {
		provenance = "manual"
	}
	result, err := db.ExecContext(ctx, `
		INSERT INTO "PromptAssetRegistry" (
			"id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)
		ON CONFLICT ("workspaceId", "assetType", "sourceAssetId") DO NOTHING`,
		"reg_"+id, workspace, input.assetType, input.sourceID, input.status, version, provenance,
		nullableText(input.sourceRef), published, now, now)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count > 0, err
}

func upsertAssetRegistry(ctx context.Context, db *sql.DB, workspace string, input registryWrite) (AssetRegistry, error) {
	inserted, err := insertAssetRegistry(ctx, db, workspace, input)
	if err != nil {
		return AssetRegistry{}, err
	}
	if !inserted {
		now := lifecycleNow()
		if _, err := db.ExecContext(ctx, `
			UPDATE "PromptAssetRegistry"
			SET "status" = ?, "provenance" = COALESCE(?, "provenance"), "sourceRef" = COALESCE(?, "sourceRef"),
				"version" = COALESCE(?, "version"),
				"publishedAt" = CASE WHEN ? = 'published' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END,
				"disabledReason" = CASE WHEN ? = 'disabled' THEN "disabledReason" ELSE NULL END,
				"updatedAt" = ?
			WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ?`,
			input.status, nullableText(stringPtr(input.provenance)), nullableText(input.sourceRef), positiveOrNil(input.version),
			input.status, now, input.status, now, workspace, input.assetType, input.sourceID); err != nil {
			return AssetRegistry{}, err
		}
	}
	row, err := getAssetRegistry(ctx, db, workspace, input.assetType, input.sourceID)
	if err != nil || row == nil {
		return AssetRegistry{}, &LifecycleError{Message: "资产生命周期操作失败", Status: 400, Code: "bad_request"}
	}
	return *row, nil
}

func updateAssetRegistryStatus(ctx context.Context, db *sql.DB, workspace, id, status string, disabled sql.NullString) error {
	now := lifecycleNow()
	var reason any
	if disabled.Valid {
		reason = disabled.String
	}
	_, err := db.ExecContext(ctx, `
		UPDATE "PromptAssetRegistry"
		SET "status" = ?, "version" = COALESCE(NULL, "version"), "disabledReason" = ?,
			"qualityScore" = COALESCE(NULL, "qualityScore"), "confidence" = COALESCE(NULL, "confidence"),
			"publishedAt" = CASE WHEN ? = 'published' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END,
			"updatedAt" = ?
		WHERE "workspaceId" = ? AND "id" = ?`,
		status, reason, status, now, now, workspace, id)
	return err
}

func getAssetRegistry(ctx context.Context, db *sql.DB, workspace, assetType, sourceID string) (*AssetRegistry, error) {
	var row AssetRegistry
	var sourceRef, publishedAt, disabledReason sql.NullString
	var quality, confidence sql.NullFloat64
	err := db.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		FROM "PromptAssetRegistry"
		WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ? LIMIT 1`,
		workspace, assetType, sourceID).Scan(
		&row.ID, &row.WorkspaceID, &row.AssetType, &row.SourceAssetID, &row.Status, &row.Version, &row.Provenance,
		&sourceRef, &quality, &confidence, &publishedAt, &disabledReason, &row.CreatedAt, &row.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	row.SourceRef = nullStringPtr(sourceRef)
	row.QualityScore = nullFloatPtr(quality)
	row.Confidence = nullFloatPtr(confidence)
	row.PublishedAt = nullStringPtr(publishedAt)
	row.DisabledReason = nullStringPtr(disabledReason)
	return &row, nil
}

func lifecycleNow() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func nullableText(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func stringPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func positiveOrNil(value int) any {
	if value <= 0 {
		return nil
	}
	return value
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullFloatPtr(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}
