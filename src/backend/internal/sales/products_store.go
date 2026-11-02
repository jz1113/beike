package sales

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

var (
	errSalesProductNotFound = errors.New("商品不存在或已删除")
	errSalesProductConflict = errors.New("商品编号冲突或不属于当前工作区")
)

var validSalesProductCategories = map[string]bool{
	"beauty":  true,
	"food":    true,
	"home":    true,
	"fashion": true,
	"tech":    true,
	"other":   true,
}

var validSalesProductAudiences = map[string]bool{
	"adult_male":    true,
	"adult_female":  true,
	"senior_male":   true,
	"senior_female": true,
	"child_male":    true,
	"child_female":  true,
	"adult_unisex":  true,
	"senior_unisex": true,
	"child_unisex":  true,
	"unknown":       true,
}

type salesProductRecord struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	ProductURL         string `json:"productUrl"`
	CollectedURL       string `json:"collectedProductUrl"`
	Platform           string `json:"platform"`
	SKU                string `json:"sku"`
	Brand              string `json:"brand"`
	Category           string `json:"category"`
	CategorySource     string `json:"categorySource"`
	Audience           string `json:"audience"`
	AudienceSource     string `json:"audienceSource"`
	CoverURL           string `json:"coverUrl"`
	ImageCount         int    `json:"imageCount"`
	SelectedImageCount int    `json:"selectedImageCount"`
	HasSummary         bool   `json:"hasSummary"`
	OutputCount        int    `json:"outputCount"`
	DraftJSON          string `json:"draftJson"`
	LastOpenedAt       string `json:"lastOpenedAt"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type salesProductUpsertInput struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	ProductURL         string `json:"productUrl"`
	CollectedURL       string `json:"collectedProductUrl"`
	Platform           string `json:"platform"`
	SKU                string `json:"sku"`
	Brand              string `json:"brand"`
	Category           string `json:"category"`
	CategorySource     string `json:"categorySource"`
	Audience           string `json:"audience"`
	AudienceSource     string `json:"audienceSource"`
	CoverURL           string `json:"coverUrl"`
	ImageCount         int    `json:"imageCount"`
	SelectedImageCount int    `json:"selectedImageCount"`
	HasSummary         bool   `json:"hasSummary"`
	DraftJSON          string `json:"draftJson"`
	MarkOpened         bool   `json:"markOpened"`
}

type salesProductPatchInput struct {
	Title           *string `json:"title"`
	Category        *string `json:"category"`
	CategorySource  *string `json:"categorySource"`
	Audience        *string `json:"audience"`
	AudienceSource  *string `json:"audienceSource"`
	IncrementOutput bool    `json:"incrementOutput"`
	MarkOpened      bool    `json:"markOpened"`
}

type salesProductListFilter struct {
	Category string
	Audience string
	Query    string
}

func normalizeProductCategory(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if validSalesProductCategories[trimmed] {
		return trimmed
	}
	return "other"
}

func normalizeProductAudience(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if validSalesProductAudiences[trimmed] {
		return trimmed
	}
	return "unknown"
}

func normalizeClassificationSource(raw string) string {
	if strings.TrimSpace(raw) == "manual" {
		return "manual"
	}
	return "auto"
}

const salesProductColumns = `"id","title","productUrl","collectedProductUrl","platform","sku","brand","category","categorySource","audience","audienceSource","coverUrl","imageCount","selectedImageCount","hasSummary","outputCount","draftJson","lastOpenedAt","createdAt","updatedAt"`

func scanSalesProduct(scanner interface{ Scan(...any) error }) (salesProductRecord, error) {
	var item salesProductRecord
	var hasSummary int
	err := scanner.Scan(
		&item.ID,
		&item.Title,
		&item.ProductURL,
		&item.CollectedURL,
		&item.Platform,
		&item.SKU,
		&item.Brand,
		&item.Category,
		&item.CategorySource,
		&item.Audience,
		&item.AudienceSource,
		&item.CoverURL,
		&item.ImageCount,
		&item.SelectedImageCount,
		&hasSummary,
		&item.OutputCount,
		&item.DraftJSON,
		&item.LastOpenedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	item.HasSummary = hasSummary != 0
	return item, err
}

func matchesAudienceGroup(audience string, filter string) bool {
	if filter == "" || filter == "all" {
		return true
	}
	switch filter {
	case "senior":
		return strings.HasPrefix(audience, "senior_")
	case "child":
		return strings.HasPrefix(audience, "child_")
	case "unisex":
		return strings.HasSuffix(audience, "_unisex")
	default:
		return audience == filter
	}
}

func listSalesProducts(ctx context.Context, db *sql.DB, workspace string, filter salesProductListFilter) ([]salesProductRecord, error) {
	queryText := `SELECT ` + salesProductColumns + ` FROM "SalesProduct" WHERE "workspaceId"=?`
	args := []any{workspace}
	if cat := strings.TrimSpace(filter.Category); cat != "" && cat != "all" {
		queryText += ` AND "category"=?`
		args = append(args, cat)
	}
	if q := strings.TrimSpace(filter.Query); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		queryText += ` AND (lower("title") LIKE ? OR lower("sku") LIKE ? OR lower("brand") LIKE ? OR lower("productUrl") LIKE ?)`
		args = append(args, like, like, like, like)
	}
	queryText += ` ORDER BY "updatedAt" DESC, "id" DESC LIMIT 200`

	rows, err := db.QueryContext(ctx, queryText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	audFilter := strings.TrimSpace(filter.Audience)
	items := []salesProductRecord{}
	for rows.Next() {
		item, err := scanSalesProduct(rows)
		if err != nil {
			return nil, err
		}
		if !matchesAudienceGroup(item.Audience, audFilter) {
			continue
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func getSalesProductByID(ctx context.Context, db *sql.DB, workspace string, id string) (salesProductRecord, error) {
	row := db.QueryRowContext(ctx, `SELECT `+salesProductColumns+` FROM "SalesProduct" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	item, err := scanSalesProduct(row)
	if errors.Is(err, sql.ErrNoRows) {
		return salesProductRecord{}, errSalesProductNotFound
	}
	return item, err
}

