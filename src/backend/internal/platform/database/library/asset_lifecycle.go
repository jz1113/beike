package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/database"
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

type UsageCounts struct {
	Recommended  int `json:"recommended"`
	Locked       int `json:"locked"`
	AnalysisUsed int `json:"analysisUsed"`
	Submitted    int `json:"submitted"`
	Succeeded    int `json:"succeeded"`
	Failed       int `json:"failed"`
	Accepted     int `json:"accepted"`
	Retried      int `json:"retried"`
	Rejected     int `json:"rejected"`
	Exported     int `json:"exported"`
}

type AssetQuality struct {
	Score      *float64    `json:"score"`
	Confidence float64     `json:"confidence"`
	LowSample  bool        `json:"lowSample"`
	Counts     UsageCounts `json:"counts"`
	Status     string      `json:"status"`
}

type AssetPerformance struct {
	Counts              UsageCounts   `json:"counts"`
	FirstPassAcceptRate float64       `json:"firstPassAcceptRate"`
	RetryRate           float64       `json:"retryRate"`
	Quality             *AssetQuality `json:"quality"`
}

var usageEventCounts = map[string]string{
	"recommended": "recommended", "locked": "locked", "analysis_used": "analysisUsed",
	"generation_submitted": "submitted", "generation_succeeded": "succeeded", "generation_failed": "failed",
	"output_accepted": "accepted", "retry_requested": "retried", "output_rejected": "rejected", "output_exported": "exported",
}

var registryTypeOrder = []string{"scene", "outfit", "action", "persona", "full_prompt"}

func ReadAssetPerformance(ctx context.Context, db *sql.DB, workspace, assetID string) (AssetPerformance, error) {
	counts, err := countUsageEvents(ctx, db, workspace, assetID)
	if err != nil {
		counts = UsageCounts{}
	}
	performance := AssetPerformance{
		Counts: counts, FirstPassAcceptRate: firstPassAcceptRate(counts), RetryRate: retryRate(counts),
	}
	registry, err := findRegistry(ctx, db, workspace, assetID)
	if err != nil || registry == nil {
		return performance, nil
	}
	aggregated := aggregateQualityScore(counts)
	status := registry.status
	if shouldAutoDemote(counts, aggregated.Score) && registry.status == "published" {
		status = "needs_fix"
	}
	if err := updateRegistryQuality(ctx, db, workspace, registry.id, status, aggregated.Score, aggregated.Confidence); err != nil {
		return AssetPerformance{}, err
	}
	performance.Quality = &AssetQuality{
		Score: aggregated.Score, Confidence: aggregated.Confidence, LowSample: aggregated.LowSample,
		Counts: counts, Status: status,
	}
	return performance, nil
}

type registryRow struct {
	id, status string
}

