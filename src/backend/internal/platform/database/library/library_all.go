package library

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
)

type LibraryAll struct {
	Page        int
	HasMore     bool
	Scenes      []json.RawMessage
	Outfits     []json.RawMessage
	Actions     []json.RawMessage
	Personas    []json.RawMessage
	FullPrompts []json.RawMessage
}

func ListAllLibraryAssets(ctx context.Context, db *sql.DB, workspace string, page int, slim bool) (LibraryAll, error) {
	scenes, err := listAllScenes(ctx, db, workspace, page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	outfits, err := listAllSimple(ctx, db, workspace, "outfit", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	actions, err := listAllSimple(ctx, db, workspace, "action", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	personas, err := listAllSimple(ctx, db, workspace, "persona", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	prompts, err := listPromptGroups(ctx, db, workspace, page, 1000, "", false, "", "", true, "")
	if err != nil {
		return LibraryAll{}, err
	}
	fullPrompts := prompts.Items
	if slim {
		fullPrompts, err = slimPromptItems(fullPrompts)
		if err != nil {
			return LibraryAll{}, err
		}
	}
	result := LibraryAll{Page: page, Scenes: scenes, Outfits: outfits, Actions: actions, Personas: personas, FullPrompts: fullPrompts}
	result.HasMore = len(scenes) == 1000 || len(outfits) == 1000 || len(actions) == 1000 || len(personas) == 1000 || len(fullPrompts) == 1000
	return result, nil
}

func listAllScenes(ctx context.Context, db *sql.DB, workspace string, page int, slim bool) ([]json.RawMessage, error) {
	rows, err := queryLibraryPage(ctx, db, "SceneAsset", sceneAssetColumns, workspace, page)
	if err != nil {
		return nil, err
	}
	items := []json.RawMessage{}
	for _, item := range rows {
		body, err := decorateAllScene(ctx, db, workspace, item)
		if err != nil {
			return nil, err
		}
		if slim {
			body, err = slimLibraryItem(body, []string{"shotCount", "spatialType", "lighting", "description", "sceneSourceKey"})
			if err != nil {
				return nil, err
			}
		}
		items = append(items, body)
	}
	return items, nil
}

func decorateAllScene(ctx context.Context, db *sql.DB, workspace string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
	extra := []any{"code", stableAssetCode("S", id)}
	if source, ok := fields["sourceImages"].(string); ok && source != "" {
		sum := sha256.Sum256([]byte(source))
		extra = append(extra, "sceneSourceKey", hex.EncodeToString(sum[:])[:16])
	}
	actions, err := listSceneActions(ctx, db, workspace, id, 4)
	if err != nil {
		return nil, err
	}
	registry, status, err := libraryRegistry(ctx, db, workspace, "scene", id)
	if err != nil {
		registry, status = nil, ""
	}
	eligible, reason := libraryProduction("scene", fields, status)
	extra = append([]any{"actions", actions}, extra...)
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	shots := sceneDetailShots(id, item, actions)
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "shots", shots, "shotCount", len(shots))
	return extendJSON(item, extra)
}

func listAllSimple(ctx context.Context, db *sql.DB, workspace, assetType string, page int, slim bool) ([]json.RawMessage, error) {
	table, columns, prefix, _, ok := libraryListTarget(assetType)
	if !ok {
		return nil, nil
	}
	rows, err := queryLibraryPage(ctx, db, table, columns, workspace, page)
	if err != nil {
		return nil, err
	}
	items := []json.RawMessage{}
	for _, item := range rows {
		body, err := decorateAllSimple(ctx, db, workspace, assetType, prefix, item)
		if err != nil {
			return nil, err
		}
		if slim {
			extra := []string{}
			if assetType == "action" {
				extra = []string{"action", "camera"}
			}
			if assetType == "persona" {
				extra = []string{"description"}
			}
			body, err = slimLibraryItem(body, extra)
			if err != nil {
				return nil, err
			}
		}
		items = append(items, body)
	}
	return items, nil
}

func decorateAllSimple(ctx context.Context, db *sql.DB, workspace, assetType, prefix string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
	registry, status, err := libraryRegistry(ctx, db, workspace, assetType, id)
	if err != nil {
		registry, status = nil, ""
	}
	eligible, reason := libraryProduction(assetType, fields, status)
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "code", stableAssetCode(prefix, id))
	if assetType == "outfit" || assetType == "persona" {
		extra = append(extra, "appearanceAudience", appearanceAudience(fields, assetType == "outfit"))
	}
	return extendJSON(item, extra)
}

func queryLibraryPage(ctx context.Context, db *sql.DB, table string, columns []assetColumn, workspace string, page int) ([]json.RawMessage, error) {
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
	}
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "`+table+`"
		WHERE "workspaceId" IN (?, ?)
		ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC
		LIMIT 1000 OFFSET ?`, workspace, database.OfficialWorkspace, (page-1)*1000)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(columns, rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func slimPromptItems(items []json.RawMessage) ([]json.RawMessage, error) {
	slimmed := []json.RawMessage{}
	for _, item := range items {
		body, err := slimLibraryItem(item, []string{
			"albumName", "productCategoryIds", "productSubcategory", "isUniversal", "sceneSummary", "outfitSummary",
			"actionSummary", "personaSummary", "sourceImageIndex", "sourceImageIndices", "groupIndex", "displayNumber",
			"contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson", "hasHuman", "provenance",
			"sourceMother", "imageReplaced", "imageReplaceable",
		})
		if err != nil {
			return nil, err
		}
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return nil, err
		}
		if preview := promptPreview(libraryText(fields["reversePromptZh"])); preview != "" {
			body, err = extendJSON(body, []any{"promptPreview", preview})
			if err != nil {
				return nil, err
			}
		}
		slimmed = append(slimmed, body)
	}
	return slimmed, nil
}

func promptPreview(text string) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) == 0 {
		return ""
	}
	if len(runes) > 80 {
		return string(runes[:80])
	}
	return text
}

func slimLibraryItem(item json.RawMessage, extra []string) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	if fields["title"] == nil {
		if name := fields["name"]; name != nil {
			fields["title"] = name
		}
	}
	if fields["coverUrl"] == nil {
		if avatar := fields["avatarUrl"]; avatar != nil {
			fields["coverUrl"] = avatar
		}
	}
	keys := append([]string{
		"id", "title", "name", "tags", "dimensions", "appearanceAudience", "category", "isFavorite", "usageCount",
		"createdAt", "updatedAt", "code", "coverUrl", "suitableAnatomy", "shotType", "albumName", "registry",
		"provenance", "contentEligible", "productionBlockReason",
	}, extra...)
	ordered := []any{}
	seen := map[string]struct{}{}
	for _, key := range keys {
		if _, ok := seen[key]; ok {
			continue
		}
		value, ok := fields[key]
		if !ok || value == nil {
			continue
		}
		seen[key] = struct{}{}
		ordered = append(ordered, key, value)
	}
	if len(ordered) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return orderedJSON(ordered)
}

// The same conversion can be saved again after a lost response without duplicating it.
func actionSubmission(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) (string, json.RawMessage, error) {
	value, present := data["clientTaskId"]
	if !present {
		return "", nil, nil
	}
	operation, ok := value.(string)
	if !ok || len(operation) == 0 || len(operation) > 256 {
		return "", nil, LibraryUpdateError{Message: "动作任务标识无效"}
	}
	sum := sha256.Sum256([]byte(workspace + "\x00sales-action\x00" + operation))
	id := "c" + hex.EncodeToString(sum[:])[:24]
	item, err := loadLibraryItem(ctx, tx, "ActionAsset", actionAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return id, nil, nil
	}
	return id, item, err
}

func validateActionMediaUpdate(ctx context.Context, tx *sql.Tx, workspace, id string, data map[string]any) error {
	_, kindSet := data["mediaType"]
	_, mediaSet := data["mediaUrl"]
	_, sourceSet := data["sourceUrl"]
	if !kindSet && !mediaSet && !sourceSet {
		return nil
	}
	var kind, media, source string
	err := tx.QueryRowContext(ctx, `SELECT COALESCE("mediaType",'image'),COALESCE("mediaUrl",''),COALESCE("sourceUrl",'') FROM "ActionAsset" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&kind, &media, &source)
	if err == sql.ErrNoRows {
		return ErrLibraryRecordMissing
	}
	if err != nil {
		return err
	}
	merged := map[string]any{"mediaType": kind, "mediaUrl": media, "sourceUrl": source}
	for _, key := range []string{"mediaType", "mediaUrl", "sourceUrl"} {
		if value, ok := data[key]; ok {
			merged[key] = value
		}
	}
	_, _, _, err = actionMediaValues(merged)
	return err
}

