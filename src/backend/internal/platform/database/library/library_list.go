package library

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
)

type LibraryList struct {
	Total    int
	Page     int
	PageSize int
	Items    []json.RawMessage
}

func ListLibraryAssets(ctx context.Context, db *sql.DB, workspace, assetType string, page, pageSize int, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, style string) (LibraryList, error) {
	if assetType == "full_prompt" {
		return listPromptGroups(ctx, db, workspace, page, pageSize, keyword, favorite, albumID, categoryID, includeUniversal, style)
	}
	table, columns, codePrefix, keywordFields, ok := libraryListTarget(assetType)
	if !ok {
		return LibraryList{}, fmt.Errorf("unsupported list")
	}
	where, args, err := libraryListWhere(ctx, db, workspace, keyword, favorite, albumID, categoryID, includeUniversal, keywordFields, assetType, style)
	if err != nil {
		return LibraryList{}, err
	}
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "`+table+`" WHERE `+where, args...).Scan(&total); err != nil {
		return LibraryList{}, err
	}
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
	}
	listArgs := append(append([]any{}, args...), pageSize, (page-1)*pageSize)
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "`+table+`"
		WHERE `+where+`
		ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return LibraryList{}, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(columns, rows)
		if err != nil {
			return LibraryList{}, err
		}
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return LibraryList{}, err
		}
		id, _ := fields["id"].(string)
		extra := []any{"code", stableAssetCode(codePrefix, id)}
		if assetType == "scene" || assetType == "scene_bundle" {
			if source, ok := fields["sourceImages"].(string); ok && source != "" {
				sum := sha256.Sum256([]byte(source))
				extra = append(extra, "sceneSourceKey", hex.EncodeToString(sum[:])[:16])
			}
		}
		registryType := assetType
		if assetType == "scene_bundle" {
			registryType = "scene"
		}
		registry, status, err := libraryRegistry(ctx, db, workspace, registryType, id)
		if err != nil {
			registry, status = nil, ""
		}
		eligible, reason := libraryProduction(registryType, fields, status)
		if registry != nil {
			extra = append(extra, "registry", registry)
		}
		extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason)
		if assetType == "scene_bundle" {
			actions, err := listSceneActions(ctx, db, workspace, id, 4)
			if err != nil {
				return LibraryList{}, err
			}
			shots := sceneDetailShots(id, item, actions)
			extra = append(extra, "shots", shots, "shotCount", len(shots))
		}
		body, err := extendJSON(item, extra)
		if err != nil {
			return LibraryList{}, err
		}
		items = append(items, body)
	}
	if err := rows.Err(); err != nil {
		return LibraryList{}, err
	}
	return LibraryList{Total: total, Page: page, PageSize: pageSize, Items: items}, nil
}

func libraryListTarget(assetType string) (string, []assetColumn, string, []string, bool) {
	switch assetType {
	case "scene", "scene_bundle":
		return "SceneAsset", sceneAssetColumns, "S", []string{"title", "description", "reversePrompt", "tags"}, true
	case "outfit":
		return "OutfitAsset", outfitAssetColumns, "O", []string{"title", "top", "bottom", "reversePrompt", "tags"}, true
	case "action":
		return "ActionAsset", actionAssetColumns, "A", []string{"title", "action", "reversePrompt", "tags"}, true
	case "persona":
		return "PersonaAsset", personaAssetColumns, "P", []string{"name", "description", "reversePrompt", "tags"}, true
	default:
		return "", nil, "", nil, false
	}
}

func libraryListWhere(ctx context.Context, db *sql.DB, workspace, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, keywordFields []string, assetType, style string) (string, []any, error) {
	clauses := []string{`"workspaceId" IN (?, ?)`}
	args := []any{workspace, database.OfficialWorkspace}
	if favorite {
		clauses = append(clauses, `"isFavorite" = 1`)
	}
	if albumID != "" {
		clauses = append(clauses, `"albumId" = ?`)
		args = append(args, albumID)
	}
	if keyword != "" {
		likes := make([]string, 0, len(keywordFields))
		pattern := "%" + database.EscapeLike(keyword) + "%"
		for _, field := range keywordFields {
			likes = append(likes, `"`+field+`" LIKE ? ESCAPE '\'`)
			args = append(args, pattern)
		}
		clauses = append(clauses, "("+strings.Join(likes, " OR ")+")")
	}
	if style != "" && style != "all" {
		matches := styleCategoryMatches(assetType, style)
		parts := make([]string, 0, len(matches))
		for _, match := range matches {
			if !styleColumn(match.field) {
				continue
			}
			if match.exact {
				parts = append(parts, `"`+match.field+`" = ?`)
				args = append(args, match.text)
				continue
			}
			parts = append(parts, `"`+match.field+`" LIKE ? ESCAPE '\'`)
			args = append(args, "%"+database.EscapeLike(match.text)+"%")
		}
		if len(parts) > 0 {
			clauses = append(clauses, "("+strings.Join(parts, " OR ")+")")
		}
	}
	if categoryID != "" && categoryID != "all" {
		clause, clauseArgs, err := productCategoryClause(ctx, db, workspace, categoryID, includeUniversal)
		if err != nil {
			return "", nil, err
		}
		clauses = append(clauses, clause)
		args = append(args, clauseArgs...)
	}
	return strings.Join(clauses, " AND "), args, nil
}

