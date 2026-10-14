package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"
)

type FolderImportResult struct {
	Organization dblibrary.AssetOrganization
	CreatedCount int
	UpdatedCount int
}

func SavePromptFolderRules(ctx context.Context, db *sql.DB, workspace, id string, keywords, anatomy []string) (dblibrary.AssetOrganization, error) {
	keywords, err := normalizeRuleWords(keywords, 200, "关键词最多 200 项")
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	anatomy, err = normalizeRuleWords(anatomy, 32, "部位规则最多 32 项")
	if err != nil {
		return dblibrary.AssetOrganization{}, err
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
	if err := ensureBuiltinRuleFolder(ctx, tx, workspace, id); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	folder, err := activeRuleFolder(ctx, tx, workspace, id)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if kind := builtinKindFromFolder(id); kind != "" && (folder.parentID == nil || *folder.parentID != "digital_3c") {
		return dblibrary.AssetOrganization{}, errDigitalFolderParent
	}
	if err := writeFolderRules(ctx, tx, workspace, folder.id, keywords, anatomy); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if err := tx.Commit(); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	committed = true
	return dblibrary.ListAssetOrganization(ctx, db, workspace)
}

func ImportPromptFolderRules(ctx context.Context, db *sql.DB, workspace, parentID, mode string, items []FolderRuleItem) (FolderImportResult, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return FolderImportResult{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	parent, err := activeRuleFolder(ctx, tx, workspace, parentID)
	if err != nil {
		return FolderImportResult{}, err
	}
	if parent.parentID != nil {
		return FolderImportResult{}, errImportUnderMajor
	}
	siblings, err := loadRuleSiblings(ctx, tx, workspace, parent.id)
	if err != nil {
		return FolderImportResult{}, err
	}
	position := maxRulePosition(siblings) + 1
	created := 0
	for _, item := range items {
		keywords, err := normalizeRuleWords(item.Keywords, 200, "关键词最多 200 项")
		if err != nil {
			return FolderImportResult{}, err
		}
		var anatomy []string
		if item.HasAnatomy {
			anatomy, err = normalizeRuleWords(item.Anatomy, 32, "部位规则最多 32 项")
			if err != nil {
				return FolderImportResult{}, err
			}
		}
		made, err := importOneFolderRule(ctx, tx, workspace, parent.id, mode, item.Name, keywords, anatomy, item.HasAnatomy, &siblings, &position)
		if err != nil {
			return FolderImportResult{}, err
		}
		if made {
			created++
		}
	}
	if err := tx.Commit(); err != nil {
		return FolderImportResult{}, err
	}
	committed = true
	organization, err := dblibrary.ListAssetOrganization(ctx, db, workspace)
	if err != nil {
		return FolderImportResult{}, err
	}
	return FolderImportResult{Organization: organization, CreatedCount: created, UpdatedCount: len(items) - created}, nil
}

type FolderRuleItem struct {
	Name       string
	Keywords   []string
	Anatomy    []string
	HasAnatomy bool
}

type ruleFolder struct {
	id, name, workspace string
	parentID            *string
	archived            bool
	position            int
	keywords, anatomy   string
}

func ensureBuiltinRuleFolder(ctx context.Context, tx *sql.Tx, workspace, id string) error {
	kind := builtinKindFromFolder(id)
	if kind == "" {
		return nil
	}
	existing, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil || existing != nil {
		return err
	}
	parent, err := activeRuleFolder(ctx, tx, workspace, "digital_3c")
	if err != nil {
		return err
	}
	if parent.parentID != nil {
		return errPhoneMajor
	}
	siblings, err := loadRuleSiblings(ctx, tx, workspace, parent.id)
	if err != nil {
		return err
	}
	current := []ruleFolder{}
	for _, sibling := range siblings {
		if sibling.workspace == workspace {
			current = append(current, sibling)
		}
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]','[]','[]')`,
		id, workspace, subcategoryLabel(kind), parent.id, maxRulePosition(current)+1)
	return err
}

func activeRuleFolder(ctx context.Context, tx *sql.Tx, workspace, id string) (*storedProductCategory, error) {
	switch id {
	case "all", "auto", "unclassified", "unknown", "universal":
		return nil, errVirtualFolder
	}
	folder, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil {
		return nil, err
	}
	if folder == nil || folder.archived || folder.workspace != workspace {
		return nil, errFolderUnavailable
	}
	if folder.parentID != nil {
		parent, err := findScopedCategory(ctx, tx, workspace, *folder.parentID)
		if err != nil {
			return nil, err
		}
		if parent == nil || parent.parentID != nil || parent.archived || parent.workspace != workspace {
			return nil, errParentFolder
		}
	}
	return folder, nil
}

func writeFolderRules(ctx context.Context, tx *sql.Tx, workspace, id string, keywords, anatomy []string) error {
	keywordJSON, _ := json.Marshal(keywords)
	anatomyJSON, _ := json.Marshal(anatomy)
	result, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ? WHERE "id" = ? AND "workspaceId" = ?`,
		string(keywordJSON), string(anatomyJSON), id, workspace)
	return categoryWriteResult(result, err)
}

func loadRuleSiblings(ctx context.Context, tx *sql.Tx, workspace, parentID string) ([]ruleFolder, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "parentId", "position", "isArchived", "keywords", "anatomy"
		FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`, workspace, database.OfficialWorkspace, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	siblings := []ruleFolder{}
	for rows.Next() {
		var folder ruleFolder
		var parent sql.NullString
		var archived int
		if err := rows.Scan(&folder.id, &folder.workspace, &folder.name, &parent, &folder.position, &archived, &folder.keywords, &folder.anatomy); err != nil {
			return nil, err
		}
		if parent.Valid && parent.String != "" {
			folder.parentID = &parent.String
		}
		folder.archived = archived != 0
		siblings = append(siblings, folder)
	}
	return siblings, rows.Err()
}

func maxRulePosition(folders []ruleFolder) int {
	maximum := -1
	for _, folder := range folders {
		if folder.position > maximum {
			maximum = folder.position
		}
	}
	return maximum
}

func normalizeRuleWords(values []string, limit int, limitMessage string) ([]string, error) {
	seen := map[string]struct{}{}
	words := []string{}
	for _, value := range values {
		word := strings.TrimSpace(value)
		if word == "" {
			return nil, errEmptyRule
		}
		if utf16Len(word) > 80 {
			return nil, errLongRule
		}
		if _, ok := seen[word]; ok {
			continue
		}
		seen[word] = struct{}{}
		words = append(words, word)
	}
	if len(words) > limit {
		return nil, database.ErrText(limitMessage)
	}
	return words, nil
}

func mergeRuleWords(raw string, incoming []string, limit int) ([]string, error) {
	combined := []string{}
	for _, value := range database.CategoryIDList(raw) {
		value = strings.TrimSpace(value)
		if value != "" {
			combined = append(combined, value)
		}
	}
	combined = append(combined, incoming...)
	seen := map[string]struct{}{}
	words := []string{}
	for _, word := range combined {
		word = strings.TrimSpace(word)
		if word == "" {
			continue
		}
		if utf16Len(word) > 80 {
			return nil, errRuleMerge
		}
		if _, ok := seen[word]; ok {
			continue
		}
		seen[word] = struct{}{}
		words = append(words, word)
	}
	if len(words) > limit {
		return nil, errRuleMerge
	}
	return words, nil
}

func builtinKindFromFolder(id string) string {
	kind, ok := subcategoryKind(id)
	if ok && !database.BuiltinSubcategory(id) {
		return kind
	}
	if database.BuiltinSubcategory(id) {
		return ""
	}
	return kind
}

func builtinKindByLabel(name string) string {
	switch name {
	case "手机本体":
		return "phone"
	case "手机壳":
		return "case"
	case "耳机":
		return "earphone"
	case "平板":
		return "tablet"
	default:
		return ""
	}
}

func newPromptFolderID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return database.PromptSubcategoryPrefix + hex.EncodeToString(buf[:]), nil
}

var (
	errVirtualFolder       = database.ErrText("系统虚拟分类不可编辑规则")
	errFolderUnavailable   = database.ErrText("文件夹不存在、已归档或不属于当前工作区")
	errParentFolder        = database.ErrText("父文件夹不存在、已归档或不属于当前工作区")
	errPhoneMajor          = database.ErrText("手机数码大类不可用")
	errDigitalFolderParent = database.ErrText("数码细分文件夹不属于手机数码")
	errImportUnderMajor    = database.ErrText("请在实际商品大类下导入二级文件夹")
	errEmptyRule           = database.ErrText("规则词不能为空")
	errLongRule            = database.ErrText("规则词最多 80 个字")
	errRuleMerge           = database.ErrText("合并后的规则超过数量或长度上限，请精简后重试")
)
