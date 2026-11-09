package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

const customBgmPresetCategory = "studio_bgm_asset"

type studioSoundMutation struct {
	SoundType   string   `json:"soundType"`
	Name        string   `json:"name"`
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	PromptText  *string  `json:"promptText"`
	Gender      string   `json:"gender"`
	VoiceGroup  string   `json:"voiceGroup"`
	VoiceID     *string  `json:"voiceId"`
	AudioURL    string   `json:"audioUrl"`
	Tags        []string `json:"tags"`
	MoodTags    []string `json:"moodTags"`
	BPM         int      `json:"bpm"`
	DurationSec float64  `json:"durationSec"`
	License     string   `json:"license"`
}

func soundText(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

var voiceGroupLabels = map[string]string{
	"male": "青年男", "female": "青年女", "middle_male": "中年男", "middle_female": "中年女",
	"senior_male": "老年男", "senior_female": "老年女", "child_male": "幼年男", "child_female": "幼年女",
}

func voiceGroupGender(group string) string {
	if group == "male" || strings.HasSuffix(group, "_male") {
		return "male"
	}
	return "female"
}

func normalizeVoiceGroup(gender, group string, tags []string, name, prompt string) string {
	group = strings.TrimSpace(group)
	if _, ok := voiceGroupLabels[group]; ok {
		return group
	}
	text := strings.Join(tags, " ") + " " + name + " " + prompt
	if gender != "male" && gender != "female" {
		gender = "female"
		if strings.Contains(text, "男") || strings.Contains(text, "爷爷") {
			gender = "male"
		}
	}
	if group == "senior" || group == "child" {
		return group + "_" + gender
	}
	for _, tag := range tags {
		for key, label := range voiceGroupLabels {
			if strings.TrimSpace(tag) == label {
				return key
			}
		}
	}
	for _, item := range []struct {
		age   string
		words []string
	}{
		{"child", []string{"幼年", "儿童", "童声", "小孩", "男孩", "女孩", "少儿"}},
		{"senior", []string{"老年", "老人", "长者", "爷爷", "奶奶", "银发"}},
		{"middle", []string{"中年"}},
	} {
		for _, word := range item.words {
			if strings.Contains(text, word) {
				return item.age + "_" + gender
			}
		}
	}
	return gender
}

func mergeVoiceTags(group string, tags []string) []string {
	label := voiceGroupLabels[group]
	out := []string{label}
	seen := map[string]bool{label: true, "男声": true, "女声": true, "老年": true, "儿童": true}
	for _, category := range voiceGroupLabels {
		seen[category] = true
	}
	for _, raw := range tags {
		trimmed := strings.TrimSpace(raw)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			out = append(out, trimmed)
		}
	}
	return out
}

func queryStudioBgms(ctx context.Context, db *sql.DB, workspace string) ([]studioBgm, error) {
	out := []studioBgm{}
	rows, err := db.QueryContext(ctx, `SELECT "id","name","configJson" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? ORDER BY "updatedAt" DESC`, workspace, customBgmPresetCategory)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, raw string
		if err := rows.Scan(&id, &name, &raw); err != nil {
			return nil, err
		}
		if strings.TrimSpace(name) == "" {
			continue
		}
		var cfg map[string]any
		_ = json.Unmarshal([]byte(raw), &cfg)
		audioURL, _ := cfg["audioUrl"].(string)
		if strings.TrimSpace(audioURL) == "" {
			continue
		}
		desc, _ := cfg["description"].(string)
		license, _ := cfg["license"].(string)
		if strings.TrimSpace(license) == "" {
			license = "自有上传配乐"
		}
		bpm := 100
		if num, ok := cfg["bpm"].(float64); ok && num >= 30 && num <= 240 {
			bpm = int(num)
		}
		dur := 15.0
		if num, ok := cfg["durationSec"].(float64); ok && num >= 1 {
			dur = num
		}
		moodTags := []string{"BGM"}
		if list, ok := cfg["moodTags"].([]any); ok {
			parsed := []string{}
			for _, v := range list {
				if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
					parsed = append(parsed, strings.TrimSpace(s))
				}
			}
			moodTags = parsed
		}
		out = append(out, studioBgm{
			ID:                 id,
			Title:              strings.TrimSpace(name),
			Description:        strings.TrimSpace(desc),
			MoodTags:           moodTags,
			BPM:                bpm,
			DurationSec:        dur,
			SuitableCategories: []string{"fashion", "beauty", "home", "food", "tech", "other"},
			License:            license,
			AudioURL:           strings.TrimSpace(audioURL),
			Source:             "custom_bgm",
			Editable:           true,
		})
	}
	return out, rows.Err()
}

