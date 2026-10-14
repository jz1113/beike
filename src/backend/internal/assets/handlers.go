package assets

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

func StorageStats(cfg config.Config) http.Handler { return storageStatsHandler(cfg) }
func ClearDerived(cfg config.Config) http.Handler { return clearDerivedStorageHandler(cfg) }
func Upload(cfg config.Config) http.Handler       { return storageUploadHandler(cfg) }
func TestStorage(cfg config.Config) http.Handler  { return storageTestHandler(cfg) }
func Migrate(cfg config.Config) http.Handler      { return storageMigrateHandler(cfg) }
func Tasks(cfg config.Config) http.Handler        { return assetTasksHandler(cfg) }
func DeleteTasks(cfg config.Config) http.Handler  { return assetTasksDeleteHandler(cfg) }
func Performance(cfg config.Config) http.Handler  { return assetPerformanceHandler(cfg) }
func Lifecycle(cfg config.Config, action string) http.Handler {
	return assetLifecycleHandler(cfg, action)
}
func Storage(cfg config.Config) http.Handler { return storageHandler(cfg) }
