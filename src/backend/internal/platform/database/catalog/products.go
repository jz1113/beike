package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/media"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var ErrProductMissing = errors.New("记录不存在")

func ListProducts(ctx context.Context, db *sql.DB, workspace string, page, pageSize int) (int, []map[string]any, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Product" WHERE "workspaceId" = ?`, workspace).Scan(&total); err != nil {
		return 0, nil, err
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt"
		FROM "Product" WHERE "workspaceId" = ?
		ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, workspace, pageSize, (page-1)*pageSize)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	products := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, platform, createdAt string
		var itemID, title, picURL, detailURLs sql.NullString
		if err := rows.Scan(&id, &workspaceID, &platform, &itemID, &title, &picURL, &detailURLs, &createdAt); err != nil {
			return 0, nil, err
		}
		cleaned, count := cleanDetailURLs(database.NullText(detailURLs))
		products = append(products, map[string]any{
			"id": id, "workspaceId": workspaceID, "platform": platform,
			"itemId": database.NullText(itemID), "title": database.NullText(title),
			"picUrl":     cleanProductCover(database.StringValue(picURL), cleaned),
			"detailUrls": cleaned, "createdAt": database.FormatSQLiteTime(createdAt), "imageCount": count,
		})
	}
	return total, products, rows.Err()
}

func cleanDetailURLs(raw any) (any, int) {
	text, ok := raw.(string)
	if !ok || text == "" {
		return raw, 0
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return text, 0
	}
	groups := [3][]string{}
	keys := []string{"main", "skus", "details"}
	for index, key := range keys {
		if list, ok := parsed[key].([]any); ok {
			for _, item := range list {
				if address, ok := item.(string); ok {
					groups[index] = append(groups[index], address)
				}
			}
		}
	}
	groups[0], groups[1], groups[2] = media.ProductImageGroups(groups[0], groups[1], groups[2])
	count := 0
	for index, key := range keys {
		parsed[key] = groups[index]
		count += len(groups[index])
	}
	if metadata := ReadProductVariantMetadata(parsed["variantMetadata"]); metadata != nil {
		images := append(append(append([]string{}, groups[0]...), groups[1]...), groups[2]...)
		parsed["variantMetadata"] = AlignProductVariantImages(metadata, images)
	}
	body, err := json.Marshal(parsed)
	if err != nil {
		return text, 0
	}
	return string(body), count
}

func SaveCollectedProduct(ctx context.Context, db *sql.DB, workspace, platform, itemID, title, cleanPicURL string, savedImages []string) (map[string]any, error) {
	detailURLs, err := json.Marshal(map[string]any{"main": savedImages})
	if err != nil {
		return nil, err
	}
	var id, createdAt string
	var existingPic, existingDetail sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT "id", "createdAt", "picUrl", "detailUrls" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &createdAt, &existingPic, &existingDetail)
	mergedDetail := mergeProductDetail(database.StringValue(existingDetail), string(detailURLs))
	picURL := cleanPicURL
	if picURL == "" {
		picURL = media.NormalizeImageURLToStandardJpg(database.StringValue(existingPic))
	}
	if errors.Is(err, sql.ErrNoRows) {
		id, err = database.RandomHex()
		if err != nil {
			return nil, err
		}
		createdAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		if picURL == "" {
			picURL = cleanPicURL
		}
		_, err = db.ExecContext(ctx, `
			INSERT INTO "Product" ("id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, workspace, platform, itemID, title, picURL, mergedDetail, createdAt)
	} else if err != nil {
		return nil, err
	} else {
		_, err = db.ExecContext(ctx, `
			UPDATE "Product" SET "title" = ?, "picUrl" = ?, "detailUrls" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, title, picURL, mergedDetail, id, workspace)
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "platform": platform, "itemId": itemID,
		"title": title, "picUrl": picURL, "detailUrls": mergedDetail, "createdAt": database.FormatSQLiteTime(createdAt),
	}, nil
}