func countUsageEvents(ctx context.Context, db *sql.DB, workspace, assetID string) (UsageCounts, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "eventType" FROM "PromptAssetUsageEvent"
		WHERE "workspaceId" = ? AND "assetId" = ?
		ORDER BY "createdAt" DESC LIMIT 500`, workspace, assetID)
	if err != nil {
		return UsageCounts{}, err
	}
	defer rows.Close()
	counts := UsageCounts{}
	for rows.Next() {
		var eventType string
		if err := rows.Scan(&eventType); err != nil {
			return UsageCounts{}, err
		}
		addUsageCount(&counts, usageEventCounts[eventType])
	}
	return counts, rows.Err()
}

func addUsageCount(counts *UsageCounts, key string) {
	switch key {
	case "recommended":
		counts.Recommended++
	case "locked":
		counts.Locked++
	case "analysisUsed":
		counts.AnalysisUsed++
	case "submitted":
		counts.Submitted++
	case "succeeded":
		counts.Succeeded++
	case "failed":
		counts.Failed++
	case "accepted":
		counts.Accepted++
	case "retried":
		counts.Retried++
	case "rejected":
		counts.Rejected++
	case "exported":
		counts.Exported++
	}
}

func findRegistry(ctx context.Context, db *sql.DB, workspace, assetID string) (*registryRow, error) {
	for _, assetType := range registryTypeOrder {
		var row registryRow
		err := db.QueryRowContext(ctx, `
			SELECT "id", "status" FROM "PromptAssetRegistry"
			WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ? LIMIT 1`,
			workspace, assetType, assetID).Scan(&row.id, &row.status)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		return &row, nil
	}
	return nil, nil
}

func updateRegistryQuality(ctx context.Context, db *sql.DB, workspace, id, status string, score *float64, confidence float64) error {
	updatedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := db.ExecContext(ctx, `
		UPDATE "PromptAssetRegistry"
		SET "status" = ?, "version" = COALESCE(NULL, "version"), "disabledReason" = NULL,
			"qualityScore" = COALESCE(?, "qualityScore"), "confidence" = COALESCE(?, "confidence"),
			"publishedAt" = CASE WHEN ? = 'published' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END,
			"updatedAt" = ?
		WHERE "workspaceId" = ? AND "id" = ?`,
		status, score, confidence, status, updatedAt, updatedAt, workspace, id)
	return err
}

type qualityAggregate struct {
	Score      *float64
	Confidence float64
	LowSample  bool
}

func aggregateQualityScore(counts UsageCounts) qualityAggregate {
	lowSample := counts.Submitted < 10
	if counts.Succeeded == 0 {
		return qualityAggregate{Confidence: 0, LowSample: lowSample}
	}
	score := clampScore(
		generationSuccessRate(counts)*100*0.35 +
			firstPassAcceptRate(counts)*100*0.35 +
			(1-retryRate(counts))*100*0.15 +
			(1-rejectRate(counts))*100*0.15,
	)
	if lowSample {
		return qualityAggregate{Confidence: 0.2, LowSample: true}
	}
	return qualityAggregate{Score: &score, Confidence: 0.55, LowSample: false}
}

func shouldAutoDemote(counts UsageCounts, score *float64) bool {
	if counts.Submitted < 10 {
		return false
	}
	if score != nil && *score < 40 {
		return true
	}
	if retryRate(counts) > 0.45 && counts.Succeeded >= 10 {
		return true
	}
	if rejectRate(counts) > 0.4 {
		return true
	}
	return generationSuccessRate(counts) < 0.5 && counts.Submitted >= 10
}

func firstPassAcceptRate(counts UsageCounts) float64 {
	return ratio(float64(counts.Accepted+counts.Exported), float64(counts.Succeeded))
}

func retryRate(counts UsageCounts) float64 {
	return ratio(float64(counts.Retried), float64(counts.Succeeded))
}

func rejectRate(counts UsageCounts) float64 {
	reviewed := counts.Accepted + counts.Retried + counts.Rejected
	return ratio(float64(counts.Rejected), float64(reviewed))
}

func generationSuccessRate(counts UsageCounts) float64 {
	return ratio(float64(counts.Succeeded), float64(counts.Submitted))
}

func ratio(numerator, denominator float64) float64 {
	if denominator <= 0 {
		return 0
	}
	return numerator / denominator
}

func clampScore(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

type MotherState struct {
	Found        bool
	Replaced     bool
	Replaceable  bool
	ReplacedAt   any
	SourceImages []string
}

func MotherReplacementState(ctx context.Context, db *sql.DB, workspace, motherID string) (MotherState, error) {
	var groupIndex sql.NullInt64
	var shotPrompts, provenance, sourceImages, sourceIndices sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "groupIndex", "shotPromptsJson", "provenance", "sourceImages", "sourceImageIndices"
		FROM "FullPromptAsset"
		WHERE "id" = ? AND "workspaceId" = ?`, motherID, workspace).Scan(&groupIndex, &shotPrompts, &provenance, &sourceImages, &sourceIndices)
	if err == sql.ErrNoRows {
		return MotherState{}, nil
	}
	if err != nil {
		return MotherState{}, err
	}
	var replacedAt sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT "createdAt" FROM "FullPromptImageReplacement"
		WHERE "workspaceId" = ? AND "motherAssetId" = ? LIMIT 1`, workspace, motherID).Scan(&replacedAt)
	if err != nil && err != sql.ErrNoRows {
		return MotherState{}, err
	}
	replaced := err == nil
	images := sourceImageSelection(sourceImages.String, sourceIndices.String)
	return MotherState{
		Found:        true,
		Replaced:     replaced,
		Replaceable:  groupIndex.Valid && shotObjectCount(shotPrompts.String) == 4 && provenance.String != "workshop_generated" && !replaced,
		ReplacedAt:   formatOptionalTime(replacedAt),
		SourceImages: images,
	}, nil
}

func sourceImageSelection(imagesJSON, indicesJSON string) []string {
	var images []any
	var indices []any
	if json.Unmarshal([]byte(imagesJSON), &images) != nil || json.Unmarshal([]byte(indicesJSON), &indices) != nil {
		return []string{}
	}
	selected := []string{}
	limit := len(indices)
	if limit > 4 {
		limit = 4
	}
	for _, index := range indices[:limit] {
		number, ok := index.(float64)
		if !ok || int(number) < 1 || int(number) > len(images) {
			continue
		}
		if text, ok := images[int(number)-1].(string); ok {
			selected = append(selected, text)
		}
	}
	return selected
}

func shotObjectCount(raw string) int {
	var shots []any
	if json.Unmarshal([]byte(raw), &shots) != nil {
		return 0
	}
	count := 0
	for _, shot := range shots {
		if shot != nil {
			if _, ok := shot.(map[string]any); ok {
				count++
			}
		}
	}
	return count
}

func formatOptionalTime(value sql.NullString) any {
	if !value.Valid || value.String == "" {
		return nil
	}
	return database.FormatSQLiteTime(value.String)
}

func ListDeconstructReviews(ctx context.Context, db *sql.DB, workspace, status string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "albumName", "payload", "status", "createdAt"
		FROM "DeconstructReview"
		WHERE "workspaceId" = ? AND "status" = ?
		ORDER BY "createdAt" DESC`, workspace, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reviews := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, albumName, payload, rowStatus, createdAt string
		if err := rows.Scan(&id, &workspaceID, &albumName, &payload, &rowStatus, &createdAt); err != nil {
			return nil, err
		}
		var parsed any
		if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
			return nil, fmt.Errorf("审核内容无法读取")
		}
		reviews = append(reviews, map[string]any{
			"id": id, "workspaceId": workspaceID, "albumName": albumName,
			"payload": parsed, "status": rowStatus, "createdAt": createdAt,
		})
	}
	return reviews, rows.Err()
}

