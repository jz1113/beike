package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
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
	VoiceID     string   `json:"voiceId"`
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

func normalizeVoiceGroup(gender, voiceGroup string, tags []string, name, prompt string) string {
	switch strings.TrimSpace(voiceGroup) {
	case "male", "female", "senior", "child":
		return strings.TrimSpace(voiceGroup)
	}
	text := strings.ToLower(name + " " + prompt + " " + strings.Join(tags, " "))
	if strings.Contains(text, "儿童") || strings.Contains(text, "童声") || strings.Contains(text, "小孩") || strings.Contains(text, "男孩") || strings.Contains(text, "女孩") {
		return "child"
	}
	if strings.Contains(text, "老年") || strings.Contains(text, "老人") || strings.Contains(text, "长者") || strings.Contains(text, "老爷爷") || strings.Contains(text, "老奶奶") || strings.Contains(text, "银发") {
		return "senior"
	}
	if strings.TrimSpace(gender) == "male" || strings.Contains(text, "男声") || strings.Contains(text, "男士") || strings.Contains(text, "男神") {
		return "male"
	}
	return "female"
}

func voiceGroupTag(group string) string {
	switch group {
	case "male":
		return "男声"
	case "senior":
		return "老年"
	case "child":
		return "儿童"
	default:
		return "女声"
	}
}

func mergeVoiceTags(group string, tags []string) []string {
	label := voiceGroupTag(group)
	out := []string{label}
	seen := map[string]bool{label: true, "男声": true, "女声": true, "老年": true, "儿童": true}
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
		createStudioVoice(w, r, db, workspace, body)
	}
}

func createStudioVoice(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string, body studioSoundMutation) {
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.Title)
	}
	if name == "" {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请填写人声名称"})
		return
	}
	group := normalizeVoiceGroup(body.Gender, body.VoiceGroup, body.Tags, name, soundText(body.PromptText))
	gender := "female"
	if group == "male" {
		gender = "male"
	}
	tags := mergeVoiceTags(group, body.Tags)
	rawTags, _ := json.Marshal(tags)
	prompt := soundText(body.PromptText)
	if prompt == "" {
		prompt = soundText(body.Description)
	}
	audio := strings.TrimSpace(body.AudioURL)
	voiceID := strings.TrimSpace(body.VoiceID)
	if voiceID == "" {
		voiceID = resolveTtsVoice("", gender, tags)
	}
	id := "voice_" + httpx.RequestID()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := db.ExecContext(r.Context(), `INSERT INTO "AvatarVoice" ("id","workspaceId","name","type","status","statusMsg","audioUrl","promptNpyUrl","promptText","sampleAudioUrl","voiceId","gender","tags","createdAt") VALUES (?,?,?,1,1,'可用',?,'',?,?,?,?,?,?)`,
		id, workspace, name, audio, prompt, audio, voiceID, gender, string(rawTags), now); err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存人声资产失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{
		"success": true,
		"voice": studioVoice{
			ID: id, Name: name, VoiceID: voiceID, TtsVoice: resolveTtsVoice(voiceID, gender, tags),
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
			updateStudioSound(w, r, db, workspace, id, body)
		default:
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
		}
	}
}