func UpdateProduct(ctx context.Context, db *sql.DB, workspace, id string, title, itemID, picURL *string, detailURLs *string) (map[string]any, error) {
	current, err := loadProduct(ctx, db, workspace, id)
	if err != nil {
		return nil, err
	}
	if title != nil {
		current["title"] = *title
	}
	if itemID != nil {
		current["itemId"] = *itemID
	}
	if picURL != nil {
		current["picUrl"] = *picURL
	}
	if detailURLs != nil {
		previous, _ := current["detailUrls"].(string)
		current["detailUrls"] = mergeProductDetail(previous, *detailURLs)
	}
	_, err = db.ExecContext(ctx, `
		UPDATE "Product" SET "title" = ?, "itemId" = ?, "picUrl" = ?, "detailUrls" = ?
		WHERE "id" = ? AND "workspaceId" = ?`,
		current["title"], current["itemId"], current["picUrl"], current["detailUrls"], id, workspace)
	if err != nil {
		return nil, err
	}
	return current, nil
}

func loadProduct(ctx context.Context, db *sql.DB, workspace, id string) (map[string]any, error) {
	var platform, createdAt string
	var itemID, title, picURL, detailURLs sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt"
		FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&platform, &itemID, &title, &picURL, &detailURLs, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrProductMissing
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "platform": platform,
		"itemId": database.NullText(itemID), "title": database.NullText(title), "picUrl": database.NullText(picURL),
		"detailUrls": database.NullText(detailURLs), "createdAt": database.FormatSQLiteTime(createdAt),
	}, nil
}