func actionMediaValues(data map[string]any) (string, string, string, error) {
	kind, err := textOrDefault(data["mediaType"], "image")
	if err != nil {
		return "", "", "", err
	}
	if kind != "image" && kind != "video" && kind != "depth-image" && kind != "depth-video" {
		return "", "", "", LibraryUpdateError{Message: "动作媒体类型无效"}
	}
	media, err := textOrDefault(data["mediaUrl"], "")
	if err != nil {
		return "", "", "", err
	}
	source, err := textOrDefault(data["sourceUrl"], "")
	if err != nil {
		return "", "", "", err
	}
	if kind != "image" && strings.TrimSpace(media) == "" {
		return "", "", "", LibraryUpdateError{Message: "请上传动作图片或视频"}
	}
	return kind, media, source, nil
}

func appearanceAudience(fields map[string]any, outfit bool) string {
	if audience, ok := explicitAudience(fields["dimensions"]); ok {
		if audienceAllowed(outfit, audience) {
			return audience
		}
		return "unknown"
	}
	text := appearanceText(fields)
	age := appearanceAge(text)
	gender := appearanceGender(text, outfit)
	candidate := age + "_" + gender
	if age != "" && audienceAllowed(outfit, candidate) {
		return candidate
	}
	return "unknown"
}

