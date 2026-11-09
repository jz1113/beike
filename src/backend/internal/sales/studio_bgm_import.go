package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
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

func prepareStudioBgmInput(ctx context.Context, cfg config.Config, workspace string, body studioBgmImportRequest, client audioMixMediaClient) (string, studioBgm, func(), error) {
	track := studioBgm{Title: "上传配乐", Description: "从上传音频保存", MoodTags: []string{"BGM"}, BPM: 100,
		License: "用户上传 · 授权范围以原素材为准", SuitableCategories: []string{"fashion", "beauty", "home", "food", "tech", "other"}}
	if body.BuiltinID != "" {
		builtin, exists := lookupBuiltinBgm(body.BuiltinID)
		if !exists {
			return "", track, func() {}, errors.New("内置配乐不存在")
		}
		file, err := os.CreateTemp("", "sales-bgm-import-*.wav")
		if err != nil {
			return "", track, func() {}, errors.New("准备配乐文件失败")
		}
		cleanup := func() { _ = os.Remove(file.Name()) }
		_, writeErr := file.Write(renderBuiltinBgmWAV(builtin))
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil {
			cleanup()
			return "", track, func() {}, errors.New("写入配乐文件失败")
		}
		return file.Name(), builtin, cleanup, nil
	}
	video, source, limit := body.VideoURL != "", body.AudioURL, audioMixAudioLimit
	if video {
		source, limit = body.VideoURL, audioMixVideoLimit
		track.Title, track.Description = "参考视频原音轨", "保存参考视频的原始音轨；包含原片中已有的人声、音乐和环境声，未分离人声。"
		track.MoodTags = []string{"参考视频原音轨"}
		track.License = "参考视频原音轨 · 授权范围以原素材为准"
	}
	file, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, video, client)
	if err == nil {
		info, statErr := os.Stat(file)
		if statErr != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			err = errors.New("音视频文件不存在或为空")
		} else if info.Size() > limit {
			err = fmt.Errorf("音视频文件超过 %d MB，请截取后再导入", limit>>20)
		}
	}
	return file, track, cleanup, err
}

func renderStudioBgm(ctx context.Context, root, workspace, input string, start, duration float64) (output, audioURL string, measured float64, err error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return "", "", 0, errors.New("FFmpeg 不可用，请检查媒体处理环境")
	}
	rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/audio/%s/sales_bgm_%s.m4a", time.Now().Format("200601"), httpx.RequestID()), workspace)
	output = storage.SafeWithin(storage.ResolveRoot(), rel)
	if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
		return "", "", 0, errors.New("创建配乐保存目录失败")
	}
	defer func() {
		if err != nil {
			_ = os.Remove(output)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	args := append([]string{"-y", "-nostdin", "-v", "error"}, audioMixInputArgs(input)...)
	args = append(args, "-ss", strconv.FormatFloat(start, 'f', 6, 64), "-t", strconv.FormatFloat(duration, 'f', 6, 64),
		"-map", "0:a:0", "-vn", "-map_metadata", "-1", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
		"-fs", strconv.FormatInt(audioMixAudioLimit, 10), "-movflags", "+faststart", output)
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	if cmd.Run() != nil {
		return output, "", 0, errors.New("音轨保存失败，请确认音视频编码受支持后重试")
	}
	measured, err = system.ProbeAudioDuration(ctx, root, output)
	if err != nil || measured < 1 || measured > 601 {
		return output, "", 0, errors.New("保存的音轨不足 1 秒或无法读取，请调整片段后重试")
	}
	return output, "/storage/" + rel, roundTenth(measured), nil
}

func readStudioBgm(ctx context.Context, db *sql.DB, workspace, id string) (studioBgm, bool, error) {
	var track studioBgm
	var raw string
	err := db.QueryRowContext(ctx, `SELECT "name","configJson" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id).Scan(&track.Title, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return track, false, nil
	}
	if err != nil {
		return track, false, err
	}
	title := track.Title
	if err := json.Unmarshal([]byte(raw), &track); err != nil || track.AudioURL == "" {
		return studioBgm{}, false, errors.New("配乐记录无法读取")
	}
	track.ID, track.Title, track.Source, track.Editable = id, title, "custom_bgm", true
	return track, true, nil
}

func resolveStudioMixBgm(ctx context.Context, cfg config.Config, workspace, id string, client audioMixMediaClient) (string, func(), error) {
	if _, found := lookupBuiltinBgm(id); found {
		file, _, cleanup, err := prepareStudioBgmInput(ctx, cfg, workspace, studioBgmImportRequest{BuiltinID: id}, client)
		return file, cleanup, err
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return "", func() {}, errors.New("读取配乐资产库失败")
	}
	defer db.Close()
	track, found, err := readStudioBgm(ctx, db, workspace, id)
	if err != nil {
		return "", func() {}, errors.New("读取配乐资产失败")
	}
	if !found {
		return "", func() {}, errors.New("配乐不存在或不属于当前工作区")
	}
	return resolveAudioMixMedia(ctx, track.AudioURL, workspace, false, client)
}

func saveImportedStudioBgm(ctx context.Context, db *sql.DB, workspace string, track studioBgm, body studioBgmImportRequest) (studioBgm, bool, error) {
	metadata := map[string]any{
		"audioUrl": track.AudioURL, "description": track.Description, "moodTags": track.MoodTags,
		"bpm": track.BPM, "durationSec": track.DurationSec, "license": track.License,
		"suitableCategories": track.SuitableCategories, "importStartSec": body.StartSec,
		"importSource": "audio", "builtinId": body.BuiltinID,
	}
	if body.VideoURL != "" {
		metadata["importSource"] = "reference_video"
	} else if body.BuiltinID != "" {
		metadata["importSource"] = "builtin"
	}
	raw, _ := json.Marshal(metadata)
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.ExecContext(ctx, `INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","category","configJson","isDefault","createdAt","updatedAt") VALUES (?,?,?,?,?,0,?,?) ON CONFLICT("id") DO NOTHING`,
		track.ID, workspace, track.Title, customBgmPresetCategory, string(raw), now, now)
	if err != nil {
		return studioBgm{}, false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return studioBgm{}, false, err
	}
	if count > 0 {
		return track, true, nil
	}
	existing, found, err := readStudioBgm(ctx, db, workspace, track.ID)
	if err == nil && !found {
		err = errors.New("保存后的配乐记录不存在")
	}
	return existing, false, err
}
