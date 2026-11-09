package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
)

type serverSubCategory struct {
	ID         string   `json:"id"`
	ParentID   string   `json:"parentId"`
	Label      string   `json:"label"`
	ShortLabel string   `json:"shortLabel"`
	Keywords   []string `json:"keywords"`
	Anatomy    string   `json:"anatomy,omitempty"`
}

func ListServerSubCategories(ctx context.Context, db *sql.DB, workspace, defaultsPath string) (json.RawMessage, error) {
	order, defaults, err := loadDefaultSubCategories(defaultsPath)
	if err != nil {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "parentId", "name", "keywords", "anatomy"
		FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?)
		ORDER BY "position" ASC, "id" ASC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grouped := map[string][]serverSubCategory{}
	seen := []string{}
	for rows.Next() {
		var id, name, keywords, anatomy string
		var parent sql.NullString
		if err := rows.Scan(&id, &parent, &name, &keywords, &anatomy); err != nil {
			return nil, err
		}
		if !parent.Valid || parent.String == "" {
			continue
		}
		if _, ok := grouped[parent.String]; !ok {
			seen = append(seen, parent.String)
		}
		grouped[parent.String] = append(grouped[parent.String], serverSubCategory{
			ID: id, ParentID: parent.String, Label: name, ShortLabel: name,
			Keywords: jsonStringList(keywords), Anatomy: firstJSONString(anatomy),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	keys := []string{}
	values := map[string]json.RawMessage{}
	used := map[string]bool{}
	for _, parent := range seen {
		if len(grouped[parent]) == 0 {
			continue
		}
		body, err := json.Marshal(grouped[parent])
		if err != nil {
			return nil, err
		}
		keys = append(keys, parent)
		values[parent] = body
		used[parent] = true
	}
	for _, parent := range order {
		if used[parent] {
			continue
		}
		keys = append(keys, parent)
		values[parent] = defaults[parent]
	}
	return marshalOrdered(keys, values)
}

func loadDefaultSubCategories(path string) ([]string, map[string]json.RawMessage, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		return nil, nil, err
	}
	order := []string{}
	values := map[string]json.RawMessage{}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, nil, err
		}
		key, _ := token.(string)
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, nil, err
		}
		order = append(order, key)
		values[key] = value
	}
	return order, values, nil
}

