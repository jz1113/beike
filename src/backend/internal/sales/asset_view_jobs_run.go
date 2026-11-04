package sales

import (
	"context"
	"fmt"
	"log"
	"maps"
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
	if err := runAssetCreation(ctx, cfg, db, request, &job, advance); err != nil {
		fail(err)
		return
	}
	if len(job.Images) != len(job.outputViews()) {
		if job.checkpoint.TaskID == "" && job.checkpoint.ResultURL == "" && assetCreationText(job.generation["prompt"]) == "" {
			prompt, err := loadSalesPrompt(ctx, cfg, workspace, job.Kind+"-grid")
			if err != nil {
				fail(err)
				return
			}
			job.generation["prompt"] = prompt.Prompt
			job.generation["metadata"] = map[string]any{"workflow": "sales_" + job.Kind + "_view", "layout": "3x3", "promptVersion": prompt.Version}
		}
		if err := advance("generating"); err != nil {
			fail(err)
			return
		}
		payload := job.generation
		if job.gridKind() == personaStrip {
			payload = maps.Clone(job.generation)
			var description string
			if creation := assetCreationSettings(job.generation); creation != nil {
				description = assetCreationText(creation["prompt"])
				ref := assetCreationText(creation["referenceImageUrl"])
				payload["useReferenceImage"], payload["referenceImageUrl"], payload["referenceImages"] = true, ref, []any{ref}
			} else if creation := assetCreationFromData(job.assetData); creation != nil {
				description = creation.Prompt
			}
			if description != "" {
				payload["prompt"] = assetCreationText(payload["prompt"]) + "\n\n人物参考描述：\n" + description
			}
		}
		checkpoint, err := generate.RunImageTask(cfg, request.Clone(ctx), payload, job.Key, job.checkpoint, func(checkpoint generate.ImageTaskCheckpoint) error {
			job.checkpoint = checkpoint
			return persistAssetViewJob(ctx, db, workspace, &job)
		})
		job.checkpoint = checkpoint
		if err != nil {
			fail(err)
			return
		}
		stage := "cropping"
		whole := job.wholeSheet()
		if whole {
			stage = "saving"
		}
		if err := advance(stage); err != nil {
			fail(err)
			return
		}
		select {
		case assetGridSlots <- struct{}{}:
		case <-ctx.Done():
			fail(ctx.Err())
			return
		}
		images, err := storeAssetViewJobResult(ctx, job.checkpoint.ResultURL, job.gridKind(), workspace, whole)
		<-assetGridSlots
		if err != nil {
			fail(fmt.Errorf("视角图已生成，保存失败，可继续补全：%w", err))
			return
		}
		job.Images = map[string]string{}
		for _, image := range images {
			job.Images[image.View] = image.URL
		}
	}
	if state := assetCreationSettings(job.generation); job.gridKind() == personaStrip && state != nil {
		main := assetViewJobMain(job.Kind, job.assetData)
		if main == "" {
			main = job.Images["sheet"]
			if main == "" {
				main = job.Images["face"]
			}
		}
		state["imageUrl"] = main
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

func storeAssetViewJobResult(ctx context.Context, source, kind, workspace string, whole bool) ([]assetGridImage, error) {
	data, err := readAssetGrid(ctx, source, workspace)
	if err != nil {
		return nil, err
	}
	return storeAssetViewResult(ctx, data, kind, workspace, whole)
}
