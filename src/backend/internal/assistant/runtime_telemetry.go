package assistant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

var telemetrySensitive = regexp.MustCompile(`(?i)secret|password|prompt|cookie|credential|authorization|(api)?[_-]?key$|^token$`)

type telemetryEvent struct {
	Timestamp  int64  `json:"ts"`
	Phase      string `json:"phase"`
	TurnID     string `json:"turnId,omitempty"`
	ThreadID   string `json:"threadId,omitempty"`
	Model      string `json:"model,omitempty"`
	ToolName   string `json:"toolName,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Workspace  string `json:"workspace,omitempty"`
}

var (
	telemetryMu   sync.Mutex
	telemetryWait sync.WaitGroup
	telemetryDir  = func() string { return resolveTelemetryDir() }
)

func resolveTelemetryDir() string {
	if dir := os.Getenv("AZHUO_DATA_DIR"); dir != "" {
		return filepath.Join(dir, "agent-telemetry")
	}
	if dir := os.Getenv("AZHUO_USER_DATA_DIR"); dir != "" {
		return filepath.Join(dir, "agent-telemetry")
	}
	home := os.Getenv("HOME")
	if home == "" {
		home = os.TempDir()
	}
	return filepath.Join(home, "Library", "Application Support", "com.azhuo.workbench", "agent-telemetry")
}

func recordAgentEvent(workspace string, event telemetryEvent) {
	event.Timestamp = time.Now().UnixMilli()
	event.Workspace = workspace
	if telemetrySensitive.MatchString(event.Reason) || telemetrySensitive.MatchString(event.ToolName) {
		event.Reason = ""
	}
	telemetryWait.Add(1)
	go func() {
		defer telemetryWait.Done()
		dir := filepath.Join(telemetryDir(), sanitizeSegment(workspace))
		_ = os.MkdirAll(dir, 0o755)
		path := filepath.Join(dir, "turns-"+time.Now().Format("20060102")+".jsonl")
		telemetryMu.Lock()
		defer telemetryMu.Unlock()
		file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return
		}
		defer file.Close()
		body, err := json.Marshal(event)
		if err != nil {
			return
		}
		_, _ = file.Write(append(body, '\n'))
	}()
}

func FlushTelemetry() { telemetryWait.Wait() }

func sanitizeSegment(value string) string {
	if value == "" {
		return "local"
	}
	out := make([]rune, 0, len(value))
	for _, char := range value {
		if char == '/' || char == '\\' || char == '.' {
			continue
		}
		out = append(out, char)
	}
	if len(out) == 0 {
		return "local"
	}
	return string(out)
}

func noteTurnEvent(workspace, phase, turnID, threadID, model, tool, reason string, started time.Time) {
	recordAgentEvent(workspace, telemetryEvent{
		Phase: phase, TurnID: turnID, ThreadID: threadID, Model: model, ToolName: tool,
		Reason: reason, DurationMs: time.Since(started).Milliseconds(),
	})
}
