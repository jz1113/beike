package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpapi "beike.local/cloud/src/backend/internal/app"
	"beike.local/cloud/src/backend/internal/assets"
	"beike.local/cloud/src/backend/internal/assistant"
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/keywordreview"
	"beike.local/cloud/src/backend/internal/library"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
	"beike.local/cloud/src/backend/internal/system"
)

func main() {
	cfg := config.Load()
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		path := cfg.DatabasePath
		if len(os.Args) > 2 {
			path = os.Args[2]
		}
		if path == "" {
			log.Fatal("缺少数据库路径")
		}
		if err := migrate.Run(path, cfg.Root, false); err != nil {
			log.Fatal(err)
		}
		return
	}
	if cfg.DatabasePath != "" {
		runSchema(cfg.Root, cfg.DatabasePath, !cfg.Production())
		if err := database.Check(cfg.DatabasePath); err != nil {
			log.Printf("[API] 数据库检查未完成: %v", err)
		}
		if count, err := database.FailOrphanTasks(cfg.DatabasePath); err != nil {
			log.Printf("[API] 任务自愈未完成: %v", err)
		} else if count > 0 {
			log.Printf("→ [任务自愈] 已自动终止 %d 个未提交的生成任务", count)
		}
		go maintain(cfg)
		sweep(cfg)
		if interrupted, err := library.RecoverDeconstructJobs(cfg); err != nil {
			log.Printf("[API] 后台反推恢复未完成: %v", err)
		} else if interrupted > 0 {
			log.Printf("→ [后台反推] %d 个遗留任务已暂停，未自动重放模型请求", interrupted)
		}
	}
	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           httpapi.New(cfg),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("→ 贝壳云图 Go API http://%s", cfg.Addr())
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	library.DrainDeconstructJobs(5 * time.Second)
	generate.DrainDepthVideo(5 * time.Second)
	assistant.FlushTelemetry()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[API] 关闭超时: %v", err)
	}
}

func runSchema(root, dbPath string, adoptLocal bool) {
	if err := migrate.Run(dbPath, root, adoptLocal); err != nil {
		log.Printf("[API] 数据库迁移未完成: %v", err)
	}
}

func maintain(cfg config.Config) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		if count, err := database.FailOrphanTasks(cfg.DatabasePath); err == nil && count > 0 {
			log.Printf("→ [任务自愈] 周期扫描已终止 %d 个未提交的生成任务", count)
		}
		_ = database.Checkpoint(cfg.DatabasePath)
		sweep(cfg)
	}
}

func sweep(cfg config.Config) {
	if count := keywordreview.PurgeExpiredReceipts(time.Now()); count > 0 {
		log.Printf("→ [提交收据] 已清理 %d 个过期收据", count)
	}
	if count := system.PurgeExpiredMediaReviews(cfg.MediaReviewRoot(), time.Now()); count > 0 {
		log.Printf("→ [媒体审查] 已清理 %d 个过期待核记录", count)
	}
	assets.CleanupAssistantMedia(time.Now())
}
