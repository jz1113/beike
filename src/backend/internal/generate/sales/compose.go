package sales

import (
	"fmt"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

// Compose retains the retired URL so older clients receive an explicit, non-billable failure.
func Compose(_ config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		workflowError(w, http.StatusGone, fmt.Errorf("逐镜拼接已停用；历史片段可查询和下载，请更新脚本后一次生成整段视频"))
	})
}