func explicitAudience(value any) (string, bool) {
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return "", false
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return "", false
	}
	audience, ok := parsed["audience"].(string)
	return audience, ok
}

func appearanceText(fields map[string]any) string {
	parts := []string{}
	for _, key := range []string{"name", "title", "description", "reversePrompt", "top", "bottom", "tags", "dimensions"} {
		if text := libraryText(fields[key]); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "；")
}

func appearanceGender(value string, outfit bool) string {
	text := strings.ToLower(negativeAppearancePattern.ReplaceAllString(value, ""))
	male := maleAppearancePattern.MatchString(text)
	female := femaleAppearancePattern.MatchString(text)
	dress := outfit && dressAppearancePattern.MatchString(text)
	if outfit && unisexAppearancePattern.MatchString(text) && !dress && !male && !female {
		return "unisex"
	}
	if outfit && (female || dress) {
		return "female"
	}
	if male && (female || dress) {
		return "unknown"
	}
	if male {
		return "male"
	}
	if female || dress {
		return "female"
	}
	return "unknown"
}

func appearanceAge(text string) string {
	groups := map[string]struct{}{}
	for _, match := range ageNumberPattern.FindAllStringSubmatch(text, -1) {
		var age int
		for _, digit := range match[1] {
			age = age*10 + int(digit-'0')
		}
		switch {
		case age < 18:
			groups["child"] = struct{}{}
		case age >= 60:
			groups["senior"] = struct{}{}
		default:
			groups["adult"] = struct{}{}
		}
	}
	if childAppearancePattern.MatchString(text) {
		groups["child"] = struct{}{}
	}
	if seniorAppearancePattern.MatchString(text) {
		groups["senior"] = struct{}{}
	}
	if adultAppearancePattern.MatchString(text) {
		groups["adult"] = struct{}{}
	}
	if len(groups) == 0 && labeledAdultPattern.MatchString(text) {
		groups["adult"] = struct{}{}
	}
	if len(groups) != 1 {
		return ""
	}
	for age := range groups {
		return age
	}
	return ""
}

