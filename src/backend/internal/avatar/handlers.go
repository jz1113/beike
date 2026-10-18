package avatar

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func Characters(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		characters, err := ListCharacters(r.Context(), db, workspaceID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取形象列表失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "characters": annotateCharacters(characters)})
	}
}

func CreateCharacter(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体读取异常"})
			return
		}
		var req CreateCharacterRequest
		if err := json.Unmarshal(body, &req); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON解析错误"})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "形象名称不能为空"})
			return
		}
		if strings.TrimSpace(req.VideoURL) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请上传形象照片或视频"})
			return
		}

		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		now := time.Now().UTC()
		charID := fmt.Sprintf("avatar_%d", now.UnixNano())
		humanID := fmt.Sprintf("custom_human_%d", now.Unix())
		cover := strings.TrimSpace(req.CoverURL)
		if cover == "" && (req.MediaKind == "image" || mediaIsImage(req.VideoURL)) {
			cover = req.VideoURL
		}
		newChar := Character{
			ID:              charID,
			WorkspaceID:     workspaceID,
			Name:            req.Name,
			Type:            1,
			Status:          1,
			StatusMsg:       "素材已就绪",
			VideoURL:        req.VideoURL,
			CoverURL:        cover,
			CoverWidth:      1080,
			CoverHeight:     1920,
			AudioPromptURL:  "",
			WelcomeVideoURL: req.VideoURL,
			HumanID:         humanID,
			Description:     req.Description,
			CreatedAt:       now,
			UpdatedAt:       now,
		}

		if err := InsertCharacter(r.Context(), db, newChar); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存形象失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "character": newChar})
	}
}

func DeleteCharacterHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少形象ID"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		if err := DeleteCharacter(r.Context(), db, workspaceID, id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "删除失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

func Voices(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		voices, err := ListVoices(r.Context(), db, workspaceID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取声音列表失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "voices": annotateVoices(voices)})
	}
}

func CreateVoice(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体读取异常"})
			return
		}
		var req CreateVoiceRequest
		if err := json.Unmarshal(body, &req); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON解析错误"})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "音色名称不能为空"})
			return
		}
		if strings.TrimSpace(req.AudioURL) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "参考音频文件不能为空"})
			return
		}

		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		now := time.Now().UTC()
		voiceRecordID := fmt.Sprintf("voice_%d", now.UnixNano())
		voiceUniqueID := fmt.Sprintf("custom_voice_%d", now.Unix())
		status := 0
		statusMsg := "正在提交声音克隆"
		if strings.TrimSpace(req.APIKey) == "" || strings.TrimSpace(req.BaseURL) == "" {
			status = 2
			statusMsg = "未配置声音克隆密钥，请同步 MiniMax 或 ElevenLabs 后再试"
		}
		newVoice := Voice{
			ID:             voiceRecordID,
			WorkspaceID:    workspaceID,
			Name:           req.Name,
			Type:           1,
			Status:         status,
			StatusMsg:      statusMsg,
			AudioURL:       req.AudioURL,
			PromptNpyURL:   "",
			PromptText:     req.PromptText,
			SampleAudioURL: req.AudioURL,
			VoiceID:        voiceUniqueID,
			Gender:         req.Gender,
			Tags:           req.Tags,
			CreatedAt:      now,
			UpdatedAt:      now,
		}

		if err := InsertVoice(r.Context(), db, newVoice); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存音色失败: " + err.Error()})
			return
		}
		if status == 0 {
			ProcessVoiceClone(cfg, newVoice, req)
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "voice": newVoice})
	}
}

func DeleteVoiceHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少音色ID"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		if err := DeleteVoice(r.Context(), db, workspaceID, id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "删除失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

func Fonts(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		fonts, err := ListFonts(r.Context(), db)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取字体失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "fonts": fonts})
	}
}

func Tasks(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		tasks, err := ListTasks(r.Context(), db, workspaceID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "tasks": tasks})
	}
}

func TaskDetail(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少任务ID"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		task, err := GetTask(r.Context(), db, workspaceID, id)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查询任务失败: " + err.Error()})
			return
		}
		if task == nil {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "任务不存在"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "task": task})
	}
}

func Render(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体读取异常"})
			return
		}
		var req RenderVideoRequest
		if err := json.Unmarshal(body, &req); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON解析错误"})
			return
		}
		if strings.TrimSpace(req.Title) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "视频标题不能为空"})
			return
		}
		if strings.TrimSpace(req.ScriptContent) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "口播文案内容不能为空"})
			return
		}
		if strings.TrimSpace(req.AvatarID) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择数字人形象"})
			return
		}
		if strings.TrimSpace(req.VoiceID) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择配音声音"})
			return
		}

		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		character, err := FindCharacter(r.Context(), db, workspaceID, req.AvatarID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查询形象失败: " + err.Error()})
			return
		}
		if character == nil || character.Status != 1 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "数字人形象尚未就绪"})
			return
		}
		if reason := presetMediaReason(character.Type, character.VideoURL); reason != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": reason})
			return
		}
		voice, err := FindVoice(r.Context(), db, workspaceID, req.VoiceID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查询声音失败: " + err.Error()})
			return
		}
		if voice == nil || voice.Status != 1 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "配音声音尚未就绪"})
			return
		}
		if reason := presetMediaReason(voice.Type, voice.AudioURL); reason != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": reason})
			return
		}
		now := time.Now().UTC()
		taskID := fmt.Sprintf("avatar_task_%d", now.UnixNano())

		newTask := VideoTask{
			ID:              taskID,
			WorkspaceID:     workspaceID,
			Title:           req.Title,
			ScriptContent:   req.ScriptContent,
			Layout:          req.Layout,
			Resolution:      req.Resolution,
			FrameRate:       req.FrameRate,
			ExportFormat:    req.ExportFormat,
			AvatarID:        req.AvatarID,
			AvatarPosition:  req.AvatarPosition,
			AvatarScale:     req.AvatarScale,
			VoiceID:         req.VoiceID,
			VoiceSpeed:      req.VoiceSpeed,
			VoiceVolume:     req.VoiceVolume,
			BgType:          req.BgType,
			BgColor:         req.BgColor,
			BgMediaURL:      req.BgMediaURL,
			SubtitleEnabled: req.SubtitleEnabled,
			FontID:          req.FontID,
			FontSize:        req.FontSize,
			FontColor:       req.FontColor,
			FontPosition:    req.FontPosition,
			Status:          0, // 进行中
			Progress:        5,
			CurrentStage:    "任务已提交",
			StatusMsg:       "正在初始化流水线",
			CreatedAt:       now,
			UpdatedAt:       now,
		}

		if err := InsertTask(r.Context(), db, newTask); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "创建任务失败: " + err.Error()})
			return
		}
		ProcessVideoTask(cfg, credsFromRender(cfg, r, req), newTask)

		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"task":    newTask,
			"message": "口播视频生成任务已提交",
		})
	}
}

func DeleteTaskHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少任务ID"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "数据库连接失败"})
			return
		}
		defer db.Close()

		workspaceID := httpx.WorkspaceFrom(r)
		if err := DeleteTask(r.Context(), db, workspaceID, id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "删除失败: " + err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}