func GetDeconstructReview(ctx context.Context, db *sql.DB, workspace, id string) (string, string, string, bool, error) {
	var album, payload, status string
	err := db.QueryRowContext(ctx, `
		SELECT "albumName", "payload", "status" FROM "DeconstructReview"
		WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&album, &payload, &status)
	if err == sql.ErrNoRows {
		return "", "", "", false, nil
	}
	return album, payload, status, err == nil, err
}

func InsertDeconstructReview(ctx context.Context, db *sql.DB, workspace, id, album, payload string) error {
	_, err := db.ExecContext(ctx, `
		INSERT OR IGNORE INTO "DeconstructReview" ("id","workspaceId","albumName","payload","status","createdAt")
		VALUES (?,?,?,?, 'pending', ?)`, id, workspace, album, payload, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func UpdateDeconstructReviewStatus(ctx context.Context, db *sql.DB, workspace, id, from, to string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE "DeconstructReview" SET "status" = ?
		WHERE "workspaceId" = ? AND "id" = ? AND "status" = ?`, to, workspace, id, from)
	return err
}

func DuplicateSourceAlbumGroups(ctx context.Context, db *sql.DB, workspace string) ([][]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT GROUP_CONCAT(DISTINCT "albumId") AS "albumIds"
		FROM "FullPromptAsset"
		WHERE "workspaceId" = ? AND "albumId" IS NOT NULL AND "sourceImages" IS NOT NULL AND LENGTH("sourceImages") > 2
		GROUP BY "sourceImages"
		HAVING COUNT(DISTINCT "albumId") > 1
		LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := [][]map[string]any{}
	seen := map[string]bool{}
	for rows.Next() {
		var joined sql.NullString
		if err := rows.Scan(&joined); err != nil {
			return nil, err
		}
		if !joined.Valid || joined.String == "" {
			continue
		}
		ids := strings.Split(joined.String, ",")
		sort.Strings(ids)
		key := strings.Join(ids, ",")
		if seen[key] {
			continue
		}
		seen[key] = true
		albums, err := albumsByID(ctx, db, workspace, ids)
		if err != nil {
			return nil, err
		}
		if len(albums) > 1 {
			groups = append(groups, albums)
		}
	}
	return groups, rows.Err()
}

