package catalog

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/httpx"
)

func disabledSeedHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "官方预置资产已禁用",
			"seeded":  map[string]int{"scenes": 0, "outfits": 0, "actions": 0, "personas": 0},
		})
	}
}