// upsertSalesProduct 按 id 或同工作区下的规范化采集地址幂等写入商品快照，避免重复建档。
func upsertSalesProduct(ctx context.Context, db *sql.DB, workspace string, input salesProductUpsertInput) (salesProductRecord, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return salesProductRecord{}, err
	}
	defer tx.Rollback()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := strings.TrimSpace(input.ID)
	collected := strings.TrimSpace(input.CollectedURL)

	if id == "" && collected != "" {
		_ = tx.QueryRowContext(
			ctx,
			`SELECT "id" FROM "SalesProduct" WHERE "workspaceId"=? AND "collectedProductUrl"=? ORDER BY "updatedAt" DESC LIMIT 1`,
			workspace,
			collected,
		).Scan(&id)
	}
	if id == "" {
		id = "sprod_" + httpx.RequestID()
	}

	category := normalizeProductCategory(input.Category)
	categorySource := normalizeClassificationSource(input.CategorySource)
	audience := normalizeProductAudience(input.Audience)
	audienceSource := normalizeClassificationSource(input.AudienceSource)
	draftJSON := strings.TrimSpace(input.DraftJSON)
	if draftJSON == "" {
		draftJSON = "{}"
	}
	hasSummary := 0
	if input.HasSummary {
		hasSummary = 1
	}
	lastOpened := ""
	if input.MarkOpened {
		lastOpened = now
	}
	imageCount := max(0, input.ImageCount)
	selectedCount := max(0, input.SelectedImageCount)

	res, err := tx.ExecContext(
		ctx,
		`INSERT INTO "SalesProduct" (
			"id","workspaceId","title","productUrl","collectedProductUrl","platform","sku","brand",
			"category","categorySource","audience","audienceSource","coverUrl",
			"imageCount","selectedImageCount","hasSummary","outputCount","draftJson",
			"lastOpenedAt","createdAt","updatedAt"
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)
		ON CONFLICT("id") DO UPDATE SET
			"title"=excluded."title",
			"productUrl"=excluded."productUrl",
			"collectedProductUrl"=excluded."collectedProductUrl",
			"platform"=excluded."platform",
			"sku"=excluded."sku",
			"brand"=excluded."brand",
			"category"=excluded."category",
			"categorySource"=excluded."categorySource",
			"audience"=excluded."audience",
			"audienceSource"=excluded."audienceSource",
			"coverUrl"=excluded."coverUrl",
			"imageCount"=excluded."imageCount",
			"selectedImageCount"=excluded."selectedImageCount",
			"hasSummary"=excluded."hasSummary",
			"draftJson"=excluded."draftJson",
			"lastOpenedAt"=CASE WHEN excluded."lastOpenedAt"<>'' THEN excluded."lastOpenedAt" ELSE "SalesProduct"."lastOpenedAt" END,
			"updatedAt"=excluded."updatedAt"
		WHERE "SalesProduct"."workspaceId"=excluded."workspaceId"`,
		id,
		workspace,
		strings.TrimSpace(input.Title),
		strings.TrimSpace(input.ProductURL),
		collected,
		strings.TrimSpace(input.Platform),
		strings.TrimSpace(input.SKU),
		strings.TrimSpace(input.Brand),
		category,
		categorySource,
		audience,
		audienceSource,
		strings.TrimSpace(input.CoverURL),
		imageCount,
		selectedCount,
		hasSummary,
		draftJSON,
		lastOpened,
		now,
		now,
	)
	if err != nil {
		return salesProductRecord{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return salesProductRecord{}, err
	}
	if affected == 0 {
		return salesProductRecord{}, errSalesProductConflict
	}

	row := tx.QueryRowContext(ctx, `SELECT `+salesProductColumns+` FROM "SalesProduct" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	saved, err := scanSalesProduct(row)
	if err != nil {
		return salesProductRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return salesProductRecord{}, err
	}
	return saved, nil
}
