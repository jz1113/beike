package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func LibraryPromptDetail(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, error) {
	item, err := loadSharedLibraryItem(ctx, db, "FullPromptAsset", fullPromptAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	number, err := libraryPromptNumber(ctx, db, workspace, id)
	if err != nil {
		return nil, err
	}
	registry, status, registryID, sourceRef, registryProvenance, err := promptRegistry(ctx, db, workspace, id)
	if err != nil {
		registry, status, registryID, sourceRef, registryProvenance = nil, "", "", "", ""
	}
	eligible, reason := libraryProduction("full_prompt", fields, status)
	replaced, err := promptImageReplaced(ctx, db, workspace, id, fields)
	if err != nil {
		return nil, err
	}
	mother, err := promptSourceMother(ctx, db, workspace, registryID, sourceRef, registryProvenance)
	if err != nil {
		return nil, err
	}
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason,
		"imageReplaced", replaced, "imageReplaceable", promptImageReplaceable(fields, replaced), "sourceMother", mother)
	body, err := extendJSON(item, extra)
	if err != nil {
		return nil, err
	}
	return setDisplayNumber(body, number), nil
}

func libraryPromptNumber(ctx context.Context, db *sql.DB, workspace, id string) (*int64, error) {
	var number int64
	err := db.QueryRowContext(ctx, `
		SELECT "displayNumber" FROM "FullPromptLibraryNumber"
		WHERE "workspaceId" = ? AND "assetId" = ?`, workspace, id).Scan(&number)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &number, nil
}

func promptRegistry(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, string, string, string, string, error) {
	body, status, err := libraryRegistry(ctx, db, workspace, "full_prompt", id)
	if err != nil || body == nil {
		return body, status, "", "", "", err
	}
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, "", "", "", "", err
	}
	registryID, _ := fields["id"].(string)
	sourceRef, _ := fields["sourceRef"].(string)
	provenance, _ := fields["provenance"].(string)
	return body, status, registryID, sourceRef, provenance, nil
}

func promptImageReplaced(ctx context.Context, db *sql.DB, workspace, id string, fields map[string]any) (bool, error) {
	if libraryText(fields["provenance"]) == "workshop_generated" || fields["groupIndex"] == nil {
		return false, nil
	}
	var found string
	err := db.QueryRowContext(ctx, `
		SELECT "motherAssetId" FROM "FullPromptImageReplacement"
		WHERE "workspaceId" = ? AND "motherAssetId" = ?`, workspace, id).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func promptImageReplaceable(fields map[string]any, replaced bool) bool {
	return fields["groupIndex"] != nil && libraryText(fields["provenance"]) != "workshop_generated" && !replaced
}

func promptSourceMother(ctx context.Context, db *sql.DB, workspace, registryID, sourceRef, provenance string) (any, error) {
	if provenance != "workshop_generated" || sourceRef == "" || sourceRef == registryID {
		return nil, nil
	}
	var assetID, title, album sql.NullString
	var group sql.NullInt64
	var available int
	err := db.QueryRowContext(ctx, `
		SELECT registry."sourceAssetId", parent."title", parent."groupIndex", parent."albumName",
			CASE WHEN parent."id" IS NULL THEN 0 ELSE 1 END
		FROM "PromptAssetRegistry" AS registry
		LEFT JOIN "FullPromptAsset" AS parent
			ON parent."id" = registry."sourceAssetId" AND parent."workspaceId" IN (?, ?)
		WHERE registry."workspaceId" = ? AND registry."assetType" = 'full_prompt' AND registry."id" = ?`,
		workspace, database.OfficialWorkspace, workspace, sourceRef).Scan(&assetID, &title, &group, &album, &available)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	number, err := libraryPromptNumber(ctx, db, workspace, assetID.String)
	if err != nil {
		return nil, err
	}
	var groupValue any
	if group.Valid {
		groupValue = group.Int64
	}
	var albumValue any
	if album.Valid {
		albumValue = album.String
	}
	body, err := orderedJSON([]any{
		"id", assetID.String, "code", stablePromptCode(assetID.String), "title", nullString(title),
		"displayNumber", number, "groupIndex", groupValue, "albumName", albumValue, "available", available == 1,
	})
	if err != nil {
		return nil, err
	}
	return body, nil
}

func completePromptGroup(fields map[string]any) bool {
	indices := uniquePositiveInts(fields["sourceImageIndices"])
	shots := promptShotMarks(fields["shotPromptsJson"])
	if len(indices) != 4 || len(shots) != 4 {
		return false
	}
	seen := map[int]struct{}{}
	for _, shot := range shots {
		if shot.text == "" {
			return false
		}
		seen[shot.number] = struct{}{}
	}
	return len(seen) == 4
}

func uniquePositiveInts(value any) []int {
	list := jsonList(value)
	seen := map[int]struct{}{}
	values := []int{}
	for _, item := range list {
		number, ok := item.(float64)
		if !ok || number != float64(int(number)) || number <= 0 {
			return nil
		}
		seen[int(number)] = struct{}{}
		values = append(values, int(number))
	}
	if len(seen) != len(values) {
		return nil
	}
	return values
}

type promptShotMark struct {
	number int
	text   string
}

func promptShotMarks(value any) []promptShotMark {
	list := jsonList(value)
	shots := []promptShotMark{}
	for index, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		number := index + 1
		if raw, ok := object["shot_no"].(float64); ok && raw != 0 {
			number = int(raw)
		}
		text := strings.TrimSpace(libraryText(object["prompt"]) + libraryText(object["action"]) + libraryText(object["scene"]))
		shots = append(shots, promptShotMark{number: number, text: text})
	}
	return shots
}

