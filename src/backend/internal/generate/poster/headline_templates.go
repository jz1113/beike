package poster

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

var errTemplateConflict = errors.New("模板已在其他页面修改，请刷新后再编辑")

// Templates use the durable sample identity; traits remain compatible with legacy memory selection.
func HeadlineTemplates(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "模板库数据库不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodGet && r.URL.Query().Get("export") == "1" {
			exportCoverTemplates(w, r, db, workspace)
			return
		}
		if r.Method == http.MethodPatch {
			updateCoverTemplate(w, r, db, workspace)
			return
		}
		if err := recoverStaleCoverFeeds(r.Context(), db, workspace); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "核对反推状态失败"})
			return
		}
		if requestKey := r.URL.Query().Get("requestKey"); requestKey != "" {
			var sample coverSample
			var raw string
			err := db.QueryRowContext(r.Context(), `SELECT "id","title","imageUrls","model","status","error","createdAt","requestKey" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "requestKey"=?`, workspace, requestKey).Scan(&sample.ID, &sample.Title, &raw, &sample.Model, &sample.Status, &sample.Error, &sample.CreatedAt, &sample.RequestKey)
			samples := []coverSample{}
			if err == nil {
				_ = json.Unmarshal([]byte(raw), &sample.ImageURLs)
				if sample.ImageURLs == nil {
					sample.ImageURLs = []string{}
				}
				samples = append(samples, sample)
			} else if err != sql.ErrNoRows {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "核对反推任务失败"})
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "samples": samples})
			return
		}
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id != "" {
			var raw string
			err := db.QueryRowContext(r.Context(), `SELECT "deconstruction" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&raw)
			if err != nil {
				httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "模板不存在"})
				return
			}
			prompt, legacy := coverTemplatePrompt(raw)
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompt": prompt, "legacy": legacy})
			return
		}
		offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
		if r.URL.Query().Get("offset") == "" {
			offset, err = 0, nil
		}
		if err != nil || offset < 0 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "分页位置无效"})
			return
		}
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if len([]rune(query)) > 100 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "搜索词最多100字"})
			return
		}
		filter := r.URL.Query().Get("status")
		if filter != "" && filter != "adopted" && filter != "pending" && filter != "trashed" && filter != "failed" && filter != "running" {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "模板状态无效"})
			return
		}
		// instr treats user search as literal text, including percent/underscore characters.
		cte := `WITH templates AS (SELECT s.*, CASE WHEN s."status"!='completed' THEN s."status"
   WHEN EXISTS (SELECT 1 FROM "CoverMemoryEntry" e WHERE e."workspaceId"=s."workspaceId" AND e."sampleId"=s."id" AND e."status"='adopted') THEN 'adopted'
   WHEN EXISTS (SELECT 1 FROM "CoverMemoryEntry" e WHERE e."workspaceId"=s."workspaceId" AND e."sampleId"=s."id" AND e."status"='pending') THEN 'pending' ELSE 'trashed' END AS templateStatus
   FROM "CoverMemorySample" s WHERE s."workspaceId"=?) `
		where := ` WHERE (?='' OR instr(lower("title" || ' ' || "id" || ' ' || "deconstruction"),lower(?))>0) AND (?='' OR templateStatus=?)`
		args := []any{workspace, query, query, filter, filter}
		var total int
		if err := db.QueryRowContext(r.Context(), cte+`SELECT count(*) FROM templates`+where, args...).Scan(&total); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取模板数量失败"})
			return
		}
		rows, err := db.QueryContext(r.Context(), cte+`SELECT "id","title","imageUrls",templateStatus,"createdAt","updatedAt","error" FROM templates`+where+` ORDER BY "createdAt" DESC,"id" DESC LIMIT 24 OFFSET ?`, append(args, offset)...)
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取模板库失败"})
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var id, title, images, status, created, updated, message string
			if err := rows.Scan(&id, &title, &images, &status, &created, &updated, &message); err != nil {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取模板失败"})
				return
			}
			urls := []string{}
			_ = json.Unmarshal([]byte(images), &urls)
			items = append(items, map[string]any{"id": id, "title": title, "imageUrls": urls, "status": status, "createdAt": created, "updatedAt": updated, "error": message})
		}
		if rows.Err() != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取模板失败"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "templates": items, "total": total, "offset": offset, "pageSize": 24})
	})
}

func coverTemplatePrompt(raw string) (string, bool) {
	var parsed map[string]any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return "", true
	}
	if prompt := strings.TrimSpace(textOf(parsed["templatePrompt"])); prompt != "" {
		return prompt, false
	}
	parts := []string{"生成一张{{画幅比例}}的中文商品封面。以新上传的{{商品图}}为唯一外观依据，保留真实结构、比例、颜色和品牌标识。"}
	for _, key := range []string{"layout", "subject", "background", "typeface", "textColor", "harmony"} {
		rule, _ := coverRuleOf(parsed[key])
		if rule != "" {
			parts = append(parts, rule)
		}
	}
	if len(parts) == 1 {
		return "", true
	}
	parts = append(parts, "主标题逐字使用「{{封面标题}}」，按具体字数适配排版；补充要求为{{补充要求}}。不迁移原样张品牌、型号、原文案与无关配件，文字不能遮挡重要识别区，不生成未指定文字、水印或二维码。")
	return strings.Join(parts, "\n\n"), true
}

func updateCoverTemplate(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string) {
	var body struct {
		ExpectedUpdatedAt string  `json:"expectedUpdatedAt"`
		Title             *string `json:"title"`
		Prompt            *string `json:"prompt"`
		Status            *string `json:"status"`
	}
	if decodeCoverBody(r, &body) != nil || body.Title == nil && body.Prompt == nil && body.Status == nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "模板修改内容无效"})
		return
	}
	if body.Title != nil && (strings.TrimSpace(*body.Title) == "" || len([]rune(*body.Title)) > 200) || body.Prompt != nil && (len([]rune(strings.TrimSpace(*body.Prompt))) < 50 || len([]rune(*body.Prompt)) > 6000) || body.Status != nil && !validCoverStatus(*body.Status) {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "名称需1–200字，提示词需50–6000字，状态需有效"})
		return
	}
	id := r.PathValue("id")
	err := mutateCoverExperience(r.Context(), db, workspace, "更新封面模板", func(tx *sql.Tx) error {
		var raw, status, updated string
		if err := tx.QueryRowContext(r.Context(), `SELECT "deconstruction","status","updatedAt" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&raw, &status, &updated); err != nil {
			return err
		}
		if body.ExpectedUpdatedAt != "" && body.ExpectedUpdatedAt != updated {
			return errTemplateConflict
		}
		if status != "completed" {
			return sql.ErrNoRows
		}
		if body.Title != nil {
			if _, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemorySample" SET "title"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, strings.TrimSpace(*body.Title), coverNow(), workspace, id); err != nil {
				return err
			}
		}
		if body.Prompt != nil {
			parsed := map[string]any{}
			_ = json.Unmarshal([]byte(raw), &parsed)
			if parsed == nil {
				parsed = map[string]any{}
			}
			parsed["templatePrompt"] = strings.TrimSpace(*body.Prompt)
			data, _ := json.Marshal(parsed)
			raw = string(data)
			if _, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemorySample" SET "deconstruction"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, string(data), coverNow(), workspace, id); err != nil {
				return err
			}
		}
		if body.Status != nil {
			if _, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemorySample" SET "updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, coverNow(), workspace, id); err != nil {
				return err
			}
			result, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemoryEntry" SET "status"=?,"updatedAt"=? WHERE "workspaceId"=? AND "sampleId"=? AND "source"='sample'`, *body.Status, coverNow(), workspace, id)
			if err != nil {
				return err
			}
			count, err := result.RowsAffected()
			if err != nil {
				return err
			}
			if count == 0 && *body.Status != "trashed" {
				parsed := map[string]any{}
				_ = json.Unmarshal([]byte(raw), &parsed)
				entries := entriesFromDeconstruction(id, parsed)
				if len(entries) == 0 {
					prompt, _ := coverTemplatePrompt(raw)
					if prompt == "" {
						return errors.New("缺少可恢复的模板内容")
					}
					entries = []coverEntry{{ID: coverID("entry"), Branch: "layout", Rule: "以本样张的完整模板为设计依据", SampleID: id, Source: "sample"}}
				}
				for index := range entries {
					entries[index].Status = *body.Status
				}
				return insertCoverEntries(r.Context(), tx, workspace, entries)
			}
			return nil
		}
		return nil
	})
	if err != nil {
		code := 500
		if err == sql.ErrNoRows {
			code = 404
		}
		if errors.Is(err, errTemplateConflict) {
			httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": err.Error()})
			return
		}
		httpx.WriteJSON(w, code, map[string]any{"success": false, "error": "模板不存在、尚未完成或保存失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true})
}

func exportCoverTemplates(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string) {
	rows, err := db.QueryContext(r.Context(), `SELECT "id","title","imageUrls","deconstruction","createdAt","updatedAt" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "status"='completed' ORDER BY "createdAt","id"`, workspace)
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "导出模板失败"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, title, images, raw, created, updated string
		if err := rows.Scan(&id, &title, &images, &raw, &created, &updated); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "导出模板失败"})
			return
		}
		prompt, legacy := coverTemplatePrompt(raw)
		urls := []string{}
		_ = json.Unmarshal([]byte(images), &urls)
		items = append(items, map[string]any{"id": id, "title": title, "imageUrls": urls, "prompt": prompt, "legacy": legacy, "deconstruction": raw, "createdAt": created, "updatedAt": updated})
	}
	if rows.Err() != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "导出模板失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "format": "beike-cover-templates-v1", "templates": items})
}