func productCategoryClause(ctx context.Context, db *sql.DB, workspace, categoryID string, includeUniversal bool) (string, []any, error) {
	if categoryID == "unclassified" {
		return `("productCategoryIds" = '[]' AND "isUniversal" = 0)`, nil, nil
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`, workspace, database.OfficialWorkspace, categoryID)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	ids := []string{categoryID}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	parts := make([]string, 0, len(ids)+1)
	args := make([]any, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, `"productCategoryIds" LIKE ? ESCAPE '\'`)
		args = append(args, "%"+database.EscapeLike(jsonString(id))+"%")
	}
	if includeUniversal {
		parts = append(parts, `"isUniversal" = 1`)
	}
	return "(" + strings.Join(parts, " OR ") + ")", args, nil
}

func scanLibraryRow(columns []assetColumn, rows *sql.Rows) (json.RawMessage, error) {
	holders := make([]any, len(columns))
	for i, column := range columns {
		switch column.kind {
		case colInt, colNullInt, colBool:
			holders[i] = new(sql.NullInt64)
		default:
			holders[i] = new(sql.NullString)
		}
	}
	if err := rows.Scan(holders...); err != nil {
		return nil, err
	}
	fields := make([]any, 0, len(columns)*2)
	for i, column := range columns {
		fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
	}
	return orderedJSON(fields)
}

func stableAssetCode(prefix, id string) string {
	compact := nonAlnumPattern.ReplaceAllString(id, "")
	if len(compact) > 4 {
		compact = compact[len(compact)-4:]
	}
	if compact == "" {
		compact = "0000"
	}
	return prefix + "-" + strings.ToLower(compact)
}

func jsonString(value string) string {
	body, _ := json.Marshal(value)
	return string(body)
}

func DeleteLibraryAssets(ctx context.Context, db *sql.DB, workspace, assetType string, ids []string, reviewRoot string) (int, error) {
	table, column, ok := libraryDeleteTarget(assetType)
	if !ok {
		return 0, errUnsupportedAsset
	}
	if assetType == "full_prompt" {
		return deleteFullPromptAssets(ctx, db, workspace, ids)
	}
	urls, err := libraryMediaURLs(ctx, db, workspace, table, column, ids)
	if err != nil {
		return 0, err
	}
	if len(urls) > 0 {
		if err := database.WriteMediaReviews(reviewRoot, workspace, urls, ids); err != nil {
			return 0, err
		}
	}
	return deleteCurrentAssets(ctx, db, workspace, table, ids)
}

func libraryDeleteTarget(assetType string) (string, string, bool) {
	switch assetType {
	case "scene":
		return "SceneAsset", "coverUrl,sourceImages", true
	case "outfit", "action":
		return assetTableName(assetType), "coverUrl", true
	case "persona":
		return "PersonaAsset", "avatarUrl", true
	case "full_prompt":
		return "FullPromptAsset", "", true
	default:
		return "", "", false
	}
}

func assetTableName(assetType string) string {
	switch assetType {
	case "outfit":
		return "OutfitAsset"
	default:
		return "ActionAsset"
	}
}

func libraryMediaURLs(ctx context.Context, db *sql.DB, workspace, table, columns string, ids []string) ([]string, error) {
	if !libraryTable(table) {
		return nil, errUnsupportedAsset
	}
	query := `SELECT ` + quotedColumns(columns) + ` FROM "` + table + `" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + database.QuestionMarks(len(ids)) + `)`
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	urls := []string{}
	fields := strings.Split(columns, ",")
	for rows.Next() {
		values := make([]sql.NullString, len(fields))
		dest := make([]any, len(fields))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		for i, value := range values {
			if !value.Valid || value.String == "" {
				continue
			}
			if fields[i] == "sourceImages" {
				urls = append(urls, jsonStringItems(value.String)...)
				continue
			}
			urls = append(urls, value.String)
		}
	}
	return urls, rows.Err()
}

func deleteCurrentAssets(ctx context.Context, db *sql.DB, workspace, table string, ids []string) (int, error) {
	if !libraryTable(table) {
		return 0, errUnsupportedAsset
	}
	result, err := db.ExecContext(ctx, `
		DELETE FROM "`+table+`" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...)
	if err != nil {
		return 0, err
	}
	count, _ := result.RowsAffected()
	return int(count), nil
}

