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
	"beike.local/cloud/src/backend/internal/platform/network"
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
