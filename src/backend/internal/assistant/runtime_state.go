package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

type approvalWait struct {
	turnID    string
	workspace string
	decision  chan string
}

type sessionGrant struct {
	tools   map[string]bool
	expires time.Time
}

type activeRun struct {
	workspace string
	threadID  string
	token     uint64
	cancel    context.CancelFunc
}

var turnTokens atomic.Uint64

var (
	approvalMu sync.Mutex
	approvals  = map[string]*approvalWait{}
	grants     = map[string]sessionGrant{}
	activeMu   sync.Mutex
	activeRuns = map[string]*activeRun{}
)

func scopeKey(workspace, id string) string { return workspace + "\x00" + id }

func turnActive(workspace, turnID string) bool {
	activeMu.Lock()
	defer activeMu.Unlock()
	run := activeRuns[scopeKey(workspace, turnID)]
	return run != nil
}

func beginTurn(workspace, threadID, turnID string, cancel context.CancelFunc) (uint64, bool) {
	activeMu.Lock()
	defer activeMu.Unlock()
	key := scopeKey(workspace, turnID)
	if _, exists := activeRuns[key]; exists {
		return 0, false
	}
	token := turnTokens.Add(1)
	activeRuns[key] = &activeRun{workspace: workspace, threadID: threadID, token: token, cancel: cancel}
	return token, true
}

func finishTurn(workspace, turnID string, token uint64) {
	activeMu.Lock()
	defer activeMu.Unlock()
	key := scopeKey(workspace, turnID)
	if run := activeRuns[key]; run != nil && run.token == token {
		delete(activeRuns, key)
	}
}

func effectiveTurnStatus(workspace, turnID, status string) string {
	switch status {
	case "running", "awaiting_approval":
		if !turnActive(workspace, turnID) {
			return "interrupted"
		}
		return status
	case "completed", "interrupted", "failed":
		return status
	default:
		return "failed"
	}
}

func interruptWorkspaceTurn(workspace, turnID string) {
	activeMu.Lock()
	run := activeRuns[scopeKey(workspace, turnID)]
	activeMu.Unlock()
	if run != nil && run.cancel != nil {
		run.cancel()
	}
	rejectTurnApprovals(workspace, turnID)
}

func rejectTurnApprovals(workspace, turnID string) {
	approvalMu.Lock()
	defer approvalMu.Unlock()
	for key, wait := range approvals {
		if wait.workspace == workspace && wait.turnID == turnID {
			settleApproval(wait, "cancel")
			delete(approvals, key)
		}
	}
}

func resolveTurnApproval(workspace, turnID, approvalID, decision string) bool {
	switch decision {
	case "accept", "decline", "acceptForSession", "cancel":
	default:
		return false
	}
	approvalMu.Lock()
	defer approvalMu.Unlock()
	wait := approvals[scopeKey(workspace, turnID+"_"+approvalID)]
	if wait == nil {
		return false
	}
	settleApproval(wait, decision)
	delete(approvals, scopeKey(workspace, turnID+"_"+approvalID))
	return true
}

func settleApproval(wait *approvalWait, decision string) {
	select {
	case wait.decision <- decision:
	default:
	}
}

func waitForApproval(ctx context.Context, workspace, turnID, approvalID string) string {
	if ctx.Err() != nil {
		return "cancel"
	}
	wait := &approvalWait{turnID: turnID, workspace: workspace, decision: make(chan string, 1)}
	key := scopeKey(workspace, turnID+"_"+approvalID)
	approvalMu.Lock()
	if previous := approvals[key]; previous != nil {
		settleApproval(previous, "cancel")
	}
	approvals[key] = wait
	approvalMu.Unlock()
	timer := time.NewTimer(60 * time.Second)
	defer timer.Stop()
	defer func() {
		approvalMu.Lock()
		if approvals[key] == wait {
			delete(approvals, key)
		}
		approvalMu.Unlock()
	}()
	select {
	case decision := <-wait.decision:
		return decision
	case <-timer.C:
		return "decline"
	case <-ctx.Done():
		return "cancel"
	}
}

func sessionTools(workspace, threadID string) map[string]bool {
	approvalMu.Lock()
	defer approvalMu.Unlock()
	now := time.Now()
	for key, grant := range grants {
		if grant.expires.Before(now) {
			delete(grants, key)
		}
	}
	grant := grants[scopeKey(workspace, threadID)]
	copied := map[string]bool{}
	for name := range grant.tools {
		copied[name] = true
	}
	return copied
}

func rememberSessionTool(workspace, threadID, name string) {
	approvalMu.Lock()
	defer approvalMu.Unlock()
	key := scopeKey(workspace, threadID)
	grant := grants[key]
	if grant.tools == nil {
		grant.tools = map[string]bool{}
	}
	grant.tools[name] = true
	grant.expires = time.Now().Add(30 * time.Minute)
	grants[key] = grant
}

func approveAssistantTurn(w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	turnID, _ := rawText(payload["turnId"])
	approvalID, _ := rawText(payload["approvalId"])
	decision, _ := rawText(payload["decision"])
	if !resolveTurnApproval(httpx.WorkspaceFrom(r), turnID, approvalID, decision) {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "审批请求不存在或已过期"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "decision": decision})
}

func interruptAssistantTurn(w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	turnID, _ := rawText(payload["turnId"])
	interruptWorkspaceTurn(httpx.WorkspaceFrom(r), turnID)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}