func marshalOrdered(keys []string, values map[string]json.RawMessage) (json.RawMessage, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for index, key := range keys {
		if index > 0 {
			buf.WriteByte(',')
		}
		name, err := json.Marshal(key)
		if err != nil {
			return nil, err
		}
		buf.Write(name)
		buf.WriteByte(':')
		buf.Write(values[key])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func jsonStringList(raw string) []string {
	var parsed []any
	if raw == "" || json.Unmarshal([]byte(raw), &parsed) != nil {
		return []string{}
	}
	out := []string{}
	for _, item := range parsed {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func firstJSONString(raw string) string {
	list := jsonStringList(raw)
	if len(list) == 0 {
		return ""
	}
	return list[0]
}

type CategoryApplyItem struct {
	ID       string
	ParentID string
	Label    string
	Keywords []string
	Anatomy  string
}

func ApplyCategoryMigration(ctx context.Context, db *sql.DB, workspace, defaultsPath string, items []CategoryApplyItem) (json.RawMessage, error) {
	rows, err := loadScopedCategories(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	parents := map[string]struct{}{}
	for _, row := range rows {
		if row.parent == "" {
			parents[row.id] = struct{}{}
		}
	}
	for _, item := range items {
		if _, ok := parents[item.ParentID]; !ok {
			if _, err := db.ExecContext(ctx, `
				INSERT INTO "AssetProductCategory"
				("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
				VALUES (?,?,?,NULL,?,0,'[]','[]','[]')`,
				item.ParentID, workspace, categoryParentLabel(item.ParentID), len(parents)); err != nil {
				return nil, err
			}
			parents[item.ParentID] = struct{}{}
		}
		keywords, anatomy := database.CategoryJSON(item.Keywords), anatomyJSON(item.Anatomy)
		if duplicate := findCategoryDuplicate(rows, item.ParentID, item.Label); duplicate != nil {
			_, _ = db.ExecContext(ctx, `
				UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
				WHERE "id" = ? AND "workspaceId" = ?`, keywords, anatomy, duplicate.id, workspace)
			continue
		}
		id := item.ID
		if categoryIDTaken(rows, id) {
			id, err = newCategoryID()
			if err != nil {
				return nil, err
			}
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO "AssetProductCategory"
			("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
			VALUES (?,?,?,?,?,0,'[]','[]','[]')`,
			id, workspace, item.Label, item.ParentID, countCategoryChildren(rows, item.ParentID)); err != nil {
			return nil, err
		}
		_, _ = db.ExecContext(ctx, `
			UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, keywords, anatomy, id, workspace)
		rows = append(rows, storedCategory{id: id, workspace: workspace, name: item.Label, parent: item.ParentID})
	}
	return ListServerSubCategories(ctx, db, workspace, defaultsPath)
}

type storedCategory struct {
	id, workspace, name, parent string
}

func loadScopedCategories(ctx context.Context, db *sql.DB, workspace string) ([]storedCategory, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "parentId" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) ORDER BY "id" ASC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stored := []storedCategory{}
	for rows.Next() {
		var row storedCategory
		var parent sql.NullString
		if err := rows.Scan(&row.id, &row.workspace, &row.name, &parent); err != nil {
			return nil, err
		}
		if parent.Valid {
			row.parent = parent.String
		}
		stored = append(stored, row)
	}
	return stored, rows.Err()
}

func findCategoryDuplicate(rows []storedCategory, parent, label string) *storedCategory {
	for index := range rows {
		if rows[index].parent == parent && rows[index].name == label {
			return &rows[index]
		}
	}
	return nil
}

func categoryIDTaken(rows []storedCategory, id string) bool {
	for _, row := range rows {
		if row.id == id {
			return true
		}
	}
	return false
}

func countCategoryChildren(rows []storedCategory, parent string) int {
	count := 0
	for _, row := range rows {
		if row.parent == parent {
			count++
		}
	}
	return count
}

func categoryParentLabel(id string) string {
	labels := map[string]string{
		"jewelry": "珠宝首饰", "digital_3c": "手机数码", "apparel": "服饰穿搭", "bag": "箱包",
		"shoes": "鞋靴", "beauty": "美妆", "eyewear": "眼镜", "universal": "通用日常",
	}
	if label, ok := labels[id]; ok {
		return label
	}
	return id
}

func anatomyJSON(value string) string {
	if value == "" {
		return "[]"
	}
	return database.CategoryJSON([]string{value})
}

func newCategoryID() (string, error) {
	var buf [6]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "cat_" + hex.EncodeToString(buf[:]), nil
}

type LocalCategory struct {
	ID         string
	ParentID   string
	Label      string
	ShortLabel string
	Keywords   []string
	Anatomy    *string
}

type LocalCategoryReport struct {
	ParentID   string
	Categories []LocalCategory
}

type CategoryPreview struct {
	Parents      []string      `json:"parents"`
	Items        []previewItem `json:"items"`
	CreatedCount int           `json:"createdCount"`
	MergedCount  int           `json:"mergedCount"`
}

type previewItem struct {
	ID          string   `json:"id"`
	ParentID    string   `json:"parentId"`
	Label       string   `json:"label"`
	Keywords    []string `json:"keywords"`
	Anatomy     *string  `json:"anatomy,omitempty"`
	Source      string   `json:"source"`
	DuplicateOf *string  `json:"duplicateOf,omitempty"`
}

type categoryDef struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	ShortLabel string   `json:"shortLabel"`
	Keywords   []string `json:"keywords"`
	Anatomy    string   `json:"anatomy"`
}

func PreviewCategoryMigration(ctx context.Context, db *sql.DB, workspace, defaultsPath string, local []LocalCategoryReport) (CategoryPreview, error) {
	order, rawDefaults, err := loadDefaultSubCategories(defaultsPath)
	if err != nil {
		return CategoryPreview{}, err
	}
	defaults := map[string][]categoryDef{}
	for _, parent := range order {
		var defs []categoryDef
		if err := json.Unmarshal(rawDefaults[parent], &defs); err != nil {
			return CategoryPreview{}, err
		}
		defaults[parent] = defs
	}
	nodes, err := listCategoryNodes(ctx, db, workspace)
	if err != nil {
		return CategoryPreview{}, err
	}
	items := []*previewItem{}
	seen := map[string]*previewItem{}
	for _, parent := range order {
		for _, node := range nodes {
			if node.parentID != parent {
				continue
			}
			item := node.toItem(parent)
			seen[categoryKey(parent, item.Label)] = item
			items = append(items, item)
		}
		for _, def := range defaults[parent] {
			upsertCategory(&items, seen, parent, "default", def.ID, categoryLabel(def), def.Keywords, optionalText(def.Anatomy))
		}
	}
	for _, report := range local {
		for _, def := range report.Categories {
			upsertCategory(&items, seen, report.ParentID, "local", def.ID, categoryLabel(categoryDef{
				ID: def.ID, Label: def.Label, ShortLabel: def.ShortLabel,
			}), def.Keywords, def.Anatomy)
		}
	}
	preview := CategoryPreview{Parents: order, Items: make([]previewItem, 0, len(items))}
	for _, item := range items {
		if item.Keywords == nil {
			item.Keywords = []string{}
		}
		preview.Items = append(preview.Items, *item)
		if item.Source == "local" {
			preview.CreatedCount++
		}
		if item.DuplicateOf != nil {
			preview.MergedCount++
		}
	}
	return preview, nil
}

type categoryNode struct {
	id, name, parentID string
	keywords           []string
	anatomy            string
}

func (node categoryNode) toItem(parent string) *previewItem {
	return &previewItem{
		ID: node.id, ParentID: parent, Label: node.name, Keywords: node.keywords,
		Anatomy: optionalText(node.anatomy), Source: "server",
	}
}

func listCategoryNodes(ctx context.Context, db *sql.DB, workspace string) ([]categoryNode, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "parentId", "name", "keywords", "anatomy"
		FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" IS NOT NULL AND "parentId" != ''
		ORDER BY "position" ASC, "id" ASC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	nodes := []categoryNode{}
	for rows.Next() {
		var node categoryNode
		var keywords, anatomy string
		if err := rows.Scan(&node.id, &node.parentID, &node.name, &keywords, &anatomy); err != nil {
			return nil, err
		}
		node.keywords = jsonStringList(keywords)
		node.anatomy = firstJSONString(anatomy)
		nodes = append(nodes, node)
	}
	return nodes, rows.Err()
}

func upsertCategory(items *[]*previewItem, seen map[string]*previewItem, parent, source, id, label string, keywords []string, anatomy *string) {
	if keywords == nil {
		keywords = []string{}
	}
	existing := seen[categoryKey(parent, label)]
	if existing == nil {
		existing = findCategoryByKeyword(*items, parent, keywords)
	}
	if existing != nil {
		existing.Keywords = uniqueStrings(append(append([]string{}, existing.Keywords...), keywords...))
		if source == "local" && existing.Source != "local" {
			existing.DuplicateOf = &existing.ID
		}
		return
	}
	item := &previewItem{ID: id, ParentID: parent, Label: label, Keywords: keywords, Anatomy: anatomy, Source: source}
	seen[categoryKey(parent, label)] = item
	*items = append(*items, item)
}

func categoryLabel(def categoryDef) string {
	if def.Label != "" {
		return def.Label
	}
	if def.ShortLabel != "" {
		return def.ShortLabel
	}
	return def.ID
}

func categoryKey(parent, label string) string {
	return parent + ":" + strings.ToLower(strings.TrimSpace(label))
}

func findCategoryByKeyword(items []*previewItem, parent string, keywords []string) *previewItem {
	normalized := []string{}
	for _, word := range keywords {
		word = strings.ToLower(strings.TrimSpace(word))
		if word != "" {
			normalized = append(normalized, word)
		}
	}
	for _, item := range items {
		if item.ParentID != parent {
			continue
		}
		for _, word := range item.Keywords {
			if containsString(normalized, strings.ToLower(word)) {
				return item
			}
		}
	}
	return nil
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func optionalText(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func (item previewItem) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	writeJSONField(&buf, "id", item.ID, true)
	writeJSONField(&buf, "parentId", item.ParentID, false)
	writeJSONField(&buf, "label", item.Label, false)
	keywords, err := json.Marshal(item.Keywords)
	if err != nil {
		return nil, err
	}
	buf.WriteString(`,"keywords":`)
	buf.Write(keywords)
	if item.Anatomy != nil {
		writeJSONField(&buf, "anatomy", *item.Anatomy, false)
	}
	writeJSONField(&buf, "source", item.Source, false)
	if item.DuplicateOf != nil {
		writeJSONField(&buf, "duplicateOf", *item.DuplicateOf, false)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func writeJSONField(buf *bytes.Buffer, key, value string, first bool) {
	encoded, _ := json.Marshal(value)
	if !first {
		buf.WriteByte(',')
	}
	buf.WriteByte('"')
	buf.WriteString(key)
	buf.WriteString(`":`)
	buf.Write(encoded)
}

type CategorySave struct {
	ID       *string
	Name     string
	ParentID *string
}

func SaveProductCategory(ctx context.Context, db *sql.DB, workspace string, input CategorySave) (dblibrary.AssetOrganization, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || utf16Len(name) > 40 {
		return dblibrary.AssetOrganization{}, errCategoryName
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	var existing *storedProductCategory
	if input.ID != nil {
		existing, err = findScopedCategory(ctx, tx, workspace, *input.ID)
		if err != nil {
			return dblibrary.AssetOrganization{}, err
		}
		if existing == nil {
			return dblibrary.AssetOrganization{}, errCategoryMissing
		}
		if existing.archived {
			return dblibrary.AssetOrganization{}, errCategoryArchived
		}
	}
	parentID := input.ParentID
	if existing != nil {
		parentID = existing.parentID
	}
	if parentID != nil {
		parent, err := findScopedCategory(ctx, tx, workspace, *parentID)
		if err != nil {
			return dblibrary.AssetOrganization{}, err
		}
		if parent == nil {
			return dblibrary.AssetOrganization{}, errCategoryMissing
		}
		if parent.parentID != nil {
			return dblibrary.AssetOrganization{}, errCategoryDepth
		}
		if parent.archived {
			return dblibrary.AssetOrganization{}, errCategoryParentArchived
		}
	}
	duplicate, err := findNamedCategory(ctx, tx, workspace, name, parentID, existing)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if duplicate != nil && !duplicate.archived {
		return dblibrary.AssetOrganization{}, errCategoryDuplicate
	}
	switch {
	case existing != nil:
		if err := renameCategory(ctx, tx, workspace, existing.id, name); err != nil {
			return dblibrary.AssetOrganization{}, err
		}
	case duplicate != nil:
		if err := restoreCategory(ctx, tx, workspace, duplicate.id); err != nil {
			return dblibrary.AssetOrganization{}, err
		}
	default:
		if err := insertCategory(ctx, tx, workspace, name, parentID); err != nil {
			return dblibrary.AssetOrganization{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	committed = true
	return dblibrary.ListAssetOrganization(ctx, db, workspace)
}

type storedProductCategory struct {
	id, workspace string
	parentID      *string
	archived      bool
}

func findScopedCategory(ctx context.Context, tx *sql.Tx, workspace, id string) (*storedProductCategory, error) {
	var row storedProductCategory
	var parent sql.NullString
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, id, workspace, database.OfficialWorkspace).Scan(&row.id, &row.workspace, &parent, &archived)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if parent.Valid && parent.String != "" {
		row.parentID = &parent.String
	}
	row.archived = archived != 0
	return &row, nil
}

func findNamedCategory(ctx context.Context, tx *sql.Tx, workspace, name string, parentID *string, existing *storedProductCategory) (*storedProductCategory, error) {
	query := `
		SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "name" = ? AND "workspaceId" IN (?, ?) AND "parentId" IS NULL`
	args := []any{name, workspace, database.OfficialWorkspace}
	if parentID != nil {
		query = `
			SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
			WHERE "name" = ? AND "workspaceId" IN (?, ?) AND "parentId" = ?`
		args = append(args, *parentID)
	}
	if existing != nil {
		query += ` AND "id" != ?`
		args = append(args, existing.id)
	}
	query += ` ORDER BY "id" ASC`
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var first *storedProductCategory
	for rows.Next() {
		var row storedProductCategory
		var parent sql.NullString
		var archived int
		if err := rows.Scan(&row.id, &row.workspace, &parent, &archived); err != nil {
			return nil, err
		}
		if parent.Valid && parent.String != "" {
			row.parentID = &parent.String
		}
		row.archived = archived != 0
		if !row.archived {
			return &row, nil
		}
		if first == nil {
			copied := row
			first = &copied
		}
	}
	return first, rows.Err()
}

func renameCategory(ctx context.Context, tx *sql.Tx, workspace, id, name string) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "name" = ?, "isArchived" = 0
		WHERE "id" = ? AND "workspaceId" = ?`, name, id, workspace)
	return categoryWriteResult(result, err)
}

func restoreCategory(ctx context.Context, tx *sql.Tx, workspace, id string) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "isArchived" = 0
		WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	return categoryWriteResult(result, err)
}

func insertCategory(ctx context.Context, tx *sql.Tx, workspace, name string, parentID *string) error {
	var count int
	query := `SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" IS NULL`
	args := []any{workspace, database.OfficialWorkspace}
	if parentID != nil {
		query = `SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`
		args = append(args, *parentID)
	}
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return err
	}
	id, err := newCategoryRecordID()
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]','[]','[]')`, id, workspace, name, parentID, count)
	return err
}

func categoryWriteResult(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	updated, _ := result.RowsAffected()
	if updated != 1 {
		return errCategoryMissing
	}
	return nil
}

func newCategoryRecordID() (string, error) {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "c" + hex.EncodeToString(buf[:]), nil
}

func utf16Len(value string) int {
	count := 0
	for _, char := range value {
		count++
		if char > 0xFFFF {
			count++
		}
	}
	return count
}

var (
	errCategoryName           = database.ErrText("品类名称需为 1–40 个字")
	errCategoryArchived       = database.ErrText("文件夹已删除，请刷新后重试")
	errCategoryDepth          = database.ErrText("商品品类最多两级")
	errCategoryParentArchived = database.ErrText("父文件夹已删除，不可编辑")
	errCategoryDuplicate      = database.ErrText("同级品类名称已存在")
	errCategoryMissing        = database.ErrText("No AssetProductCategory found")
)
