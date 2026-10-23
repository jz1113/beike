package keywords

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

func Balance() http.Handler                 { return keywordBalanceHandler() }
func Review(cfg config.Config) http.Handler { return keywordReviewHandler(cfg) }
func RulesGet(cfg config.Config) http.Handler {
	return keywordRulesGetHandler(cfg)
}
func RulesPut(cfg config.Config) http.Handler { return keywordRulesPutHandler(cfg) }