func albumsByID(ctx context.Context, db *sql.DB, workspace string, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "name" FROM "PromptAlbum"
		WHERE "workspaceId" IN (?, ?) AND "id" IN (`+database.QuestionMarks(len(ids))+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	albums := []map[string]any{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		albums = append(albums, map[string]any{"id": id, "name": name})
	}
	return albums, rows.Err()
}

type ImportSource struct {
	Key, RequestID, State, AlbumName, UpdatedAt string
	AlbumID                                     sql.NullString
	Found                                       bool
}

func LookupImportSource(ctx context.Context, db *sql.DB, workspace, key string) (ImportSource, error) {
	row, err := readImportSource(ctx, db, workspace, key)
	if err != nil || !row.Found {
		return row, err
	}
	if row.State == "approved" && row.AlbumID.Valid {
		var assets int
		if err := db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM "FullPromptAsset"
			WHERE "workspaceId" IN (?, ?) AND "albumId" = ?`, workspace, database.OfficialWorkspace, row.AlbumID.String).Scan(&assets); err != nil {
			return ImportSource{}, err
		}
		if assets == 0 {
			if _, err := db.ExecContext(ctx, `
				DELETE FROM "PromptImportSource"
				WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ? AND "state" = 'approved'`,
				workspace, key, row.RequestID); err != nil {
				return ImportSource{}, err
			}
			return ImportSource{}, nil
		}
	}
	if row.State != "approved" {
		var status string
		err := db.QueryRowContext(ctx, `
			SELECT "status" FROM "DeconstructReview" WHERE "workspaceId" = ? AND "id" = ?`, workspace, row.RequestID).Scan(&status)
		if err == nil {
			row.State = status
			return row, nil
		}
		if err != sql.ErrNoRows {
			return ImportSource{}, err
		}
	}
	if row.State == "processing" && staleSource(row.UpdatedAt) {
		if err := releaseStaleSource(ctx, db, workspace, row); err != nil {
			return ImportSource{}, err
		}
		return readImportSource(ctx, db, workspace, key)
	}
	return row, nil
}

func readImportSource(ctx context.Context, db *sql.DB, workspace, key string) (ImportSource, error) {
	var row ImportSource
	err := db.QueryRowContext(ctx, `
		SELECT "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt"
		FROM "PromptImportSource" WHERE "workspaceId" = ? AND "sourceKey" = ?`, workspace, key).Scan(&row.Key, &row.RequestID, &row.State, &row.AlbumName, &row.AlbumID, &row.UpdatedAt)
	if err == sql.ErrNoRows {
		return ImportSource{}, nil
	}
	if err != nil {
		return ImportSource{}, err
	}
	row.Found = true
	return row, nil
}

func staleSource(updated string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, updated)
	if err != nil {
		if parsed, err = time.Parse("2006-01-02T15:04:05.000Z", updated); err != nil {
			return false
		}
	}
	return !parsed.After(time.Now().Add(-5 * time.Minute))
}

func releaseStaleSource(ctx context.Context, db *sql.DB, workspace string, row ImportSource) error {
	var status string
	err := db.QueryRowContext(ctx, `SELECT "status" FROM "DeconstructReview" WHERE "workspaceId" = ? AND "id" = ?`, workspace, row.RequestID).Scan(&status)
	if err == nil {
		_, err = db.ExecContext(ctx, `
			UPDATE "PromptImportSource" SET "state" = ?
			WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ?`, status, workspace, row.Key, row.RequestID)
		return err
	}
	if err != sql.ErrNoRows {
		return err
	}
	if row.AlbumID.Valid {
		var assets int
		if err := db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" IN (?, ?) AND "albumId" = ?`,
			workspace, database.OfficialWorkspace, row.AlbumID.String).Scan(&assets); err != nil {
			return err
		}
		if assets > 0 {
			_, err = db.ExecContext(ctx, `
				UPDATE "PromptImportSource" SET "state" = 'approved'
				WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ?`, workspace, row.Key, row.RequestID)
			return err
		}
	}
	_, err = db.ExecContext(ctx, `
		DELETE FROM "PromptImportSource"
		WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ? AND "state" = 'processing'`,
		workspace, row.Key, row.RequestID)
	return err
}