func audienceAllowed(outfit bool, name string) bool {
	switch name {
	case "adult_male", "adult_female", "senior_male", "senior_female", "child_male", "child_female", "unknown":
		return true
	case "adult_unisex", "senior_unisex", "child_unisex":
		return outfit
	default:
		return false
	}
}

var (
	negativeAppearancePattern = regexp.MustCompile(`(?:禁止|不要|不得|不能|不穿|非)(?:[^，。；;\n]{0,24})`)
	maleAppearancePattern     = regexp.MustCompile(`男性|男士|男生|男人|男孩|男童|老男|爷爷|男模|男装|男款|\b(?:male|man|men|boy|menswear)\b`)
	femaleAppearancePattern   = regexp.MustCompile(`女性|女士|女生|女人|女孩|女童|老女|奶奶|女模|女装|女款|\b(?:female|woman|women|girl|womenswear)\b`)
	dressAppearancePattern    = regexp.MustCompile(`连衣裙|半身裙|百褶裙|短裙|长裙|旗袍|吊带裙|\b(?:dress|skirt|gown)\b`)
	unisexAppearancePattern   = regexp.MustCompile(`男女通用|男女皆可|中性款|无性别|\bunisex\b`)
	ageNumberPattern          = regexp.MustCompile(`(?i)(\d{1,3})\s*(?:岁|years?\s*old|year-old)`)
	childAppearancePattern    = regexp.MustCompile(`(?i)儿童|童装|男童|女童|男孩|女孩|小孩|幼儿|少年|少女|\b(?:child|children|kid|kids|boy|girl|toddler)\b`)
	seniorAppearancePattern   = regexp.MustCompile(`(?i)老年|老人|老男|老女|爷爷|奶奶|银发族|\b(?:senior|elderly)\b`)
	adultAppearancePattern    = regexp.MustCompile(`(?i)成年|成人|青年|中年|\badult\b`)
	labeledAdultPattern       = regexp.MustCompile(`(?i)男士|女士|男装|女装|\b(?:menswear|womenswear)\b`)
)

type columnKind int

const (
	colText columnKind = iota
	colNullText
	colInt
	colNullInt
	colBool
	colNullFloat
)

type assetColumn struct {
	name string
	kind columnKind
}

type rowQuery interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func loadLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, workspace string) (json.RawMessage, error) {
	return loadScopedLibraryItem(ctx, q, table, columns, id, `"workspaceId" = ?`, []any{id, workspace})
}

func loadSharedLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, workspace string) (json.RawMessage, error) {
	return loadScopedLibraryItem(ctx, q, table, columns, id, `"workspaceId" IN (?, ?)`, []any{id, workspace, database.OfficialWorkspace})
}

func loadScopedLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, where string, args []any) (json.RawMessage, error) {
	names := make([]string, len(columns))
	holders := make([]any, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
		switch column.kind {
		case colInt, colNullInt, colBool:
			holders[i] = new(sql.NullInt64)
		default:
			holders[i] = new(sql.NullString)
		}
	}
	query := `SELECT ` + strings.Join(names, ", ") + ` FROM "` + table + `" WHERE "id" = ? AND ` + where
	if err := q.QueryRowContext(ctx, query, args...).Scan(holders...); err != nil {
		return nil, err
	}
	fields := make([]any, 0, len(columns)*2)
	for i, column := range columns {
		fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
	}
	return orderedJSON(fields)
}

func columnJSON(kind columnKind, holder any) any {
	switch kind {
	case colBool:
		value := holder.(*sql.NullInt64)
		if !value.Valid {
			return nil
		}
		return value.Int64 != 0
	case colInt, colNullInt:
		value := holder.(*sql.NullInt64)
		if !value.Valid {
			return nil
		}
		return value.Int64
	default:
		value := holder.(*sql.NullString)
		if !value.Valid {
			return nil
		}
		return value.String
	}
}