func StudioSounds(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
			return
		}
		var body studioSoundMutation
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "声音资产请求格式错误"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "声音资产库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if strings.TrimSpace(body.SoundType) == "bgm" {
			createStudioBgm(w, r, db, workspace, body)
			return
		}
		createStudioVoice(cfg, w, r, db, workspace, body)
	}
}

func createStudioVoice(cfg config.Config, w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string, body studioSoundMutation) {
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.Title)
	}
	if name == "" {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请填写人声名称"})
		return
	}
	group := normalizeVoiceGroup(body.Gender, body.VoiceGroup, body.Tags, name, soundText(body.PromptText))
	gender := voiceGroupGender(group)
	tags := mergeVoiceTags(group, body.Tags)
	rawTags, _ := json.Marshal(tags)
	prompt := soundText(body.PromptText)
	if prompt == "" {
		prompt = soundText(body.Description)
	}
	audio, discard, err := prepareStudioVoiceSample(r.Context(), cfg, workspace, body.AudioURL, network.SafeClient())
	if err != nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
		return
	}
	saved := false
	defer func() {
		if !saved {
			discard()
		}
	}()
	voiceID := soundText(body.VoiceID)
	if voiceID == "" && audio == "" {
		voiceID = resolveTtsVoice("", gender, tags)
	}
	id := "voice_" + httpx.RequestID()
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.ExecContext(r.Context(), `INSERT INTO "AvatarVoice" ("id","workspaceId","name","type","status","statusMsg","audioUrl","promptNpyUrl","promptText","sampleAudioUrl","voiceId","gender","tags","createdAt") VALUES (?,?,?,1,1,'可用',?,'',?,?,?,?,?,?)`,
		id, workspace, name, audio, prompt, audio, voiceID, gender, string(rawTags), now)
	if err == nil {
		affected, affectedErr := result.RowsAffected()
		saved = affectedErr == nil && affected == 1
	}
	if !saved {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存人声资产失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{
		"success": true,
		"voice": studioVoice{
			ID: id, Name: name, VoiceID: voiceID, TtsVoice: resolveStudioTtsVoice(voiceID, audio, gender, tags),
			Gender: gender, VoiceGroup: group, Tags: tags, SampleAudioURL: audio, PromptText: prompt, Source: "voice_library",
		},
	})
}

func createStudioBgm(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string, body studioSoundMutation) {
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = strings.TrimSpace(body.Name)
	}
	audio := strings.TrimSpace(body.AudioURL)
	if title == "" || audio == "" {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请填写 BGM 名称并上传音频文件"})
		return
	}
	bpm := body.BPM
	if bpm < 30 || bpm > 240 {
		bpm = 100
	}
	dur := body.DurationSec
	if dur < 1 {
		dur = 15
	}
	tags := body.MoodTags
	if len(tags) == 0 {
		tags = body.Tags
	}
	cleanTags := []string{}
	for _, t := range tags {
		if trimmed := strings.TrimSpace(t); trimmed != "" {
			cleanTags = append(cleanTags, trimmed)
		}
	}
	if len(cleanTags) == 0 {
		cleanTags = []string{"BGM"}
	}
	desc := soundText(body.Description)
	if desc == "" {
		desc = soundText(body.PromptText)
	}
	id := "bgm_custom_" + httpx.RequestID()
	now := time.Now().UTC().Format(time.RFC3339)
	cfgMap := map[string]any{
		"audioUrl":    audio,
		"description": desc,
		"moodTags":    cleanTags,
		"bpm":         bpm,
		"durationSec": dur,
		"license":     "自有上传配乐",
	}
	raw, _ := json.Marshal(cfgMap)
	if _, err := db.ExecContext(r.Context(), `INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","category","configJson","isDefault","createdAt","updatedAt") VALUES (?,?,?,?,?,0,?,?)`,
		id, workspace, title, customBgmPresetCategory, string(raw), now, now); err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存 BGM 资产失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{
		"success": true,
		"bgm": studioBgm{
			ID: id, Title: title, Description: desc, MoodTags: cleanTags, BPM: bpm, DurationSec: dur,
			SuitableCategories: []string{"fashion", "beauty", "home", "food", "tech", "other"},
			License:            "自有上传配乐", AudioURL: audio, Source: "custom_bgm", Editable: true,
		},
	})
}

func StudioSoundByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "无效的声音资产 ID"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "声音资产库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		switch r.Method {
		case http.MethodDelete:
			deleteStudioSound(w, r, db, workspace, id)
		case http.MethodPatch:
			var body studioSoundMutation
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
			if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
				httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "更新声音资产请求格式错误"})
				return
			}
			updateStudioSound(cfg, w, r, db, workspace, id, body)
		default:
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
		}
	}
}

// Both sound kinds share one delete endpoint. Roll back if either write fails.
func deleteStudioSound(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string) {
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	defer tx.Rollback()
	voice, err := tx.ExecContext(r.Context(), `DELETE FROM "AvatarVoice" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	bgm, err := tx.ExecContext(r.Context(), `DELETE FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	voices, _ := voice.RowsAffected()
	bgms, _ := bgm.RowsAffected()
	if err := tx.Commit(); err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	if voices+bgms == 0 {
		writeStudioSoundReadError(w, sql.ErrNoRows, "声音")
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true})
}

func writeStudioSoundReadError(w http.ResponseWriter, err error, kind string) {
	status, message := 500, "读取声音资产失败，请重试"
	if err == sql.ErrNoRows {
		status, message = 404, kind+"资产不存在"
	}
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
}

func writeStudioSoundMutation(w http.ResponseWriter, result sql.Result, err error) {
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存声音资产变更失败，请重试"})
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		writeStudioSoundReadError(w, err, "声音")
		return
	}
	if affected == 0 {
		writeStudioSoundReadError(w, sql.ErrNoRows, "声音")
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true})
}

func updateStudioSound(cfg config.Config, w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string, body studioSoundMutation) {
	if strings.HasPrefix(id, "bgm_") || strings.TrimSpace(body.SoundType) == "bgm" {
		var raw string
		var curName string
		if err := db.QueryRowContext(r.Context(), `SELECT "name","configJson" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id).Scan(&curName, &raw); err != nil {
			writeStudioSoundReadError(w, err, "BGM")
			return
		}
		var cfg map[string]any
		_ = json.Unmarshal([]byte(raw), &cfg)
		if cfg == nil {
			cfg = map[string]any{}
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			title = strings.TrimSpace(body.Name)
		}
		if title == "" {
			title = curName
		}
		if body.Description != nil || body.PromptText != nil {
			desc := soundText(body.Description)
			if body.Description == nil {
				desc = soundText(body.PromptText)
			}
			cfg["description"] = desc
		}
		if body.MoodTags != nil || body.Tags != nil {
			tags := body.MoodTags
			if tags == nil {
				tags = body.Tags
			}
			cfg["moodTags"] = tags
		}
		if body.BPM >= 30 && body.BPM <= 240 {
			cfg["bpm"] = body.BPM
		}
		if strings.TrimSpace(body.AudioURL) != "" {
			cfg["audioUrl"] = strings.TrimSpace(body.AudioURL)
		}
		updatedRaw, _ := json.Marshal(cfg)
		now := time.Now().UTC().Format(time.RFC3339)
		result, err := db.ExecContext(r.Context(), `UPDATE "SalesProductionPreset" SET "name"=?,"configJson"=?,"updatedAt"=? WHERE "workspaceId"=? AND "category"=? AND "id"=?`,
			title, string(updatedRaw), now, workspace, customBgmPresetCategory, id)
		writeStudioSoundMutation(w, result, err)
		return
	}
	var curName, curGender, rawTags, curPrompt, curAudio, curVoiceID string
	if err := db.QueryRowContext(r.Context(), `SELECT "name","gender",COALESCE("tags",'[]'),COALESCE("promptText",''),COALESCE("sampleAudioUrl",''),COALESCE("voiceId",'') FROM "AvatarVoice" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&curName, &curGender, &rawTags, &curPrompt, &curAudio, &curVoiceID); err != nil {
		writeStudioSoundReadError(w, err, "人声")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.Title)
	}
	if name == "" {
		name = curName
	}
	var existingTags []string
	_ = json.Unmarshal([]byte(rawTags), &existingTags)
	inputTags := body.Tags
	if inputTags == nil {
		inputTags = existingTags
	}
	prompt := curPrompt
	if body.PromptText != nil {
		prompt = soundText(body.PromptText)
	} else if body.Description != nil {
		prompt = soundText(body.Description)
	}
	inputGender := strings.TrimSpace(body.Gender)
	if inputGender == "" {
		inputGender = curGender
	}
	group := normalizeVoiceGroup(inputGender, body.VoiceGroup, inputTags, name, prompt)
	gender := voiceGroupGender(group)
	tags := mergeVoiceTags(group, inputTags)
	tagsJSON, _ := json.Marshal(tags)
	audio := strings.TrimSpace(body.AudioURL)
	discard := func() {}
	if audio == "" {
		audio = curAudio
	} else {
		var err error
		audio, discard, err = prepareStudioVoiceSample(r.Context(), cfg, workspace, audio, network.SafeClient())
		if err != nil {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
			return
		}
	}
	saved := false
	defer func() {
		if !saved {
			discard()
		}
	}()
	voiceID := curVoiceID
	if body.VoiceID != nil {
		voiceID = soundText(body.VoiceID)
	}
	result, err := db.ExecContext(r.Context(), `UPDATE "AvatarVoice" SET "name"=?,"gender"=?,"tags"=?,"promptText"=?,"sampleAudioUrl"=?,"audioUrl"=?,"voiceId"=? WHERE "workspaceId"=? AND "id"=?`,
		name, gender, string(tagsJSON), prompt, audio, audio, voiceID, workspace, id)
	if err == nil {
		affected, affectedErr := result.RowsAffected()
		saved = affectedErr == nil && affected > 0
	}
	writeStudioSoundMutation(w, result, err)
}

