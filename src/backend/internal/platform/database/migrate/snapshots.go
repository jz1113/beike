package migrate

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
)

type numberChange struct {
	old *int
	new int
}

type jsonNode struct {
	start, end int
	value      any
	fields     map[string]*jsonNode
	items      []*jsonNode
	fieldOrder []string
}

func migrateFullPromptNumberSnapshots(ctx context.Context, db execer, workspaceID string, changes map[string]numberChange) error {
	if workspaceID == "" {
		return fmt.Errorf("快照编号迁移缺少工作区 ID")
	}
	for assetID, change := range changes {
		if assetID == "" || change.new < 1 || (change.old != nil && *change.old < 1) {
			return fmt.Errorf("快照编号迁移映射无效")
		}
	}
	if len(changes) == 0 {
		return nil
	}
	tables := map[string]bool{}
	rows, err := db.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('WorkshopWorkspace', 'WorkshopBatch', 'AssistantTurn', 'AssistantTurnItem')`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		tables[name] = true
	}
	rows.Close()
	specs := []struct{ table, column, format string }{
		{"WorkshopWorkspace", "snapshotJson", "workshop"},
		{"WorkshopBatch", "snapshotJson", "workshop"},
		{"AssistantTurn", "snapshotJson", "assistantTurn"},
		{"AssistantTurnItem", "actionJson", "assistantAction"},
	}
	for _, spec := range specs {
		if !tables[spec.table] || (spec.table == "AssistantTurnItem" && !tables["AssistantTurn"]) {
			continue
		}
		query := `SELECT "id", "` + spec.column + `" FROM "` + spec.table + `" WHERE "workspaceId" = ? AND "` + spec.column + `" IS NOT NULL`
		args := []any{workspaceID}
		if spec.table == "AssistantTurnItem" {
			query += ` AND "kind" = 'toolResult' AND "turnId" IN (SELECT "id" FROM "AssistantTurn" WHERE "workspaceId" = ?)`
			args = append(args, workspaceID)
		}
		records, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		type row struct{ id, body string }
		var pending []row
		for records.Next() {
			var item row
			if err := records.Scan(&item.id, &item.body); err != nil {
				records.Close()
				return err
			}
			pending = append(pending, item)
		}
		records.Close()
		for _, item := range pending {
			next := replaceSnapshotNumbers(item.body, spec.format, changes)
			if next == "" || next == item.body {
				continue
			}
			update := `UPDATE "` + spec.table + `" SET "` + spec.column + `" = ? WHERE "id" = ? AND "workspaceId" = ? AND "` + spec.column + `" = ?`
			updateArgs := []any{next, item.id, workspaceID, item.body}
			if spec.table == "AssistantTurnItem" {
				update += ` AND "kind" = 'toolResult' AND "turnId" IN (SELECT "id" FROM "AssistantTurn" WHERE "workspaceId" = ?)`
				updateArgs = append(updateArgs, workspaceID)
			}
			result, err := db.ExecContext(ctx, update, updateArgs...)
			if err != nil {
				return err
			}
			if count, _ := result.RowsAffected(); count != 1 {
				return fmt.Errorf("快照编号迁移遇到并发修改，请重试事务")
			}
		}
	}
	return nil
}

func replaceSnapshotNumbers(text, format string, changes map[string]numberChange) string {
	root := parseJSONNodes([]rune(text))
	if root == nil {
		return ""
	}
	var replacements [][3]int
	collect := func(record *jsonNode) {
		collectNumber(record, "appliedFullPromptId", "appliedFullPromptDisplayNumber", changes, &replacements)
		if record != nil {
			collectNumber(record.fields["assetTrace"], "fullPromptId", "fullPromptDisplayNumber", changes, &replacements)
		}
	}
	if format == "assistantAction" {
		collect(root)
	} else if root.fields != nil {
		for _, item := range root.fields["items"].itemsOrEmpty() {
			if format == "workshop" {
				collect(item)
			} else if item != nil && item.fields["kind"] != nil && item.fields["kind"].value == "toolResult" {
				collect(item.fields["action"])
			}
		}
	}
	sort.Slice(replacements, func(i, j int) bool { return replacements[i][0] > replacements[j][0] })
	runes := []rune(text)
	for i := len(replacements) - 1; i >= 0; i-- {
		start, end, number := replacements[i][0], replacements[i][1], replacements[i][2]
		runes = append(append(append([]rune{}, runes[:start]...), []rune(fmt.Sprint(number))...), runes[end:]...)
	}
	if len(replacements) == 0 {
		return text
	}
	return string(runes)
}

func (node *jsonNode) itemsOrEmpty() []*jsonNode {
	if node == nil {
		return nil
	}
	return node.items
}

func collectNumber(record *jsonNode, idKey, numberKey string, changes map[string]numberChange, replacements *[][3]int) {
	if record == nil || record.fields == nil {
		return
	}
	assetID, _ := record.fields[idKey].scalarString()
	stored := record.fields[numberKey]
	if assetID == "" || stored == nil || stored.fields != nil || stored.items != nil {
		return
	}
	change, ok := changes[assetID]
	if !ok || change.old == nil || !sameNumber(stored.value, *change.old) || sameNumber(stored.value, change.new) {
		return
	}
	*replacements = append(*replacements, [3]int{stored.start, stored.end, change.new})
}

func (node *jsonNode) scalarString() (string, bool) {
	if node == nil {
		return "", false
	}
	text, ok := node.value.(string)
	return text, ok
}

func sameNumber(value any, number int) bool {
	switch typed := value.(type) {
	case float64:
		return typed == float64(number)
	case int:
		return typed == number
	default:
		return false
	}
}

func parseJSONNodes(text []rune) (node *jsonNode) {
	if json.Unmarshal([]byte(string(text)), new(any)) != nil {
		return nil
	}
	cursor := 0
	var readValue func() *jsonNode
	defer func() {
		if recover() != nil {
			node = nil
		}
	}()
	skip := func() {
		for cursor < len(text) && (text[cursor] == ' ' || text[cursor] == '\n' || text[cursor] == '\r' || text[cursor] == '\t') {
			cursor++
		}
	}
	readString := func() string {
		start := cursor
		cursor++
		for cursor < len(text) {
			if text[cursor] == '\\' {
				cursor += 2
				continue
			}
			cursor++
			if text[cursor-1] == '"' {
				break
			}
		}
		var value string
		_ = jsonUnmarshal(string(text[start:cursor]), &value)
		return value
	}
	readValue = func() *jsonNode {
		skip()
		start := cursor
		if cursor < len(text) && text[cursor] == '{' {
			cursor++
			skip()
			fields := map[string]*jsonNode{}
			for cursor < len(text) && text[cursor] != '}' {
				key := readString()
				skip()
				cursor++
				fields[key] = readValue()
				skip()
				if cursor >= len(text) || text[cursor] != ',' {
					break
				}
				cursor++
				skip()
			}
			cursor++
			return &jsonNode{start: start, end: cursor, fields: fields}
		}
		if cursor < len(text) && text[cursor] == '[' {
			cursor++
			skip()
			var items []*jsonNode
			for cursor < len(text) && text[cursor] != ']' {
				items = append(items, readValue())
				skip()
				if cursor >= len(text) || text[cursor] != ',' {
					break
				}
				cursor++
				skip()
			}
			cursor++
			return &jsonNode{start: start, end: cursor, items: items}
		}
		if cursor < len(text) && text[cursor] == '"' {
			value := readString()
			return &jsonNode{start: start, end: cursor, value: value}
		}
		for cursor < len(text) && text[cursor] != ' ' && text[cursor] != '\n' && text[cursor] != '\r' && text[cursor] != '\t' && text[cursor] != ',' && text[cursor] != '}' && text[cursor] != ']' {
			cursor++
		}
		var value any
		_ = jsonUnmarshal(string(text[start:cursor]), &value)
		return &jsonNode{start: start, end: cursor, value: value}
	}
	return readValue()
}

func jsonUnmarshal(text string, dest any) error {
	return json.Unmarshal([]byte(text), dest)
}
