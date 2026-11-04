package sales

import (
	"database/sql"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
)

const salesTaskSource = `
 SELECT id,name,kind,status,createdAt,startedAt,
 CASE WHEN status IN ('queued','running') THEN '' ELSE updatedAt END,
 COALESCE(json_extract(NULLIF(retryInput,''),'$.selection'),''), COALESCE(json_extract(NULLIF(result,''),'$.taskId'),''),
 '',error,COALESCE(json_extract(NULLIF(result,''),'$.stage'),''),
 COALESCE(json_extract(NULLIF(result,''),'$.videoUrl'),json_extract(NULLIF(result,''),'$.resultUrl'),'')
 FROM SalesMediaJob WHERE workspaceId=?1
 UNION ALL
 SELECT id,COALESCE(NULLIF(json_extract(assetDataJson,'$.name'),''),NULLIF(json_extract(assetDataJson,'$.title'),''),NULLIF(assetId,''),id),kind,CASE WHEN status IN ('analyzing','creating','generating','saving') THEN 'running' ELSE status END,createdAt,'',
 CASE WHEN status IN ('failed','completed') THEN updatedAt ELSE '' END,model,taskId,'',error,CASE status WHEN 'analyzing' THEN '分析素材' WHEN 'creating' THEN '创建资产' WHEN 'generating' THEN '生成视角图' WHEN 'saving' THEN '保存资产' ELSE '' END,resultUrl
 FROM SalesAssetViewJob WHERE workspaceId=?1`

func TaskRecords(cfg config.Config) http.HandlerFunc {
	return taskrecords.Handler(cfg, salesTaskSource, func(db *sql.DB, workspace string) error {
		rows, err := db.Query("SELECT "+mediaJobColumns+" FROM SalesMediaJob WHERE workspaceId=? AND status IN ('queued','running')", workspace)
		if err != nil {
			return err
		}
		var jobs []mediaJob
		for rows.Next() {
			j, err := scanMediaJob(rows)
			if err != nil {
				rows.Close()
				return err
			}
			jobs = append(jobs, j)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range jobs {
			if err := refreshMediaJob(db, workspace, &jobs[i]); err != nil {
				return err
			}
		}
		return nil
	})
}