const studioVoiceSampleMaxSeconds = 15.0

// Importing a voice prepares the same sample for both playback and generation.
// discard removes only a newly created clip if its database mutation fails.
func prepareStudioVoiceSample(ctx context.Context, cfg config.Config, workspace, source string, client audioMixMediaClient) (string, func(), error) {
	source = strings.TrimSpace(source)
	noop := func() {}
	if source == "" {
		return "", noop, nil
	}
	input, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, false, client)
	defer cleanup()
	if err != nil {
		return "", noop, err
	}
	info, err := os.Stat(input)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return "", noop, errors.New("人声音频不存在或为空，请重新上传")
	}
	if info.Size() > audioMixAudioLimit {
		return "", noop, errors.New("人声音频不能超过 32 MiB，请压缩后重新上传")
	}
	file, err := os.Open(input)
	if err != nil {
		return "", noop, errors.New("无法读取人声音频，请重新上传")
	}
	header := make([]byte, 16)
	n, _ := io.ReadFull(file, header)
	_ = file.Close()
	if audioMixMediaExtension(header[:n], false) == "" {
		return "", noop, errors.New("人声音频格式无效，请上传完整的 MP3、WAV、M4A、AAC、OGG、FLAC 或 OPUS 音频")
	}
	duration, err := system.ProbeAudioDuration(ctx, cfg.Root, input)
	if err != nil {
		return "", noop, err
	}
	if duration <= studioVoiceSampleMaxSeconds {
		return source, noop, nil
	}
	output, audioURL, err := renderStudioVoiceSample(ctx, cfg.Root, workspace, input)
	if err != nil {
		return "", noop, err
	}
	return audioURL, func() { _ = os.Remove(output) }, nil
}

func renderStudioVoiceSample(ctx context.Context, root, workspace, input string) (output, audioURL string, err error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return "", "", errors.New("FFmpeg 不可用，暂时无法自动裁切人声，请检查媒体处理环境")
	}
	rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/audio/%s/sales_voice_%s.wav", time.Now().Format("200601"), httpx.RequestID()), workspace)
	output = storage.SafeWithin(storage.ResolveRoot(), rel)
	if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
		return "", "", errors.New("创建人声音频保存目录失败")
	}
	defer func() {
		if err != nil {
			_ = os.Remove(output)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	args := append([]string{"-n", "-nostdin", "-hide_banner", "-loglevel", "error"}, audioMixInputArgs(input)...)
	// PCM avoids encoder padding that could push a 15-second MP3/AAC crop over
	// the provider limit. No padding, speed changes or source overwrite occurs.
	args = append(args, "-t", "15", "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1",
		"-c:a", "pcm_s16le", "-ac", "1", "-ar", "32000", "-f", "wav", output)
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	if cmd.Run() != nil {
		return output, "", errors.New("人声音频自动裁切失败，请确认音频完整后重试")
	}
	measured, err := system.ProbeAudioDuration(ctx, root, output)
	if err != nil || math.Abs(measured-studioVoiceSampleMaxSeconds) > 0.001 || measured > studioVoiceSampleMaxSeconds {
		return output, "", errors.New("裁切后的人声时长核对失败，请重新上传")
	}
	return output, "/storage/" + rel, nil
}
