package sales

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

type studioBgmImportRequest struct {
	Title       string   `json:"title"`
	AudioURL    string   `json:"audioUrl"`
	VideoURL    string   `json:"videoUrl"`
	BuiltinID   string   `json:"builtinId"`
	StartSec    float64  `json:"startSec"`
	DurationSec *float64 `json:"durationSec"`
}

func (body *studioBgmImportRequest) validate() error {
	body.Title, body.AudioURL = strings.TrimSpace(body.Title), strings.TrimSpace(body.AudioURL)
	body.VideoURL, body.BuiltinID = strings.TrimSpace(body.VideoURL), strings.TrimSpace(body.BuiltinID)
	sources := 0
	for _, value := range []string{body.AudioURL, body.VideoURL, body.BuiltinID} {
		if value != "" {
			sources++
		}
	}
	if sources != 1 || len([]rune(body.Title)) > 200 || len(body.AudioURL) > 8192 || len(body.VideoURL) > 8192 || len(body.BuiltinID) > 120 {
		return errors.New("请选择一个音频、参考视频或内置配乐来源，名称不超过 200 字")
	}
	if math.IsNaN(body.StartSec) || math.IsInf(body.StartSec, 0) || body.StartSec < 0 || body.StartSec > 600 {
		return errors.New("开始时间需在 0–600 秒之间")
	}
	if d := body.DurationSec; d != nil && (math.IsNaN(*d) || math.IsInf(*d, 0) || *d < 1 || *d > 600) {
		return errors.New("保存时长需在 1–600 秒之间")
	}
	return nil
}

func StudioBuiltinBgms() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "bgms": builtinStudioBgms})
	}
}

func StudioBgmImport(cfg config.Config) http.HandlerFunc {
	return studioBgmImportHandler(cfg, network.SafeClient())
}

func studioBgmImportHandler(cfg config.Config, client audioMixMediaClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body studioBgmImportRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			fail(400, "配乐导入请求格式错误")
			return
		}
		if err := body.validate(); err != nil {
			fail(400, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()
		workspace := httpx.WorkspaceFrom(r)
		input, track, cleanup, err := prepareStudioBgmInput(ctx, cfg, workspace, body, client)
		defer cleanup()
		if err != nil {
			fail(400, err.Error())
			return
		}
		duration, err := system.ProbeAudioDuration(ctx, cfg.Root, input)
		if err != nil {
			fail(400, err.Error())
			return
		}
		duration -= body.StartSec
		if body.DurationSec != nil {
			duration = math.Min(duration, *body.DurationSec)
		}
		if duration < 1 || duration > 600 {
			fail(400, "保存片段需为 1–600 秒，请调整开始时间或截取长度")
			return
		}
		hash := fileHash(input)
		if hash == "" {
			fail(500, "读取配乐文件失败，请重试")
			return
		}
		// Include workspace and source kind; identical uploads and retries share a row,
		// while a video extraction never inherits a separately imported track's license.
		identity, _ := json.Marshal([]any{workspace, hash, body.VideoURL != "", body.BuiltinID, body.StartSec, duration})
		sum := sha256.Sum256(identity)
		track.ID = "bgm_custom_" + hex.EncodeToString(sum[:16])
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			fail(500, "声音资产库暂不可用")
			return
		}
		defer db.Close()
		if existing, found, err := readStudioBgm(ctx, db, workspace, track.ID); err != nil {
			fail(500, "读取配乐资产失败")
			return
		} else if found {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "bgm": existing})
			return
		}
		output, audioURL, measured, err := renderStudioBgm(ctx, cfg.Root, workspace, input, body.StartSec, duration)
		if err != nil {
			fail(400, err.Error())
			return
		}
		track.AudioURL, track.DurationSec = audioURL, measured
		track.Source, track.Editable = "custom_bgm", true
		if body.Title != "" {
			track.Title = body.Title
		}
		saved, inserted, err := saveImportedStudioBgm(ctx, db, workspace, track, body)
		if err != nil || !inserted {
			_ = os.Remove(output)
		}
		if err != nil {
			fail(500, "保存配乐资产失败，请重试")
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "bgm": saved})
	}
}
