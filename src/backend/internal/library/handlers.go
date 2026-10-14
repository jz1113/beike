package library

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

func SourceCheck(cfg config.Config) http.Handler     { return sourceCheckHandler(cfg) }
func SourceCheckPost(cfg config.Config) http.Handler { return sourceCheckPostHandler(cfg) }
func Reviews(cfg config.Config) http.Handler         { return deconstructReviewsHandler(cfg) }
func ReviewsPost(cfg config.Config) http.Handler     { return deconstructReviewsPostHandler(cfg) }
func Get(cfg config.Config) http.Handler             { return libraryGetHandler(cfg) }
func Post(cfg config.Config) http.Handler            { return libraryPostHandler(cfg) }
func Put(cfg config.Config) http.Handler             { return libraryPutHandler(cfg) }
func Delete(cfg config.Config) http.Handler          { return libraryDeleteHandler(cfg) }
func MotherReplacement(cfg config.Config) http.Handler {
	return motherReplacementHandler(cfg)
}
func DeconstructJobs(cfg config.Config) http.Handler     { return deconstructJobsHandler(cfg) }
func DeconstructJobsPost(cfg config.Config) http.Handler { return deconstructJobsPostHandler(cfg) }
func DeconstructProgress(cfg config.Config) http.Handler { return deconstructProgressHandler(cfg) }
func Deconstruct(cfg config.Config) http.Handler         { return deconstructRequestHandler(cfg) }