func orderedJSON(fields []any) (json.RawMessage, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i := 0; i < len(fields); i += 2 {
		if i > 0 {
			buf.WriteByte(',')
		}
		key, err := json.Marshal(fields[i])
		if err != nil {
			return nil, err
		}
		var value bytes.Buffer
		encoder := json.NewEncoder(&value)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(fields[i+1]); err != nil {
			return nil, err
		}
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(bytes.TrimRight(value.Bytes(), "\n"))
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func textColumn(name string) assetColumn { return assetColumn{name, colText} }
func nullColumn(name string) assetColumn { return assetColumn{name, colNullText} }
func intColumn(name string) assetColumn  { return assetColumn{name, colInt} }
func nullIntColumn(name string) assetColumn {
	return assetColumn{name, colNullInt}
}
func boolColumn(name string) assetColumn { return assetColumn{name, colBool} }

var sceneAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("description"),
	textColumn("lighting"), textColumn("category"), textColumn("spatialType"), textColumn("suitableCategories"),
	textColumn("tags"), nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"),
	nullColumn("dimensions"), nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"),
	intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"),
	nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var outfitAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("top"), textColumn("bottom"),
	nullColumn("shoes"), nullColumn("colorPalette"), textColumn("category"), textColumn("suitableCategories"),
	textColumn("tags"), nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"),
	nullColumn("dimensions"), nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"),
	intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"),
	nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var actionAssetColumns = []assetColumn{
	textColumn("mediaType"), textColumn("mediaUrl"), textColumn("sourceUrl"),
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("action"), textColumn("shotType"),
	textColumn("spatialType"), nullColumn("camera"), textColumn("suitableAnatomy"), textColumn("tags"),
	nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"), nullColumn("dimensions"),
	nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"), nullColumn("sceneId"),
	intColumn("shotOrder"), intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"),
	textColumn("updatedAt"), nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var personaAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("name"), textColumn("description"), textColumn("tags"),
	nullColumn("avatarUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"), nullColumn("dimensions"),
	nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"), intColumn("usageCount"),
	boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"), nullColumn("albumId"),
	textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var fullPromptAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), nullColumn("albumName"),
	textColumn("reversePromptZh"), nullColumn("reversePromptEn"), nullColumn("dimensions"), nullColumn("imageType"),
	nullIntColumn("sourceImageIndex"), nullColumn("sourceImageIndices"), nullIntColumn("groupIndex"),
	nullIntColumn("displayNumber"), nullColumn("contentSummary"), nullColumn("architectureSummary"),
	nullColumn("replaceableSlots"), nullColumn("shotPromptsJson"), nullColumn("coverUrl"), nullColumn("sourceImages"),
	boolColumn("hasHuman"), nullColumn("shotFraming"), nullIntColumn("productFrameRatio"), nullColumn("sceneSummary"),
	nullColumn("outfitSummary"), nullColumn("actionSummary"), nullColumn("personaSummary"), textColumn("tags"),
	textColumn("category"), nullColumn("productSubcategory"), textColumn("provenance"), intColumn("usageCount"),
	boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"), nullColumn("albumId"),
	textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

type styleMatch struct {
	field string
	text  string
	exact bool
}

func styleCategoryMatches(assetType, category string) []styleMatch {
	lookup := category
	if assetType == "action" {
		lookup = strings.TrimSpace(category)
	}
	if assetType == "scene_bundle" {
		assetType = "scene"
	}
	if matches, ok := styleCategoryTable(assetType)[lookup]; ok {
		return matches
	}
	return defaultStyleMatches(assetType, lookup)
}

func styleCategoryTable(assetType string) map[string][]styleMatch {
	switch assetType {
	case "scene":
		return sceneStyleMatches
	case "outfit":
		return outfitStyleMatches
	case "action":
		return actionStyleMatches
	case "persona":
		return personaStyleMatches
	default:
		return nil
	}
}

func defaultStyleMatches(assetType, category string) []styleMatch {
	switch assetType {
	case "scene":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title", "description", "reversePrompt"}, category)...)
	case "outfit":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title", "top", "bottom", "reversePrompt"}, category)...)
	case "action":
		return []styleMatch{exactStyle("shotType", category), exactStyle("category", category), {field: "tags", text: category}}
	case "persona":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "name", "description", "reversePrompt"}, category)...)
	case "full_prompt":
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"albumName", "tags", "title", "reversePromptZh"}, category)...)
	default:
		return append([]styleMatch{exactStyle("category", category)}, containsStyle([]string{"tags", "title"}, category)...)
	}
}