func DeleteProduct(ctx context.Context, db *sql.DB, workspace, id, storageRoot string) error {
	var pic, details sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "picUrl", "detailUrls" FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&pic, &details)
	if err == sql.ErrNoRows {
		return ErrProductMissing
	}
	if err != nil {
		return err
	}
	removeLocalProductMedia(storageRoot, productMediaURLs(database.NullText(pic), database.NullText(details)))
	result, err := db.ExecContext(ctx, `DELETE FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	if err != nil {
		return err
	}
	deleted, _ := result.RowsAffected()
	if deleted != 1 {
		return ErrProductMissing
	}
	return nil
}

func productMediaURLs(pic, details any) []string {
	urls := []string{}
	if text, ok := pic.(string); ok && text != "" {
		urls = append(urls, text)
	}
	raw, ok := details.(string)
	if !ok || raw == "" {
		return urls
	}
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return urls
	}
	for _, item := range parsed {
		if text, ok := item.(string); ok && text != "" {
			urls = append(urls, text)
		}
	}
	return urls
}

func removeLocalProductMedia(root string, urls []string) {
	for _, raw := range urls {
		target := deletableStorageFile(root, raw)
		if target == "" {
			continue
		}
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			continue
		}
	}
}

func deletableStorageFile(root, raw string) string {
	if strings.TrimSpace(root) == "" || !strings.HasPrefix(raw, "/storage/azhuo/") {
		return ""
	}
	pathOnly := raw
	if index := strings.IndexAny(pathOnly, "?#"); index >= 0 {
		pathOnly = pathOnly[:index]
	}
	if strings.Contains(pathOnly, "%") {
		return ""
	}
	relative, err := url.PathUnescape(strings.TrimPrefix(pathOnly, "/storage/"))
	if err != nil || strings.Contains(relative, "\\") || strings.Contains(relative, "\x00") {
		return ""
	}
	segments := strings.Split(relative, "/")
	for _, segment := range segments {
		if segment == "" || segment == ".." || segment == "." {
			return ""
		}
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return ""
	}
	current := realRoot
	for _, segment := range segments {
		current = filepath.Join(current, segment)
		info, err := os.Lstat(current)
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return ""
		}
	}
	info, err := os.Lstat(current)
	if err != nil || !info.Mode().IsRegular() {
		return ""
	}
	within, err := filepath.Rel(realRoot, current)
	if err != nil || within == "." || strings.HasPrefix(within, "..") || filepath.IsAbs(within) {
		return ""
	}
	return current
}

func productDetailObject(raw string) map[string]any {
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return nil
	}
	if object, ok := value.(map[string]any); ok {
		return object
	}
	if list, ok := value.([]any); ok {
		return map[string]any{"main": list}
	}
	return nil
}

func detailImageList(value any) []string {
	result := []string{}
	switch list := value.(type) {
	case []string:
		return list
	case []any:
		for _, item := range list {
			if source, ok := item.(string); ok {
				result = append(result, source)
			}
		}
	}
	return result
}

func detailImageKey(source string) string {
	if image, ok := media.ParseProductImage(source); ok {
		return image.Key
	}
	return source
}

// Generic product saves often send a flattened main array. Preserve known group
// ownership and all omitted metadata instead of replacing the collected detail.
func mergeProductDetail(previous, incoming string) string {
	old, next := productDetailObject(previous), productDetailObject(incoming)
	if next == nil {
		if old != nil {
			return previous
		}
		return incoming
	}
	if old == nil {
		old = map[string]any{}
	}
	groups := []string{"main", "skus", "details"}
	ownership := map[string]string{}
	for _, group := range groups {
		for _, source := range detailImageList(old[group]) {
			key := detailImageKey(source)
			if ownership[key] == "" {
				ownership[key] = group
			}
		}
	}
	for key, value := range next {
		if key != "main" && key != "skus" && key != "details" {
			if value == nil {
				continue
			}
			if key == "variantMetadata" && ReadProductVariantMetadata(value) == nil {
				continue
			}
			old[key] = value
		}
	}
	for _, group := range groups {
		for _, source := range detailImageList(next[group]) {
			key := detailImageKey(source)
			owner := ownership[key]
			if owner == "" {
				owner = group
				ownership[key] = group
			}
			old[owner] = append(detailImageList(old[owner]), source)
		}
	}
	body, err := json.Marshal(old)
	if err != nil {
		return previous
	}
	cleaned, _ := cleanDetailURLs(string(body))
	result, _ := cleaned.(string)
	return result
}

// Keep the list cover on the same best-quality URL selected for its resource.
func cleanProductCover(source string, detailURLs any) string {
	cover, _, _ := media.ProductImageGroups([]string{source}, nil, nil)
	text, _ := detailURLs.(string)
	var groups struct {
		Main, Skus, Details []string
	}
	_ = json.Unmarshal([]byte(text), &groups)
	requested, valid := media.ParseProductImage(source)
	first := ""
	for _, addresses := range [][]string{groups.Main, groups.Skus, groups.Details} {
		for _, address := range addresses {
			if first == "" {
				first = address
			}
			image, ok := media.ParseProductImage(address)
			if (valid && ok && image.Key == requested.Key) || address == source {
				return address
			}
		}
	}
	if len(cover) > 0 {
		return cover[0]
	}
	return first
}

type ProductColorVariant struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Color     string   `json:"color,omitempty"`
	SKUIDs    []string `json:"skuIds"`
	ImageURLs []string `json:"imageUrls"`
}

type ProductVariantMetadata struct {
	Version           int                   `json:"version"`
	Variants          []ProductColorVariant `json:"variants"`
	RequestedSKUID    string                `json:"requestedSkuId,omitempty"`
	SelectedVariantID string                `json:"selectedVariantId,omitempty"`
}

// ReadProductVariantMetadata rejects malformed historical data without inventing evidence.
func ReadProductVariantMetadata(value any) *ProductVariantMetadata {
	body, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var result ProductVariantMetadata
	if json.Unmarshal(body, &result) != nil || result.Version != 1 || result.Variants == nil {
		return nil
	}
	ids := map[string]bool{}
	for index := range result.Variants {
		variant := &result.Variants[index]
		variant.ID, variant.Label = strings.TrimSpace(variant.ID), strings.TrimSpace(variant.Label)
		if variant.ID == "" || variant.Label == "" || ids[variant.ID] || variant.SKUIDs == nil || variant.ImageURLs == nil {
			return nil
		}
		ids[variant.ID] = true
	}
	if result.SelectedVariantID != "" && !ids[result.SelectedVariantID] {
		return nil
	}
	return &result
}

// AlignProductVariantImages keeps references on the actual complete catalog URL,
// including a higher-quality copy owned by a different image group.
func AlignProductVariantImages(metadata *ProductVariantMetadata, images []string) *ProductVariantMetadata {
	if metadata == nil {
		return nil
	}
	catalog := map[string]string{}
	for _, source := range images {
		if image, ok := media.ParseProductImage(source); ok {
			catalog[image.Key] = source
		} else {
			catalog[source] = source
		}
	}
	result := *metadata
	result.Variants = make([]ProductColorVariant, 0, len(metadata.Variants))
	for _, variant := range metadata.Variants {
		urls := []string{}
		seen := map[string]bool{}
		for _, source := range variant.ImageURLs {
			key := source
			if image, ok := media.ParseProductImage(source); ok {
				key = image.Key
			}
			if actual := catalog[key]; actual != "" && !seen[actual] {
				urls = append(urls, actual)
				seen[actual] = true
			}
		}
		variant.ImageURLs = urls
		result.Variants = append(result.Variants, variant)
	}
	return &result
}
