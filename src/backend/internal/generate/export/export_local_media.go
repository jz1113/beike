package export

import (
	"net/http"
	"path"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

var legacyExportMedia = regexp.MustCompile(`(?i)^generated/(images|videos)/local/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$`)

func exportLocalMediaAllowed(cfg config.Config, r *http.Request, rel string) bool {
	if path.Clean(rel) != rel || strings.ContainsAny(rel, "\\\x00") {
		return false
	}
	workspace := httpx.WorkspaceFrom(r)
	if storage.WorkspaceRel(rel, workspace, !cfg.Production()) {
		return true
	}
	// Match the storage endpoint's compatibility rules for older, unscoped task media.
	if !legacyExportMedia.MatchString(rel) {
		return false
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return false
	}
	defer db.Close()
	owners, err := database.ImageTaskOwners(r.Context(), db, "/storage/"+rel)
	if err != nil {
		return false
	}
	for _, owner := range owners {
		if owner == workspace {
			return true
		}
	}
	return len(owners) == 0
}
