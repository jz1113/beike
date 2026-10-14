package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

func LibrarySceneDetail(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, error) {
	item, err := loadSharedLibraryItem(ctx, db, "SceneAsset", sceneAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	actions, err := listSceneActions(ctx, db, workspace, id, 0)
	if err != nil {
		return nil, err
	}
	shots := sceneDetailShots(id, item, actions)
	registry, status, err := libraryRegistry(ctx, db, workspace, "scene", id)
	if err != nil {
		registry, status = nil, ""
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	eligible, reason := libraryProduction("scene", fields, status)
	extra := []any{"actions", actions}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "shots", shots, "shotCount", len(shots))
	return extendJSON(item, extra)
}

func listSceneActions(ctx context.Context, db *sql.DB, workspace, sceneID string, limit int) ([]json.RawMessage, error) {
	names := make([]string, len(actionAssetColumns))
	for i, column := range actionAssetColumns {
		names[i] = `"` + column.name + `"`
	}
	query := `
		SELECT ` + strings.Join(names, ", ") + ` FROM "ActionAsset"
		WHERE "sceneId" = ? AND "workspaceId" IN (?, ?)
		ORDER BY "shotOrder" ASC, "createdAt" ASC`
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}
	rows, err := db.QueryContext(ctx, query, sceneID, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		holders := make([]any, len(actionAssetColumns))
		for i, column := range actionAssetColumns {
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
		fields := make([]any, 0, len(actionAssetColumns)*2)
		for i, column := range actionAssetColumns {
			fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
		}
		item, err := orderedJSON(fields)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func sceneDetailShots(sceneID string, scene json.RawMessage, actions []json.RawMessage) []json.RawMessage {
	if len(actions) == 0 {
		var fields map[string]any
		_ = json.Unmarshal(scene, &fields)
		title, _ := fields["title"].(string)
		description, _ := fields["description"].(string)
		templates := harmonizedSceneShots(sceneID, title, description)
		shots := make([]json.RawMessage, 0, len(templates))
		for i, template := range templates {
			body, _ := orderedJSON([]any{
				"id", "harmonized-" + sceneID + "-" + strconv.Itoa(i+1),
				"title", template.title, "action", template.action, "camera", template.camera,
				"angle", template.angle, "shotType", template.shotType, "shotOrder", i + 1,
				"provenance", "harmonized", "sceneId", sceneID,
			})
			shots = append(shots, body)
		}
		return shots
	}
	type linked struct {
		raw      json.RawMessage
		id       string
		title    string
		action   string
		shotType string
		camera   any
		sceneID  any
		order    int64
		source   string
	}
	linkedActions := make([]linked, 0, len(actions))
	for _, raw := range actions {
		var fields map[string]any
		_ = json.Unmarshal(raw, &fields)
		item := linked{raw: raw, camera: fields["camera"], sceneID: fields["sceneId"]}
		item.id, _ = fields["id"].(string)
		item.title, _ = fields["title"].(string)
		item.action, _ = fields["action"].(string)
		item.shotType, _ = fields["shotType"].(string)
		item.source, _ = fields["provenance"].(string)
		if item.source == "" {
			item.source = "manual"
		}
		if number, ok := fields["shotOrder"].(float64); ok {
			item.order = int64(number)
		}
		linkedActions = append(linkedActions, item)
	}
	sort.SliceStable(linkedActions, func(i, j int) bool {
		if linkedActions[i].order != linkedActions[j].order {
			return linkedActions[i].order < linkedActions[j].order
		}
		return linkedActions[i].title < linkedActions[j].title
	})
	if len(linkedActions) > 4 {
		linkedActions = linkedActions[:4]
	}
	shots := make([]json.RawMessage, 0, len(linkedActions))
	for i, item := range linkedActions {
		order := i + 1
		if item.order > 0 {
			order = int(item.order)
		}
		body, _ := orderedJSON([]any{
			"id", item.id, "title", item.title, "action", item.action, "camera", item.camera,
			"angle", item.title, "shotType", item.shotType, "shotOrder", order,
			"provenance", item.source, "sceneId", item.sceneID,
		})
		shots = append(shots, body)
	}
	return shots
}