func jsonList(value any) []any {
	var parsed any
	switch typed := value.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return nil
		}
	default:
		parsed = value
	}
	list, _ := parsed.([]any)
	return list
}

func stablePromptCode(id string) string {
	compact := nonAlnumPattern.ReplaceAllString(id, "")
	if len(compact) > 4 {
		compact = compact[len(compact)-4:]
	}
	if compact == "" {
		compact = "0000"
	}
	return "R-" + strings.ToLower(compact)
}

func nullString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

var nonAlnumPattern = regexp.MustCompile(`[^a-zA-Z0-9]`)

func inferCreateSubcategory(data map[string]any) string {
	if value, ok := data["productSubcategory"]; ok {
		text, _ := value.(string)
		return text
	}
	title, _ := data["title"].(string)
	titleKind := digitalKind(title)
	shotKind := shotDigitalKind(data["shotPromptsJson"])
	if titleKind != "" && shotKind != "" && titleKind != shotKind {
		return ""
	}
	if titleKind != "" {
		return titleKind
	}
	return shotKind
}

func digitalKind(text string) string {
	subject := digitalEvidence(text)
	switch {
	case casePattern.MatchString(subject):
		return "case"
	case earphonePattern.MatchString(subject):
		return "earphone"
	case tabletPattern.MatchString(subject):
		return "tablet"
	case isPhoneProduct(subject) || phoneBodyPattern.MatchString(subject):
		return "phone"
	default:
		return ""
	}
}

func digitalEvidence(text string) string {
	subject := giftedAccessoryPattern.ReplaceAllString(text, "")
	subject = negativeAccessoryPattern.ReplaceAllString(subject, "")
	return phoneCameraPattern.ReplaceAllString(subject, "")
}

func isPhoneProduct(title string) bool {
	sold := giftedAccessoryPattern.ReplaceAllString(title, "")
	sold = strings.TrimSpace(sold)
	if accessoryTitlePattern.MatchString(sold) {
		return false
	}
	if phoneTitlePattern.MatchString(sold) {
		return true
	}
	return phoneBrandPattern.MatchString(sold) && phoneScreenPattern.MatchString(sold) && phoneChipPattern.MatchString(sold) && phoneRadioPattern.MatchString(sold)
}

func shotDigitalKind(raw any) string {
	shots := shotTexts(raw)
	if len(shots) == 0 {
		return ""
	}
	if countKind(shots, shotCasePattern) >= 2 {
		return "case"
	}
	if countKind(shots, shotEarphonePattern) >= 2 {
		return "earphone"
	}
	if countKind(shots, shotTabletPattern) >= 2 {
		return "tablet"
	}
	if countKind(shots, shotPhonePattern) >= 2 || phoneSubjectVotes(raw) >= 2 {
		return "phone"
	}
	return ""
}

func shotTexts(raw any) []string {
	var parsed any
	switch typed := raw.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return nil
		}
	default:
		parsed = raw
	}
	list, ok := parsed.([]any)
	if !ok {
		return nil
	}
	texts := []string{}
	for _, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		title, _ := object["title"].(string)
		prompt, _ := object["prompt"].(string)
		texts = append(texts, digitalEvidence(title+" "+shotSubjectText(prompt)))
	}
	return texts
}

func shotSubjectText(prompt string) string {
	observed := []string{}
	for _, heading := range []string{"主体", "穿搭或物体细节", "物体细节", "动作或摆放"} {
		if section := promptSection(prompt, heading); section != "" {
			observed = append(observed, section)
		}
	}
	if len(observed) > 0 {
		return strings.Join(observed, "；")
	}
	parts := regexp.MustCompile(`【画质与限制】|【负面约束】`).Split(prompt, 2)
	text := parts[0]
	if len([]rune(text)) > 220 {
		return string([]rune(text)[:220])
	}
	return text
}

