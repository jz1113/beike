package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/collect"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func listProducts(ctx context.Context, db *sql.DB, workspace string, args map[string]any) string {
	if db == nil {
		return toolJSON(false, "读取商品库失败")
	}
	limit := intArgDefault(args, "limit", 10)
	if limit < 1 {
		limit = 1
	}
	if limit > 30 {
		limit = 30
	}
	keyword := strings.ToLower(textArg(args, "keyword"))
	take := limit
	if keyword != "" {
		take = 80
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "platform", "itemId", "title", "picUrl", "createdAt"
		FROM "Product" WHERE "workspaceId" = ? ORDER BY "createdAt" DESC LIMIT ?`, workspace, take)
	if err != nil {
		return toolJSON(false, "读取商品库失败")
	}
	defer rows.Close()
	products := []map[string]any{}
	for rows.Next() {
		var id, platform, itemID, title, pic, created string
		if err := rows.Scan(&id, &platform, &itemID, &title, &pic, &created); err != nil {
			return toolJSON(false, "读取商品库失败")
		}
		if keyword != "" && !strings.Contains(strings.ToLower(title), keyword) {
			continue
		}
		products = append(products, map[string]any{"id": id, "platform": platform, "itemId": itemID, "title": title, "picUrl": pic, "createdAt": created})
		if len(products) >= limit {
			break
		}
	}
	body, _ := json.Marshal(map[string]any{"success": true, "count": len(products), "products": products})
	return string(body)
}

func queryAssets(ctx context.Context, db *sql.DB, workspace string, args map[string]any) string {
	if db == nil {
		return toolJSON(false, "资产库查询失败")
	}
	limit := intArgDefault(args, "limit", 10)
	if limit < 1 {
		limit = 1
	}
	if limit > 30 {
		limit = 30
	}
	keyword := strings.ToLower(textArg(args, "keyword"))
	assetType := textArg(args, "asset_type")
	if assetType == "" {
		assetType = "all"
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "title", "category", "description" FROM "SceneAsset"
		WHERE "workspaceId" = ? ORDER BY "updatedAt" DESC LIMIT 80`, workspace)
	if err != nil {
		return toolJSON(false, "资产库查询失败")
	}
	defer rows.Close()
	assets := []map[string]any{}
	for rows.Next() {
		var id, title, category, description string
		if err := rows.Scan(&id, &title, &category, &description); err != nil {
			return toolJSON(false, "资产库查询失败")
		}
		hay := strings.ToLower(title + " " + category + " " + description)
		if keyword != "" && !strings.Contains(hay, keyword) {
			continue
		}
		if assetType != "all" && assetType != "scene" && !strings.EqualFold(category, assetType) {
			continue
		}
		assets = append(assets, map[string]any{"id": id, "title": title, "type": "scene", "code": category, "promptPreview": clipText(description, 180)})
		if len(assets) >= limit {
			break
		}
	}
	body, _ := json.Marshal(map[string]any{"success": true, "count": len(assets), "assets": assets})
	return string(body)
}

