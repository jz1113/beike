package sales

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func runAssetViewJob(cfg config.Config, request *http.Request, job assetViewJob) {
	workspace := httpx.WorkspaceFrom(request)
	defer func() {
		assetViewJobMu.Lock()
		delete(assetViewJobActive, assetViewJobIdentity(cfg.SQLiteFile(), workspace, job.ID))
		assetViewJobMu.Unlock()
	}()
	// Waiting behind other uploads must not consume the per-model execution
	// budget. The queue is capped separately and credentials remain in memory.
	ctx, cancel := context.WithTimeout(request.Context(), 24*time.Hour)
	defer cancel()
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		log.Printf("[sales-views] open task database: %v", err)
		return
	}
	defer db.Close()
	fail := func(err error) {
		job.Status, job.Error = "failed", err.Error()
		writeCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer stop()
		if saveErr := persistAssetViewJob(writeCtx, db, workspace, &job); saveErr != nil {
			log.Printf("[sales-views] persist task failure: %v", saveErr)
		}
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			fail(fmt.Errorf("后台生成中断：%v", recovered))
		}
	}()
	select {
	case assetViewJobSlots <- struct{}{}:
		defer func() { <-assetViewJobSlots }()
	case <-ctx.Done():
		fail(ctx.Err())
		return
	}
	executionCtx, cancelExecution := context.WithTimeout(ctx, 20*time.Minute)
	defer cancelExecution()
	ctx = executionCtx
	// Deleting the base asset while queued must not trigger a paid generation.
	table, _, _ := assetViewJobAssetTable(job.Kind)
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "`+table+`" WHERE "id"=? AND "workspaceId"=?`, job.AssetID, workspace).Scan(&exists); err != nil {
		fail(err)
		return
	}
	if exists != 1 {
		fail(fmt.Errorf("资产已删除，后台生成已停止"))
		return
	}
	advance := func(status string) error {
		job.Status, job.Error = status, ""
		return persistAssetViewJob(ctx, db, workspace, &job)
	}
	if len(job.Images) != 9 {
		if err := advance("generating"); err != nil {
			fail(err)
			return
		}
		checkpoint, err := generate.RunImageTask(cfg, request.Clone(ctx), job.generation, job.Key, job.checkpoint, func(checkpoint generate.ImageTaskCheckpoint) error {
			job.checkpoint = checkpoint
			return persistAssetViewJob(ctx, db, workspace, &job)
		})
		job.checkpoint = checkpoint
		if err != nil {
			fail(err)
			return
		}
		if err := advance("cropping"); err != nil {
			fail(err)
			return
		}
		select {
		case assetGridSlots <- struct{}{}:
		case <-ctx.Done():
			fail(ctx.Err())
			return
		}
		images, err := cropAssetViewJob(ctx, job.checkpoint.ResultURL, job.Kind, workspace)
		<-assetGridSlots
		if err != nil {
			fail(fmt.Errorf("九宫格已生成，裁切保存失败，可继续补全：%w", err))
			return
		}
		job.Images = map[string]string{}
		for _, image := range images {
			job.Images[image.View] = image.URL
		}
	}
	if err := advance("saving"); err != nil {
		fail(err)
		return
	}
	if err := saveAssetViewJobImages(ctx, db, workspace, job); err != nil {
		fail(fmt.Errorf("生成结果已保留，资产保存失败：%w", err))
		return
	}
	if err := advance("completed"); err != nil {
		fail(err)
	}
}

func cropAssetViewJob(ctx context.Context, source, kind, workspace string) ([]assetGridImage, error) {
	data, err := readAssetGrid(ctx, source, workspace)
	if err != nil {
		return nil, err
	}
	return splitAssetGrid(ctx, data, kind, workspace)
}