func exactStyle(field, text string) styleMatch {
	return styleMatch{field: field, text: text, exact: true}
}

func containsStyle(fields []string, text string) []styleMatch {
	matches := make([]styleMatch, 0, len(fields))
	for _, field := range fields {
		matches = append(matches, styleMatch{field: field, text: text})
	}
	return matches
}

func textMatches(field string, words ...string) []styleMatch {
	matches := make([]styleMatch, 0, len(words))
	for _, word := range words {
		matches = append(matches, styleMatch{field: field, text: word})
	}
	return matches
}

func styleColumn(field string) bool {
	switch field {
	case "category", "title", "description", "tags", "reversePrompt", "top", "bottom", "name", "suitableAnatomy", "action", "shotType", "albumName", "reversePromptZh", "reversePromptEn", "sceneSummary", "outfitSummary", "actionSummary":
		return true
	default:
		return false
	}
}

var sceneStyleMatches = map[string][]styleMatch{
	"chinese_style":   append([]styleMatch{exactStyle("category", "chinese_style")}, textMatches("title", "中式", "园林", "茶", "町屋")...),
	"luxury_modern":   append([]styleMatch{exactStyle("category", "luxury_modern")}, textMatches("title", "现代", "都会", "大理石", "高层")...),
	"casual_street":   append([]styleMatch{exactStyle("category", "casual_street")}, textMatches("title", "街", "酒馆", "咖啡", "长椅")...),
	"vacation_nature": append([]styleMatch{exactStyle("category", "vacation_nature")}, textMatches("title", "海", "沙滩", "度假", "自然", "田")...),
	"home_living":     append([]styleMatch{exactStyle("category", "home_living")}, textMatches("title", "起居", "沙发", "生活", "房")...),
	"minimal_office":  append([]styleMatch{exactStyle("category", "minimal_office")}, textMatches("title", "办公", "工位", "原木")...),
}

var outfitStyleMatches = map[string][]styleMatch{
	"chinese_style":   append([]styleMatch{exactStyle("category", "chinese_style")}, textMatches("title", "新中式", "马面裙", "真丝", "盘扣")...),
	"french_chic":     append([]styleMatch{exactStyle("category", "french_chic")}, textMatches("title", "法式", "针织", "牛仔", "衬衫")...),
	"luxury_modern":   append([]styleMatch{exactStyle("category", "luxury_modern")}, textMatches("title", "西装", "羊绒", "都会", "阔腿裤")...),
	"casual_street":   append([]styleMatch{exactStyle("category", "casual_street")}, textMatches("title", "街头", "工装", "衬衫", "休闲")...),
	"vacation_nature": append([]styleMatch{exactStyle("category", "vacation_nature")}, textMatches("title", "度假", "长裙", "蕾丝", "亚麻")...),
	"black_classic":   textMatches("title", "小黑裙", "赫本", "黑白"),
}