func deleteFullPromptAssets(ctx context.Context, db *sql.DB, workspace string, ids []string) (int, error) {
	unique := database.UniqueIDs(ids)
	var count int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(unique))+`)`,
		append([]any{workspace}, database.StringsToAny(unique)...)...).Scan(&count); err != nil {
		return 0, err
	}
	if count != len(unique) {
		return 0, errMotherMissing
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...); err != nil {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, `
		DELETE FROM "FullPromptAsset" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	committed = true
	deleted, _ := result.RowsAffected()
	return int(deleted), nil
}

func libraryTable(table string) bool {
	switch table {
	case "SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "FullPromptAsset":
		return true
	default:
		return false
	}
}

func quotedColumns(columns string) string {
	parts := strings.Split(columns, ",")
	for i, part := range parts {
		parts[i] = `"` + part + `"`
	}
	return strings.Join(parts, ", ")
}

func jsonStringItems(raw string) []string {
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	items := []string{}
	for _, item := range parsed {
		if text, ok := item.(string); ok && text != "" {
			items = append(items, text)
		}
	}
	return items
}

var (
	errUnsupportedAsset = database.ErrText("不支持的资产类型")
	errMotherMissing    = database.ErrText("所选母组不存在或不可删除")
)

type outfitSignature struct {
	fullText string
	colors   map[string]struct{}
	garments map[string]struct{}
	crafts   map[string]struct{}
	ngrams   map[string]struct{}
}

type outfitFields struct {
	title, top, bottom, shoes, colorPalette, tags string
}

var outfitColors = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"blue", regexp.MustCompile(`(?:浅蓝|天蓝|水蓝|雾霾蓝|牛仔蓝|宝蓝|藏青|藏蓝|克莱因蓝|湖蓝|湛蓝|浅天蓝|深蓝|蓝)`)},
	{"white", regexp.MustCompile(`(?:纯白|米白|奶白|冷白|暖白|象牙白|雪白|白)`)},
	{"black", regexp.MustCompile(`(?:纯黑|炭黑|深黑|墨黑|暗黑|黑)`)},
	{"gray", regexp.MustCompile(`(?:浅灰|深灰|炭灰|烟灰|麻灰|燕麦灰|银灰|灰)`)},
	{"brown", regexp.MustCompile(`(?:棕|咖|卡其|驼色|焦糖|奶黄|米黄|米色|暖棕|深棕|杏色|大地色)`)},
	{"red_pink", regexp.MustCompile(`(?:红|粉|玫红|朱红|正红|樱桃红|豆沙|橘红|酒红|绯红)`)},
	{"green", regexp.MustCompile(`(?:绿|薄荷绿|墨绿|橄榄绿|翠绿|牛油果绿|浅绿|草绿)`)},
	{"purple", regexp.MustCompile(`(?:紫|香芋紫|薰衣草紫|浅紫|深紫)`)},
	{"yellow", regexp.MustCompile(`(?:黄|明黄|柠檬黄|姜黄|鹅黄)`)},
}

var outfitGarments = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{"hoodie_knit", regexp.MustCompile(`(?:连帽|帽衫|卫衣|针织衫|针织|毛衣|开衫)`)},
	{"shirt_blouse", regexp.MustCompile(`(?:衬衫|衬衣|小方领|法式衬衫|雪纺衫)`)},
	{"suit_coat", regexp.MustCompile(`(?:西装|小西服|大衣|风衣|夹克|外套|工装)`)},
	{"tank_camisole", regexp.MustCompile(`(?:吊带|背心|抹胸|内搭|裹胸)`)},
	{"tshirt", regexp.MustCompile(`(?:t恤|短袖t|打底衫)`)},
	{"dress", regexp.MustCompile(`(?:连衣裙|连体裙|长裙|短裙|吊带裙|半身裙|伞摆|裙身|裙装|百褶裙|马面裙|旗袍)`)},
	{"pants", regexp.MustCompile(`(?:阔腿裤|牛仔裤|直筒裤|休闲裤|长裤|短裤|西装裤|微喇裤|短裙裤)`)},
}

var outfitCrafts = []string{
	"蕾丝", "荷叶边", "飞袖", "飞飞袖", "泡泡袖", "方领", "大方领", "v领", "圆领", "挂脖",
	"露肩", "一字肩", "抽绳", "系带", "盘扣", "纽扣", "真丝", "雪纺", "亚麻", "纯棉", "羊绒",
	"牛仔", "丹宁", "提花", "刺绣", "粗花呢", "小香风", "百褶", "镂空", "褶皱", "开叉",
}

var outfitNgramClean = regexp.MustCompile(`[^\x{4e00}-\x{9fa5}a-z0-9]+`)

func outfitSimilarity(left, right outfitFields) float64 {
	return signatureSimilarity(outfitSignatureOf(left), outfitSignatureOf(right))
}

func outfitSignatureOf(outfit outfitFields) outfitSignature {
	parts := []string{}
	for _, part := range []string{outfit.title, outfit.top, outfit.bottom, outfit.shoes, outfit.colorPalette, outfit.tags} {
		part = strings.TrimSpace(part)
		if part != "" {
			parts = append(parts, part)
		}
	}
	full := strings.ToLower(strings.Join(parts, " "))
	signature := outfitSignature{
		fullText: full,
		colors:   map[string]struct{}{},
		garments: map[string]struct{}{},
		crafts:   map[string]struct{}{},
		ngrams:   map[string]struct{}{},
	}
	for _, color := range outfitColors {
		if color.pattern.MatchString(full) {
			signature.colors[color.name] = struct{}{}
		}
	}
	for _, garment := range outfitGarments {
		if garment.pattern.MatchString(full) {
			signature.garments[garment.name] = struct{}{}
		}
	}
	for _, craft := range outfitCrafts {
		if strings.Contains(full, craft) {
			signature.crafts[craft] = struct{}{}
		}
	}
	clean := []rune(outfitNgramClean.ReplaceAllString(full, ""))
	for index := 0; index < len(clean)-1; index++ {
		signature.ngrams[string(clean[index:index+2])] = struct{}{}
		if index < len(clean)-2 {
			signature.ngrams[string(clean[index:index+3])] = struct{}{}
		}
	}
	return signature
}

func signatureSimilarity(left, right outfitSignature) float64 {
	if left.fullText == "" || right.fullText == "" {
		return 0
	}
	sharedColors := overlapCount(left.colors, right.colors)
	maxColors := max(len(left.colors), len(right.colors))
	colorOverlap := 0.0
	if maxColors > 0 {
		colorOverlap = float64(sharedColors) / float64(maxColors)
	}
	if len(left.colors) > 0 && len(right.colors) > 0 && sharedColors == 0 {
		return 0.15
	}
	sharedGarments := overlapCount(left.garments, right.garments)
	maxGarments := max(len(left.garments), len(right.garments))
	garmentOverlap := 0.0
	if maxGarments > 0 {
		garmentOverlap = float64(sharedGarments) / float64(maxGarments)
	}
	sharedCrafts := overlapCount(left.crafts, right.crafts)
	minCrafts := min(len(left.crafts), len(right.crafts))
	craftOverlap := 0.0
	if minCrafts > 0 {
		craftOverlap = float64(sharedCrafts) / float64(minCrafts)
	}
	sharedNgrams := overlapCount(left.ngrams, right.ngrams)
	minNgrams := min(len(left.ngrams), len(right.ngrams))
	ngramScore := 0.0
	if minNgrams > 0 {
		ngramScore = float64(sharedNgrams) / float64(minNgrams)
	}
	if sharedColors >= 1 && sharedGarments >= 1 && (ngramScore >= 0.2 || sharedCrafts >= 1) {
		return maxFloat(0.75, 0.4+colorOverlap*0.3+ngramScore*0.3)
	}
	if _, leftWhite := left.colors["white"]; leftWhite {
		if _, rightWhite := right.colors["white"]; rightWhite && sharedCrafts >= 1 && ngramScore >= 0.2 {
			return maxFloat(0.72, 0.4+craftOverlap*0.3+ngramScore*0.3)
		}
	}
	return colorOverlap*0.35 + garmentOverlap*0.35 + craftOverlap*0.15 + ngramScore*0.15
}

func overlapCount(left, right map[string]struct{}) int {
	count := 0
	for key := range left {
		if _, ok := right[key]; ok {
			count++
		}
	}
	return count
}

func maxFloat(left, right float64) float64 {
	if left > right {
		return left
	}
	return right
}
