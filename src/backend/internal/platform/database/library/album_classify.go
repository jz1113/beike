package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func ClassifyAlbums(ctx context.Context, db *sql.DB, workspace string, ids []string, categoryID *string) (AssetOrganization, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AssetOrganization{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	resolved, err := ResolveMajorCategory(ctx, tx, workspace, categoryID)
	if err != nil {
		return AssetOrganization{}, err
	}
	if err := requireAlbums(ctx, tx, workspace, ids); err != nil {
		return AssetOrganization{}, err
	}
	for _, id := range ids {
		if err := AssignAlbumCategory(ctx, tx, workspace, id, resolved); err != nil {
			return AssetOrganization{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	committed = true
	return ListAssetOrganization(ctx, db, workspace)
}

func ResolveMajorCategory(ctx context.Context, tx *sql.Tx, workspace string, categoryID *string) (*string, error) {
	if categoryID == nil {
		return nil, nil
	}
	var parent sql.NullString
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, *categoryID, workspace, database.OfficialWorkspace).Scan(&parent, &archived)
	if err == sql.ErrNoRows {
		return nil, errMajorMissing
	}
	if err != nil {
		return nil, err
	}
	if (parent.Valid && parent.String != "") || archived != 0 {
		return nil, errMajorUnavailable
	}
	return categoryID, nil
}

func requireAlbums(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	unique := map[string]struct{}{}
	for _, id := range ids {
		unique[id] = struct{}{}
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(unique)), ",")
	args := []any{workspace, database.OfficialWorkspace}
	for id := range unique {
		args = append(args, id)
	}
	var count int
	query := `SELECT COUNT(*) FROM "PromptAlbum" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + placeholders + `)`
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return err
	}
	if count != len(unique) {
		return errAlbumMissing
	}
	return nil
}

func AssignAlbumCategory(ctx context.Context, tx *sql.Tx, workspace, albumID string, categoryID *string) error {
	var owner string
	var current sql.NullString
	err := tx.QueryRowContext(ctx, `
		SELECT "workspaceId", "productCategoryId" FROM "PromptAlbum"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, albumID, workspace, database.OfficialWorkspace).Scan(&owner, &current)
	if err == sql.ErrNoRows {
		return errAlbumMissing
	}
	if err != nil {
		return err
	}
	if owner != workspace {
		return errOfficialAlbum
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE "PromptAlbum" SET "productCategoryId" = ? WHERE "id" = ? AND "workspaceId" = ?`,
		categoryID, albumID, workspace); err != nil {
		return err
	}
	keepSubcategory := (!current.Valid && categoryID == nil) || (current.Valid && categoryID != nil && current.String == *categoryID)
	categories := "[]"
	if categoryID != nil {
		body, err := json.Marshal([]string{*categoryID})
		if err != nil {
			return err
		}
		categories = string(body)
	}
	updatedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	query := `
		UPDATE "FullPromptAsset" SET "productCategoryIds" = ?, "isUniversal" = 0, "updatedAt" = ?
		WHERE "albumId" = ? AND "workspaceId" = ?`
	args := []any{categories, updatedAt, albumID, workspace}
	if !keepSubcategory {
		query = `
			UPDATE "FullPromptAsset" SET "productCategoryIds" = ?, "isUniversal" = 0, "productSubcategory" = NULL, "updatedAt" = ?
			WHERE "albumId" = ? AND "workspaceId" = ?`
	}
	_, err = tx.ExecContext(ctx, query, args...)
	return err
}

var (
	errMajorMissing     = database.ErrText("商品大类不存在")
	errMajorUnavailable = database.ErrText("请选择可用的商品大类")
	errAlbumMissing     = database.ErrText("图集不存在")
	errOfficialAlbum    = database.ErrText("官方图集不可修改")
)

func ClassifiableAssetType(assetType string) bool {
	_, ok := assetTable(assetType)
	return ok
}

func ClassifyAssets(ctx context.Context, db *sql.DB, workspace, assetType string, ids, categories []string, universal bool) (AssetOrganization, error) {
	table, ok := assetTable(assetType)
	if !ok {
		return AssetOrganization{}, errAssetByAlbum
	}
	if categories == nil {
		categories = []string{}
	}
	encoded, err := json.Marshal(categories)
	if err != nil {
		return AssetOrganization{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AssetOrganization{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := requireCategoryIDs(ctx, tx, workspace, categories); err != nil {
		return AssetOrganization{}, err
	}
	if err := requireAssetIDs(ctx, tx, table, workspace, ids); err != nil {
		return AssetOrganization{}, err
	}
	if err := updateAssetCategories(ctx, tx, table, workspace, ids, string(encoded), universal); err != nil {
		return AssetOrganization{}, err
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	committed = true
	return ListAssetOrganization(ctx, db, workspace)
}

func assetTable(assetType string) (string, bool) {
	switch assetType {
	case "scene", "scene_bundle":
		return "SceneAsset", true
	case "outfit":
		return "OutfitAsset", true
	case "action":
		return "ActionAsset", true
	case "persona":
		return "PersonaAsset", true
	default:
		return "", false
	}
}

func requireCategoryIDs(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	count, err := countScopedIDs(ctx, tx, "AssetProductCategory", workspace, ids)
	if err != nil {
		return err
	}
	if count != len(ids) {
		return errCategoryIDs
	}
	return nil
}

func requireAssetIDs(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string) error {
	unique := database.UniqueIDs(ids)
	count, err := countScopedIDs(ctx, tx, table, workspace, unique)
	if err != nil {
		return err
	}
	if count != len(unique) {
		return errAssetMissing
	}
	return nil
}

func countScopedIDs(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string) (int, error) {
	if !safeAssetTable(table) || len(ids) == 0 {
		return 0, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	var count int
	query := `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + placeholders + `)`
	err := tx.QueryRowContext(ctx, query, args...).Scan(&count)
	return count, err
}

func updateAssetCategories(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string, categories string, universal bool) error {
	if !safeAssetTable(table) {
		return errAssetByAlbum
	}
	flag := 0
	if universal {
		flag = 1
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{categories, flag, workspace}
	for _, id := range ids {
		args = append(args, id)
	}
	query := `UPDATE "` + table + `" SET "productCategoryIds" = ?, "isUniversal" = ? WHERE "workspaceId" = ? AND "id" IN (` + placeholders + `)`
	_, err := tx.ExecContext(ctx, query, args...)
	return err
}

func safeAssetTable(table string) bool {
	switch table {
	case "SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "AssetProductCategory":
		return true
	default:
		return false
	}
}

var (
	errAssetByAlbum = database.ErrText("完整提示词请按图集调整归属")
	errAssetMissing = database.ErrText("素材不存在")
	errCategoryIDs  = database.ErrText("商品品类不存在")
)

// Commit reference groups and their review receipt together. A repeated receipt never creates duplicates.
func CommitDeconstructGroups(ctx context.Context, db *sql.DB, workspace, reviewID string, drafts []map[string]any) ([]string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var status, raw string
	if err := tx.QueryRowContext(ctx, `SELECT "status","payload" FROM "DeconstructReview" WHERE "workspaceId"=? AND "id"=?`, workspace, reviewID).Scan(&status, &raw); err != nil {
		return nil, err
	}
	var payload map[string]any
	if json.Unmarshal([]byte(raw), &payload) != nil {
		return nil, errors.New("候选数据损坏")
	}
	ids := []string{}
	if saved, ok := payload["fullPromptIds"].([]any); ok {
		for _, id := range saved {
			if value, ok := id.(string); ok {
				ids = append(ids, value)
			}
		}
	}
	if len(ids) > 0 && status == "approved" {
		return ids, nil
	}
	if status != "pending" && status != "approved" {
		return nil, errors.New("请先恢复候选再入库")
	}
	if len(drafts) == 0 {
		return nil, errors.New("没有完整四图母本可入库，候选仍保留")
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, data := range drafts {
		album, err := ensurePromptAlbum(ctx, tx, workspace, data)
		if err != nil {
			return nil, err
		}
		inferred := inferCreateSubcategory(data)
		category, err := promptCreateCategory(ctx, tx, workspace, data, album, inferred)
		if err != nil {
			return nil, err
		}
		sub, err := promptCreateSubcategory(ctx, tx, workspace, data, category, inferred)
		if err != nil {
			return nil, err
		}
		if !sameStoredCategory(album.category, category) {
			if err := AssignAlbumCategory(ctx, tx, workspace, album.id, category); err != nil {
				return nil, err
			}
		}
		number, err := nextPromptDisplayNumber(ctx, tx)
		if err != nil {
			return nil, err
		}
		id, err := newLibraryID()
		if err != nil {
			return nil, err
		}
		provenance, err := insertFullPrompt(ctx, tx, workspace, id, now, number, album, category, sub, data)
		if err != nil {
			return nil, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE "FullPromptAsset" SET "sourceImageIndices"=?,"groupIndex"=?,"shotPromptsJson"=?,"contentSummary"=?,"architectureSummary"=? WHERE "id"=? AND "workspaceId"=?`,
			data["sourceImageIndices"], data["groupIndex"], data["shotPromptsJson"], data["contentSummary"], data["architectureSummary"], id, workspace)
		if err != nil {
			return nil, err
		}
		if _, err := assignVisiblePromptNumbers(ctx, tx, workspace, id); err != nil {
			return nil, err
		}
		var parent any
		if parentID, ok := payload["parentFullPromptId"].(string); ok && parentID != "" {
			var registry string
			if err := tx.QueryRowContext(ctx, `SELECT "id" FROM "PromptAssetRegistry" WHERE "workspaceId" IN (?, 'official') AND "assetType"='full_prompt' AND "sourceAssetId"=?`, workspace, parentID).Scan(&registry); err != nil {
				return nil, err
			}
			parent = registry
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO "PromptAssetRegistry" ("id","workspaceId","assetType","sourceAssetId","status","version","provenance","sourceRef","publishedAt","createdAt","updatedAt") VALUES (?,?,'full_prompt',?,'published',1,?,?,?,?,?)`,
			"reg_"+id, workspace, id, provenance, parent, now, now, now)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	payload["fullPromptIds"] = ids
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	changed, err := tx.ExecContext(ctx, `UPDATE "DeconstructReview" SET "status"='approved',"payload"=? WHERE "workspaceId"=? AND "id"=? AND "status"=?`, string(encoded), workspace, reviewID, status)
	if err != nil {
		return nil, err
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		return nil, errors.New("候选状态已变化，入库未提交")
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return ids, nil
}

var (
	deconstructNoFacePattern  = regexp.MustCompile(`(?:画面|图中|人物)?(?:没有|未出现|未见|无|不入镜|未入镜)[^。；\n]{0,18}(?:头部|发型|面部|五官|人脸|脸部)|(?:头部|发型|面部|五官|人脸|脸部)[^。；\n]{0,16}(?:没有|未出现|未见|不入镜|未入镜|不可见)|画面无人|面部和身体主体不入镜|没有面部与完整身体|只露出手部|仅露出手部`)
	deconstructNegHandPattern = regexp.MustCompile(`(?:无|没有|未见|不含|不出现|非)[^，,。；;\n]{0,12}(?:手部|手指|双手|人手|手持|握持|人物|人体)`)
	deconstructHandPattern    = regexp.MustCompile(`手部|手指|双手|单手|一只手|两只手|右手|左手|手掌|手托|手握|握持|手持|托住|托起|托持|捏住|夹持|前臂|手腕`)
)

func deconstructSection(prompt, heading string) string {
	pattern := regexp.MustCompile(`【` + regexp.QuoteMeta(heading) + `】\s*([\s\S]*?)(?:\n?【[^】]+】|$)`)
	match := pattern.FindStringSubmatch(prompt)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func RefineShotType(kind, prompt string) string {
	if kind != "model_shot" || !strings.Contains(prompt, "【发型与面部】") {
		return kind
	}
	face := deconstructSection(prompt, "发型与面部")
	subj := deconstructSection(prompt, "主体") + " " + deconstructSection(prompt, "动作或摆放")
	if !deconstructNoFacePattern.MatchString(face + " " + subj) {
		return kind
	}
	cleaned := deconstructNegHandPattern.ReplaceAllString(subj+" "+face, "")
	if deconstructHandPattern.MatchString(cleaned) {
		return "hand_held_only"
	}
	return "pure_product"
}

// ProductSubjectText excludes promotional gifts when choosing a creative skill.
func ProductSubjectText(title string) string {
	return giftedAccessoryPattern.ReplaceAllString(title, "")
}

func ProductSubcategory(title string, props map[string]string) string {
	title = strings.ToLower(ProductSubjectText(title))
	if isPhoneProduct(title) {
		return "phone"
	}
	if kind := digitalKind(title); kind != "" {
		return kind
	}
	for _, key := range []string{"商品类目", "品类", "category", "分类"} {
		if kind := digitalKind(strings.ToLower(props[key])); kind != "" {
			return kind
		}
	}
	return ""
}
