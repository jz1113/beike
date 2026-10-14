package library

import (
	"context"
	"database/sql"
	"time"
)

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
