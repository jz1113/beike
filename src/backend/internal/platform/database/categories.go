package database

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
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
		ORDER BY "position" ASC, "id" ASC`, workspace, officialWorkspace)
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
