package assistant

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

var memoryLocks sync.Map

func Memory(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		threadID := r.PathValue("threadId")
		if threadID == "" || len(threadID) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "会话标识无效"})
			return
		}
		var body []byte
		if r.Method != http.MethodGet {
			var err error
			body, err = io.ReadAll(io.LimitReader(r.Body, 4097))
			if err != nil || len(body) == 0 || len(body) > 4096 {
				status := http.StatusBadRequest
				if len(body) > 4096 {
					status = http.StatusRequestEntityTooLarge
				}
				httpx.WriteJSON(w, status, map[string]any{"success": false, "error": "记忆设置内容过大或为空"})
				return
			}
			if !json.Valid(body) {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效 JSON"})
				return
			}
		}
		deleted, err := threadDeleted(cfg, r, threadID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "无法读取或保存会话记忆"})
			return
		}
		if deleted {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "会话已删除"})
			return
		}
		if r.Method == http.MethodGet {
			view, err := readMemory(r, threadID)
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "无法读取或保存会话记忆"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "memory": view})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "记忆设置格式无效"})
			return
		}
		enabled, enabledOK := optionalBool(payload, "enabled")
		clear, clearOK := optionalBool(payload, "clear")
		if !enabledOK || !clearOK {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "记忆设置格式无效"})
			return
		}
		view, err := configureMemory(r, threadID, enabled, clear)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "无法读取或保存会话记忆"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "memory": view})
	})
}

func threadDeleted(cfg config.Config, r *http.Request, threadID string) (bool, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return false, err
	}
	defer db.Close()
	var messages string
	err = db.QueryRowContext(r.Context(), `SELECT "messagesJson" FROM "AssistantThread" WHERE "id" = ?`, threadID).Scan(&messages)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return messages == deletedThreadMessages, nil
}

func readMemory(r *http.Request, threadID string) (map[string]any, error) {
	record, err := loadMemory(memoryPath(r, threadID))
	if err != nil {
		return nil, err
	}
	return memoryView(record), nil
}

func configureMemory(r *http.Request, threadID string, enabled *bool, clear *bool) (map[string]any, error) {
	path := memoryPath(r, threadID)
	lock := memoryLock(path)
	lock.Lock()
	defer lock.Unlock()
	record, err := loadMemory(path)
	if err != nil {
		return nil, err
	}
	if clear != nil && *clear {
		kept := record.Enabled
		record = emptyMemory()
		record.Enabled = kept
		record.ClearedAt = time.Now().UnixMilli()
	}
	if enabled != nil {
		record.Enabled = *enabled
	}
	if err := saveMemory(path, record); err != nil {
		return nil, err
	}
	return memoryView(record), nil
}

type memoryRecord struct {
	Version      int              `json:"version"`
	Enabled      bool             `json:"enabled"`
	Summary      string           `json:"summary"`
	UpdatedAt    int64            `json:"updatedAt"`
	ClearedAt    int64            `json:"clearedAt"`
	CoveredCount int              `json:"coveredCount"`
	Seen         []string         `json:"seen"`
	Pending      []map[string]any `json:"pending"`
}

func emptyMemory() memoryRecord {
	return memoryRecord{Version: 1, Enabled: true, Seen: []string{}, Pending: []map[string]any{}}
}

func memoryView(record memoryRecord) map[string]any {
	return map[string]any{
		"enabled": record.Enabled, "summary": record.Summary, "updatedAt": record.UpdatedAt,
		"coveredCount": record.CoveredCount, "pendingCount": len(record.Pending),
	}
}

func loadMemory(path string) (memoryRecord, error) {
	body, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return emptyMemory(), nil
	}
	if err != nil {
		return memoryRecord{}, err
	}
	var record memoryRecord
	if json.Unmarshal(body, &record) != nil {
		return memoryRecord{}, os.ErrInvalid
	}
	if record.Pending == nil {
		record.Pending = []map[string]any{}
	}
	return record, nil
}

func saveMemory(path string, record memoryRecord) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	body, err := json.Marshal(record)
	if err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, body, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

func memoryPath(r *http.Request, threadID string) string {
	sum := sha256.Sum256([]byte(threadID))
	base := os.Getenv("AZHUO_USER_DATA_DIR")
	if base == "" {
		home := os.Getenv("HOME")
		if home == "" {
			home = os.TempDir()
		}
		base = filepath.Join(home, "Library", "Application Support", "com.azhuo.workbench")
	}
	return filepath.Join(base, "agent-telemetry", httpx.WorkspaceFrom(r), hex.EncodeToString(sum[:])+".json")
}

func memoryLock(path string) *sync.Mutex {
	value, _ := memoryLocks.LoadOrStore(path, &sync.Mutex{})
	return value.(*sync.Mutex)
}

func optionalBool(payload map[string]any, key string) (*bool, bool) {
	value, exists := payload[key]
	if !exists || value == nil {
		return nil, true
	}
	flag, ok := value.(bool)
	if !ok {
		return nil, false
	}
	return &flag, true
}
