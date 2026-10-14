package database

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

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
		ORDER BY "position" ASC, "id" ASC`, workspace, officialWorkspace)
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
