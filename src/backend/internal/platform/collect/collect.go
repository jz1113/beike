package collect

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
)

type Result struct {
	Status int
	Body   any
}

func Product(ctx context.Context, db *sql.DB, workspace string, body map[string]any, apiKey, apiSecret string, client *http.Client) Result {
	input, message := resolveProductInput(body)
	if message != "" {
		return failureResult(http.StatusBadRequest, message)
	}
	if err := ctx.Err(); err != nil {
		return failureResult(499, "采集已取消")
	}
	if !input.forceRefresh {
		if result, ok := cachedProduct(ctx, db, workspace, input); ok {
			return result
		}
	}
	if err := ctx.Err(); err != nil {
		return failureResult(499, "采集已取消")
	}
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(apiSecret) == "" {
		return Result{Status: http.StatusBadRequest, Body: missingCredential{false, "未配置万邦 (OneBound) 电商数据采集接口凭证。请在「设置 -> 服务接口配置」中填入您的万邦 API Key 和 Secret 后再使用。", "wanbang"}}
	}
	if client == nil {
		client = network.SafeClient()
	}
	apis := []string{"item_get_pro", "item_get"}
	if input.platform == "jd" {
		apis = []string{"item_get_pro"}
	}
	var item map[string]any
	var main, details, skus []string
	apiUsed := ""
	last := collectionFailure{error: "万邦接口未返回有效商品数据", status: http.StatusBadGateway}
	for _, apiName := range apis {
		if err := ctx.Err(); err != nil {
			return failureResult(499, "采集已取消")
		}
		apiUsed = "万邦 OneBound 官方专线 (" + input.platform + "." + apiName + ")"
		data, err := fetchWanbang(ctx, client, buildWanbangURL(input, apiName, apiKey, apiSecret))
		if err != nil {
			if ctx.Err() != nil {
				return failureResult(499, "采集已取消")
			}
			var statusErr wanbangStatusError
			if errors.As(err, &statusErr) {
				last = httpFailure(statusErr.status)
				if last.stop {
					break
				}
				continue
			}
			if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
				last = collectionFailure{error: "万邦采集接口超时，请稍后重试", status: http.StatusGatewayTimeout}
				continue
			}
			last = collectionFailure{error: "连接万邦采集接口失败，请稍后重试", status: http.StatusBadGateway}
			continue
		}
		candidate, _ := data["item"].(map[string]any)
		code := stringify(data["error_code"])
		if data["error"] != nil || candidate == nil || candidate["error"] != nil || (code != "" && code != "0000" && code != "0") {
			last = wanbangFailure(data)
			if last.stop {
				break
			}
			continue
		}
		if titleFailure, failed := productTitleFailure(stringify(candidate["title"])); failed {
			last = titleFailure
			break
		}
		candidateMain := cleanProductImages(append([]any{candidate["pic_url"]}, asAny(extractURLs(candidate["item_imgs"], true))...))
		candidateDetails := cleanProductImages(asAny(extractURLs(candidate["desc_img"], false)))
		candidateSkus := cleanProductImages(append(append(asAny(extractURLs(candidate["prop_imgs"], true)), asAny(extractURLs(candidate["props_img"], true))...), asAny(extractURLs(candidate["skus"], true))...))
		if len(candidateMain) == 0 && len(candidateDetails) == 0 && len(candidateSkus) == 0 {
			last = wanbangFailure(data)
			continue
		}
		item = candidate
		main, details, skus = candidateMain, candidateDetails, candidateSkus
		break
	}
	if item == nil {
		return Result{Status: last.status, Body: failureBody(last)}
	}
	title := stringify(item["title"])
	if title == "" {
		title = "精选商品 (SKU: " + input.itemID + ")"
	}
	price := productPrice(item)
	category := firstText(item, "cat_name", "category_name", "rootCatId")
	if category == "" {
		category = "全品类"
	}
	brand := firstText(item, "brand", "nick")
	props := productProps(title, brand, category, item)
	combined := uniqueStrings(append(append(append([]string{}, main...), skus...), details...))
	picURL := ""
	if len(main) > 0 {
		picURL = main[0]
	} else if len(combined) > 0 {
		picURL = combined[0]
	}
	detail, err := json.Marshal(imagePayload{main, details, skus, props, price, brand, category})
	if err != nil {
		return failureResult(http.StatusInternalServerError, "采集遇到未知异常")
	}
	id, createdAt, err := database.SaveCollectDetail(ctx, db, workspace, input.platform, input.itemID, title, picURL, string(detail))
	if err != nil {
		return failureResult(http.StatusInternalServerError, "采集遇到未知异常")
	}
	return Result{Status: http.StatusOK, Body: freshProduct(id, input, title, price, category, brand, picURL, combined, main, details, skus, props, createdAt, apiUsed)}
}

var buildWanbangURL = func(input productInput, apiName, apiKey, apiSecret string) string {
	values := url.Values{}
	values.Set("key", apiKey)
	values.Set("secret", apiSecret)
	values.Set("num_iid", input.itemID)
	values.Set("cache", "yes")
	if input.forceRefresh {
		values.Set("cache", "no")
	}
	if input.platform == "jd" {
		values.Set("domain_type", "jd")
	} else if input.platform == "taobao" || input.platform == "1688" {
		values.Set("is_promotion", "1")
	}
	return "https://api-gw.onebound.cn/" + input.platform + "/" + apiName + "/?" + values.Encode()
}

func httpFailure(status int) collectionFailure {
	switch status {
	case http.StatusTooManyRequests:
		return collectionFailure{error: "万邦采集接口请求受限，请稍后重试", status: status, stop: true}
	case http.StatusUnauthorized, http.StatusForbidden:
		return collectionFailure{error: "万邦接口凭证或权限异常，请检查服务接口配置", status: http.StatusBadRequest, upstream: status, stop: true}
	}
	if status < 500 && status != http.StatusRequestTimeout {
		return collectionFailure{error: "万邦接口地址或请求参数异常，请检查服务接口配置", status: http.StatusBadRequest, upstream: status, stop: true}
	}
	return collectionFailure{error: "连接万邦采集接口失败，请稍后重试", status: http.StatusBadGateway}
}

func productPrice(item map[string]any) float64 {
	for _, key := range []string{"price", "orginal_price", "promotion_price"} {
		text := stringify(item[key])
		if text == "" {
			continue
		}
		parsed, err := strconv.ParseFloat(text, 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

func firstText(item map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := strings.TrimSpace(stringify(item[key])); text != "" && text != "null" {
			return text
		}
	}
	return ""
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := []string{}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