func promptSection(prompt, heading string) string {
	pattern := regexp.MustCompile(`【` + regexp.QuoteMeta(heading) + `】\s*([\s\S]*?)(?:\n?【[^】]+】|$)`)
	match := pattern.FindStringSubmatch(prompt)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func countKind(texts []string, pattern *regexp.Regexp) int {
	count := 0
	for _, text := range texts {
		if pattern.MatchString(text) {
			count++
		}
	}
	return count
}

func phoneSubjectVotes(raw any) int {
	var parsed any
	switch typed := raw.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return 0
		}
	default:
		parsed = raw
	}
	list, ok := parsed.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		prompt, _ := object["prompt"].(string)
		if digitalKind(promptSection(prompt, "主体")) == "phone" {
			count++
		}
	}
	return count
}

var (
	negativeAccessoryPattern = regexp.MustCompile(`(?:无|没有|不含|不要|不带|禁止|去掉|去除|未搭配)\s*(?:手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|贴膜|耳机|耳塞|耳麦|平板)`)
	phoneCameraPattern       = regexp.MustCompile(`(?:使用|用|以|通过)?手机(?:拍摄|摄影|原相机|直出|记录)|(?i:shot\s+on\s+iphone(?:\s+\d+\s*(?:pro|max|plus)?)?)`)
	casePattern              = regexp.MustCompile(`手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|phone\s*case`)
	earphonePattern          = regexp.MustCompile(`耳机|耳麦|耳塞|蓝牙耳塞|airpods|earbuds|headphones`)
	tabletPattern            = regexp.MustCompile(`平板|ipad|tablet`)
	phoneBodyPattern         = regexp.MustCompile(`手机本体|手机裸机|直板手机|折叠屏手机|手机正反面|实机(?:展示|开箱|外观)`)
	giftedAccessoryPattern   = regexp.MustCompile(`(?i)[（(][^）)]*(?:晒单|下单|购机|评价|好评|限时|免费|加|配|附)?(?:赠送|赠|配赠|附赠|送|礼赠)[^）)]*(?:手机壳|保护壳|保护套|钢化膜|手机膜|贴膜|镜头膜|手机支架|手机座|手机夹|充电器|充电头|数据线|充电线|充电宝|移动电源|蓝牙耳机|有线耳机|无线耳机|耳机|耳塞|手环|手表|音箱)[^）)]*[）)]|(?:晒单|下单|购机|评价|好评|限时|免费)?(?:赠送|赠|配赠|附赠|送|礼赠)[^，,；;）)]{0,24}(?:手机壳|保护壳|保护套|钢化膜|手机膜|贴膜|镜头膜|手机支架|手机座|手机夹|充电器|充电头|数据线|充电线|充电宝|移动电源|蓝牙耳机|有线耳机|无线耳机|耳机|耳塞|手环|手表|音箱)`)
	accessoryTitlePattern    = regexp.MustCompile(`手机壳|保护壳|保护套|手机挂绳|手机挂饰|手机膜|钢化膜|屏幕膜|镜头膜|贴膜|手机支架|手机座|手机夹|手机充电器|充电头|充电宝|移动电源|数据线|充电线|手机散热器|手机稳定器|耳机|手表|平板|笔记本|电脑|matepad|xiaomi\s*pad|\b(?:phone\s*case|screen\s*protector|charger|power\s*bank|earbuds?|buds|watch|tablet|ipad|pad|tab|laptop)\b`)
	phoneTitlePattern        = regexp.MustCompile(`手机|智能机|iphone|redmi|iqoo|红米|小米\s*\d|小米note|galaxy|pixel\s*\d|smartphone|(?:vivo|oppo|荣耀|honor|realme|一加|华为|huawei|三星|samsung|nova|oneplus)\s*[a-z0-9][a-z0-9\s+.-]{0,16}\d`)
	phoneBrandPattern        = regexp.MustCompile(`华为|huawei|荣耀|honor|vivo|oppo|realme|一加|oneplus|三星|samsung|小米|xiaomi`)
	phoneScreenPattern       = regexp.MustCompile(`曲面屏|护眼屏|直屏|折叠屏|屏幕`)
	phoneChipPattern         = regexp.MustCompile(`鸿蒙系统|harmonyos|麒麟\s*\d{3,5}|骁龙\s*\d{3,5}|天玑\s*\d{3,5}`)
	phoneRadioPattern        = regexp.MustCompile(`\d{4,5}\s*mah|全网通|双卡双待|北斗卫星|5g`)
	shotCasePattern          = regexp.MustCompile(`手机壳|保护壳|保护套|手机套|贴膜|镜头膜|钢化膜|屏幕膜`)
	shotEarphonePattern      = regexp.MustCompile(`耳机|耳麦|耳塞|充电盒`)
	shotTabletPattern        = regexp.MustCompile(`平板|ipad|tablet`)
	shotPhonePattern         = regexp.MustCompile(`手机.{0,8}(?:正面|背面|屏幕|机身|摄像头|镜头模组|中框|边框|外观)|手机本体|手机裸机|机身(?:正面|背面)|后置摄像头|前摄开孔|屏幕边框`)
)

