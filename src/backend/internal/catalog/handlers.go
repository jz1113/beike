package catalog

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

func Categories(cfg config.Config) http.Handler      { return categoriesHandler(cfg) }
func CategoryPreview(cfg config.Config) http.Handler { return categoryPreviewHandler(cfg) }
func CategoryApply(cfg config.Config) http.Handler   { return categoryApplyHandler(cfg) }
func Prompts(cfg config.Config) http.Handler         { return promptRecordsHandler(cfg) }
func CreatePrompts(cfg config.Config) http.Handler   { return promptRecordsCreateHandler(cfg) }
func DeletePrompts(cfg config.Config) http.Handler   { return promptRecordsDeleteHandler(cfg) }
func Styles(cfg config.Config) http.Handler          { return styleRecipesHandler(cfg) }
func CreateStyle(cfg config.Config) http.Handler     { return styleRecipesPostHandler(cfg) }
func UpdateStyle(cfg config.Config) http.Handler     { return styleRecipesPutHandler(cfg) }
func DeleteStyle(cfg config.Config) http.Handler     { return styleRecipesDeleteHandler(cfg) }
func ParseLink(cfg config.Config) http.Handler       { return parseLinkHandler(cfg) }
func ExtractStyle(cfg config.Config) http.Handler    { return extractStyleHandler(cfg) }
func Products(cfg config.Config) http.Handler        { return productsHandler(cfg) }
func CreateProduct(cfg config.Config) http.Handler   { return productsCreateHandler(cfg) }
func UpdateProduct(cfg config.Config) http.Handler   { return productsUpdateHandler(cfg) }
func DeleteProduct(cfg config.Config) http.Handler   { return productsDeleteHandler(cfg) }
func Collect(cfg config.Config) http.Handler         { return collectHandler(cfg) }
func DisabledSeed() http.Handler                     { return disabledSeedHandler() }