func assetDetail(ctx context.Context, db *sql.DB, workspace, id string) string {
	if db == nil || id == "" {
		return toolJSON(false, "未找到提示词资产")
	}
	var title, description, category string
	err := db.QueryRowContext(ctx, `
		SELECT "title", "description", "category" FROM "SceneAsset"
		WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&title, &description, &category)
	if err != nil {
		return toolJSON(false, "未找到提示词资产")
	}
	body, _ := json.Marshal(map[string]any{"success": true, "id": id, "title": title, "type": "scene", "prompt": description, "category": category})
	return string(body)
}

func loadWorkshopProduct(ctx context.Context, db *sql.DB, workspace, itemID string) string {
	if itemID == "" {
		return toolJSON(false, "缺少商品编号，请先查询商品库或采集商品")
	}
	if db == nil {
		return toolJSON(false, "商品资料读取失败，请稍后重试")
	}
	var title, platform, pic, detail string
	err := db.QueryRowContext(ctx, `
		SELECT "title", "platform", "picUrl", "detailUrls" FROM "Product"
		WHERE "workspaceId" = ? AND "itemId" = ? ORDER BY "createdAt" DESC LIMIT 1`, workspace, itemID).Scan(&title, &platform, &pic, &detail)
	if err != nil {
		return toolJSON(false, "该商品尚未保存，请先采集链接或从商品库选择商品")
	}
	var stored map[string]any
	_ = json.Unmarshal([]byte(detail), &stored)
	main := urlList(stored["main"])
	if len(main) == 0 {
		main = urlList(stored["mainImages"])
	}
	details := urlList(stored["details"])
	skus := urlList(stored["skus"])
	if len(main) == 0 && pic != "" {
		main = []string{pic}
	}
	if len(main) == 0 && len(details) == 0 && len(skus) == 0 {
		return toolJSON(false, "该商品没有可用图片，请先重新采集或补充图片")
	}
	if title == "" {
		title = "商品"
	}
	cover := pic
	if cover == "" && len(main) > 0 {
		cover = main[0]
	}
	body, _ := json.Marshal(map[string]any{
		"success": true, "action": "load_workshop_product", "itemId": itemID, "title": title,
		"product": map[string]any{"itemId": itemID, "title": title, "platform": platform, "price": "", "picUrl": cover},
		"images":  map[string]any{"main": main, "details": details, "skus": skus},
		"message": "商品资料已核实，已请求将图片和资料载入电商图文",
	})
	return string(body)
}

func urlList(value any) []string {
	raw, _ := value.([]any)
	out := []string{}
	for _, item := range raw {
		text, _ := item.(string)
		if strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://") || strings.HasPrefix(text, "/storage/") || strings.HasPrefix(text, "data:image/") {
			out = append(out, text)
		}
		if len(out) >= 100 {
			break
		}
	}
	return out
}

func parseProductTool(ctx context.Context, db *sql.DB, cfg config.Config, workspace, raw string) string {
	if strings.TrimSpace(raw) == "" {
		return toolJSON(false, "缺少 url")
	}
	if socialLink(raw) {
		return toolJSON(false, "社媒解析失败（请在设置中配置奇云或 APIA 解析凭证并同步到服务端）")
	}
	if db == nil {
		return toolJSON(false, "解析请求失败")
	}
	apiKey := strings.TrimSpace(os.Getenv("WANBANG_API_KEY"))
	apiSecret := strings.TrimSpace(os.Getenv("WANBANG_API_SECRET"))
	result := collect.Product(ctx, db, workspace, map[string]any{"url": raw}, apiKey, apiSecret, network.SafeClient())
	body, err := json.Marshal(result.Body)
	if err != nil {
		return toolJSON(false, "解析请求失败")
	}
	var parsed map[string]any
	if json.Unmarshal(body, &parsed) != nil || parsed["success"] != true {
		message, _ := parsed["error"].(string)
		if message == "" {
			message = "解析请求失败"
		}
		return toolJSON(false, message)
	}
	product, _ := parsed["product"].(map[string]any)
	images, _ := parsed["images"].(map[string]any)
	sample := append([]string{}, urlList(images["main"])...)
	sample = append(sample, urlList(images["skus"])...)
	if len(sample) > 6 {
		sample = sample[:6]
	}
	out, _ := json.Marshal(map[string]any{
		"success": true, "kind": "ecommerce", "sourceUrl": raw,
		"platform": product["platform"], "title": product["title"], "price": product["price"],
		"category": product["category"], "cover": product["picUrl"], "skuId": product["skuId"],
		"sampleImages": sample, "props": images["props"],
	})
	_ = cfg
	return string(out)
}

func socialLink(raw string) bool {
	text := strings.ToLower(raw)
	return strings.Contains(text, "xiaohongshu") || strings.Contains(text, "xhslink") || strings.Contains(text, "douyin") || strings.Contains(text, "kuaishou") || strings.Contains(text, "weibo") || strings.Contains(text, "bilibili")
}
