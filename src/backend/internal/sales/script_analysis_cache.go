package sales

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
)

var scriptAnalysisPending sync.Map

// Waiters recheck persisted results after the owner exits, including after a canceled first attempt.
func lockScriptAnalysis(ctx context.Context, key string) (func(), error) {
	for {
		done := make(chan struct{})
		current, loaded := scriptAnalysisPending.LoadOrStore(key, done)
		if !loaded {
			return func() { scriptAnalysisPending.Delete(key); close(done) }, nil
		}
		select {
		case <-current.(chan struct{}):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}
func analysisRouteKey(model, base, protocol, effort string, responses bool) string {
	route, _ := json.Marshal([]any{"analysis-v3", scriptOutputFields, model, base, protocol, responses, effort})
	digest := sha256.Sum256(route)
	return hex.EncodeToString(digest[:])
}