// InferReferenceSubcategory uses repeated visible subjects, not the chosen folder.
func InferReferenceSubcategory(data map[string]any) string {
	return shotDigitalKind(data["shotPromptsJson"])
}

// ReferenceSubjectSubcategory requires repeated primary-subject evidence. A case
// mentioned only in styling or detail prose is insufficient to reclassify a phone.
func ReferenceSubjectSubcategory(raw any) string {
	var shots []map[string]any
	switch value := raw.(type) {
	case string:
		_ = json.Unmarshal([]byte(value), &shots)
	default:
		body, _ := json.Marshal(value)
		_ = json.Unmarshal(body, &shots)
	}
	votes := map[string]int{}
	for _, shot := range shots {
		prompt, _ := shot["prompt"].(string)
		kind := digitalKind(promptSection(prompt, "主体"))
		if kind != "" {
			votes[kind]++
		}
	}
	for _, kind := range []string{"case", "earphone", "tablet", "phone"} {
		if votes[kind] >= 2 {
			return kind
		}
	}
	return ""
}

func listPromptGroups(ctx context.Context, db *sql.DB, workspace string, page, pageSize int, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, style string) (LibraryList, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return LibraryList{}, err
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		_ = tx.Rollback()
		return LibraryList{}, err
	}
	if err := tx.Commit(); err != nil {
		return LibraryList{}, err
	}
	fields := []string{"title", "albumName", "reversePromptZh", "reversePromptEn", "tags", "sceneSummary", "outfitSummary", "actionSummary"}
	where, args, err := libraryListWhere(ctx, db, workspace, keyword, favorite, albumID, categoryID, includeUniversal, fields, "full_prompt", style)
	if err != nil {
		return LibraryList{}, err
	}
	where = strings.ReplaceAll(where, `"workspaceId"`, `"FullPromptAsset"."workspaceId"`)
	where += " AND " + visiblePromptSQL
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "FullPromptAsset" WHERE `+where, args...).Scan(&total); err != nil {
		return LibraryList{}, err
	}
	names := make([]string, len(fullPromptAssetColumns))
	for i, column := range fullPromptAssetColumns {
		names[i] = `"FullPromptAsset"."` + column.name + `"`
	}
	listArgs := append([]any{workspace}, args...)
	listArgs = append(listArgs, pageSize, (page-1)*pageSize)
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "FullPromptAsset"
		LEFT JOIN "FullPromptLibraryNumber" AS n
			ON n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id"
		WHERE `+where+`
		ORDER BY CASE WHEN n."displayNumber" IS NULL THEN 1 ELSE 0 END, n."displayNumber" ASC, "FullPromptAsset"."id" ASC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return LibraryList{}, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(fullPromptAssetColumns, rows)
		if err != nil {
			return LibraryList{}, err
		}
		body, err := decoratePromptListItem(ctx, db, workspace, item)
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

func decoratePromptListItem(ctx context.Context, db *sql.DB, workspace string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
	number, err := libraryPromptNumber(ctx, db, workspace, id)
	if err != nil {
		return nil, err
	}
	registry, status, registryID, sourceRef, registryProvenance, err := promptRegistry(ctx, db, workspace, id)
	if err != nil {
		registry, status, registryID, sourceRef, registryProvenance = nil, "", "", "", ""
	}
	eligible, reason := libraryProduction("full_prompt", fields, status)
	replaced, err := promptImageReplaced(ctx, db, workspace, id, fields)
	if err != nil {
		return nil, err
	}
	mother, err := promptSourceMother(ctx, db, workspace, registryID, sourceRef, registryProvenance)
	if err != nil {
		return nil, err
	}
	extra := []any{"code", stableAssetCode("R", id)}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason,
		"imageReplaced", replaced, "imageReplaceable", promptImageReplaceable(fields, replaced), "sourceMother", mother)
	body, err := extendJSON(item, extra)
	if err != nil {
		return nil, err
	}
	return setDisplayNumber(body, number), nil
}