var actionStyleMatches = map[string][]styleMatch{
	"jewelry": append(append(append(textMatches("tags", "首饰", "珠宝", "耳环", "项链", "手镯", "戒指", "发簪"),
		textMatches("suitableAnatomy", "hairpin", "earring", "necklace", "bracelet", "ring")...),
		textMatches("title", "首饰", "耳", "发簪", "手镯", "项链", "戒指")...),
		textMatches("action", "耳", "发簪", "项链", "手镯", "戒指")...),
	"apparel": append(append(append(append(textMatches("tags", "服饰", "穿搭", "衣服", "裙", "外套", "衬衫"),
		textMatches("suitableAnatomy", "apparel", "clothing")...),
		textMatches("title", "服饰", "穿搭", "衣", "裙", "半身", "全身")...),
		textMatches("action", "衣", "裙", "摆", "领", "袖")...),
		[]styleMatch{exactStyle("shotType", "half_body"), exactStyle("shotType", "full_body"), exactStyle("shotType", "lifestyle_interaction")}...),
	"bag": append(append(textMatches("tags", "包", "箱包", "手袋"), styleMatch{field: "suitableAnatomy", text: "bag"}),
		append(textMatches("title", "包", "手袋"), textMatches("action", "包", "拎", "挎", "背", "握")...)...),
	"shoes": append(append(append(textMatches("tags", "鞋", "靴"), styleMatch{field: "suitableAnatomy", text: "shoes"}),
		textMatches("title", "鞋", "靴", "足")...),
		append(textMatches("action", "鞋", "靴", "足", "步", "踏"),
			[]styleMatch{exactStyle("shotType", "low_angle_three_quarter_body"), exactStyle("shotType", "full_body")}...)...),
	"beauty": append(append(append(textMatches("tags", "美妆", "妆容", "口红", "护肤"), styleMatch{field: "suitableAnatomy", text: "beauty"}),
		textMatches("title", "妆", "脸", "唇", "眼")...),
		append(textMatches("action", "妆", "唇", "脸", "腮"),
			[]styleMatch{exactStyle("shotType", "extreme_macro_detail"), exactStyle("shotType", "profile_45")}...)...),
	"eyewear": append(append(textMatches("tags", "眼镜", "墨镜", "太阳镜"), styleMatch{field: "suitableAnatomy", text: "eyewear"}),
		append(textMatches("title", "镜"), append(textMatches("action", "镜"), exactStyle("shotType", "profile_45"))...)...),
	"macro_detail":       append([]styleMatch{exactStyle("shotType", "extreme_macro_detail"), exactStyle("shotType", "macro_detail")}, textMatches("title", "微距", "特写")...),
	"universal":          append([]styleMatch{exactStyle("shotType", "close_up"), exactStyle("shotType", "profile_45")}, textMatches("title", "侧颜", "回眸", "近景", "特写")...),
	"medium_interactive": append([]styleMatch{exactStyle("shotType", "profile_half_body"), exactStyle("shotType", "medium_full_body")}, textMatches("title", "半身", "托腮", "互动", "笑", "比心")...),
	"full_body":          append([]styleMatch{exactStyle("shotType", "low_angle_three_quarter_body")}, textMatches("title", "全身", "漫步", "站姿", "立姿", "跃", "跑")...),
	"seated_candid":      append([]styleMatch{exactStyle("shotType", "high_angle_seated_full_body")}, textMatches("title", "坐", "倚", "靠", "躺")...),
}

var personaStyleMatches = map[string][]styleMatch{
	"style_gentle":  append(textMatches("name", "清纯", "甜"), textMatches("description", "小鹿眼", "甜美")...),
	"style_classic": append(textMatches("name", "古典", "名媛"), textMatches("description", "盘发", "端庄")...),
	"style_chic":    append(textMatches("name", "都会", "时髦", "职场"), textMatches("description", "骨相", "立体")...),
	"hair_wavy":     append(textMatches("name", "卷"), textMatches("description", "卷发", "波浪")...),
	"hair_updo":     append(textMatches("name", "盘发"), textMatches("description", "低盘发", "发髻")...),
	"hair_straight": append(textMatches("name", "黑长直"), textMatches("description", "黑长直", "直发")...),
	"color_gold":    append(textMatches("name", "金", "橘"), textMatches("description", "金", "橙", "棕")...),
}
