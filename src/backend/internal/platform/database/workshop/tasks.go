package workshop

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"strings"
	"unicode/utf16"
)

const promptSummaryLength = 120

type TaskQuery struct {
	ID        string
	ProductID string
	Status    string
	Search    string
	Detail    bool
	Page      int
	PageSize  int
}

func ListImageTasks(ctx context.Context, db *sql.DB, workspace string, query TaskQuery) (int, []map[string]any, error) {
	where := []string{`t."workspaceId" = ?`}
	args := []any{workspace}
	if query.ProductID != "" {
		where = append(where, `t."productId" = ?`)
		args = append(args, query.ProductID)
	}
	if query.Status != "" && query.Status != "all" {
		where = append(where, `t."status" = ?`)
		args = append(args, query.Status)
	}
	if query.Search != "" {
		where = append(where, `t."prompt" LIKE ? ESCAPE '\'`)
		args = append(args, "%"+database.EscapeLike(query.Search)+"%")
	}
	filter := strings.Join(where, " AND ")
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ImageTask" t WHERE `+filter, args...).Scan(&total); err != nil {
		return 0, nil, err
	}
	rows, err := db.QueryContext(ctx, `
		SELECT t."id", t."taskId", t."prompt", t."model", t."mediaType", t."size", t."quality", t."status", t."resultUrl", t."failReason", t."createdAt",
		       p."id", p."title", p."picUrl", p."platform"
		FROM "ImageTask" t
		LEFT JOIN "Product" p ON p."id" = t."productId"
		WHERE `+filter+`
		ORDER BY t."createdAt" DESC
		LIMIT ? OFFSET ?`, append(append([]any{}, args...), query.PageSize, (query.Page-1)*query.PageSize)...)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	tasks, err := scanTasks(rows, query.Detail)
	if err != nil {
		return 0, nil, err
	}
	return total, tasks, rows.Err()
}

func FindImageTask(ctx context.Context, db *sql.DB, workspace, id string) (map[string]any, bool, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT t."id", t."taskId", t."prompt", t."model", t."mediaType", t."size", t."quality", t."status", t."resultUrl", t."failReason", t."createdAt",
		       p."id", p."title", p."picUrl", p."platform"
		FROM "ImageTask" t
		LEFT JOIN "Product" p ON p."id" = t."productId"
		WHERE t."workspaceId" = ? AND (t."id" = ? OR t."taskId" = ?)
		LIMIT 1`, workspace, id, id)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	tasks, err := scanTasks(rows, true)
	if err != nil {
		return nil, false, err
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if len(tasks) == 0 {
		return nil, false, nil
	}
	return tasks[0], true, nil
}

func scanTasks(rows *sql.Rows, detail bool) ([]map[string]any, error) {
	tasks := []map[string]any{}
	for rows.Next() {
		var id, prompt, status, createdAt string
		var taskID, model, mediaType, size, quality, resultURL, failReason sql.NullString
		var productID, productTitle, productPic, platform sql.NullString
		if err := rows.Scan(&id, &taskID, &prompt, &model, &mediaType, &size, &quality, &status, &resultURL, &failReason, &createdAt, &productID, &productTitle, &productPic, &platform); err != nil {
			return nil, err
		}
		reason := database.NullText(failReason)
		if !detail {
			if text, ok := reason.(string); ok && text != "" {
				reason = truncateJS(text)
			} else {
				reason = nil
			}
		}
		var product any
		if productID.Valid {
			product = map[string]any{"id": productID.String, "title": database.NullText(productTitle), "picUrl": database.NullText(productPic), "platform": database.NullText(platform)}
		}
		tasks = append(tasks, map[string]any{
			"id": id, "taskId": database.NullText(taskID), "prompt": prompt, "promptSnippet": truncateJS(prompt),
			"model": database.NullText(model), "mediaType": database.NullText(mediaType), "size": database.NullText(size), "quality": database.NullText(quality),
			"status": status, "resultUrl": database.NullText(resultURL), "failReason": reason,
			"createdAt": database.FormatSQLiteTime(createdAt), "product": product,
		})
	}
	return tasks, nil
}

func truncateJS(value string) string {
	units := utf16.Encode([]rune(value))
	if len(units) <= promptSummaryLength {
		return value
	}
	return string(utf16.Decode(units[:promptSummaryLength])) + "…"
}
