package avatar

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

type PipelineCreds struct {
	Base         string
	APIKey       string
	TTSModel     string
	LipsyncModel string
	VoiceBase    string
	VoiceKey     string
	DriverBase   string
	DriverKey    string
	DriveMode    string
}

func (c PipelineCreds) VoiceRoute() (string, string) {
	base, key := strings.TrimSpace(c.VoiceBase), strings.TrimSpace(c.VoiceKey)
	if base == "" {
		base = c.Base
	}
	if key == "" {
		key = c.APIKey
	}
	return base, key
}

func (c PipelineCreds) DriverRoute() (string, string) {
	base, key := strings.TrimSpace(c.DriverBase), strings.TrimSpace(c.DriverKey)
	if base == "" {
		base = c.Base
	}
	if key == "" {
		key = c.APIKey
	}
	return base, key
}

type speechSynth func(context.Context, generate.SpeechRequest) (generate.SpeechResult, error)
type mediaPublisher func(context.Context, string, string, string, []byte) (string, error)
type lipsyncSubmitter func(context.Context, PipelineCreds, string, string, string) (string, error)
type lipsyncPoller func(context.Context, PipelineCreds, string) (string, error)

var (
	synthSpeech  speechSynth      = generate.SynthesizeSpeech
	publishBytes mediaPublisher   = publishPublicMedia
	submitLip    lipsyncSubmitter = submitLipsyncTask
	pollLip      lipsyncPoller    = pollLipsyncTask
)

func credsFromRender(cfg config.Config, r *http.Request, req RenderVideoRequest) PipelineCreds {
	base := strings.TrimSpace(req.CustomBaseURL)
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if base == "" {
		base = generate.ImageDefaultBase()
	}
	key := strings.TrimSpace(req.CustomAPIKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	if key == "" && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_AUDIO_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	tts := strings.TrimSpace(req.Model)
	if tts == "" {
		tts = "speech-01-hd"
	}
	lip := strings.TrimSpace(req.LipsyncModel)
	if lip == "" {
		lip = strings.TrimSpace(os.Getenv("AVATAR_LIPSYNC_MODEL"))
	}
	if lip == "" {
		lip = "wanx-avatar-v2"
	}
	voiceBase := firstNonEmpty(req.VoiceBaseURL, base)
	voiceKey := firstNonEmpty(req.VoiceAPIKey, key)
	driverBase := firstNonEmpty(req.DriverBaseURL, req.CustomBaseURL, base)
	driverKey := firstNonEmpty(req.DriverAPIKey, req.CustomAPIKey, key)
	return PipelineCreds{
		Base: base, APIKey: key, TTSModel: tts, LipsyncModel: lip,
		VoiceBase: voiceBase, VoiceKey: voiceKey, DriverBase: driverBase, DriverKey: driverKey,
		DriveMode: strings.TrimSpace(req.DriveMode),
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func ProcessVideoTask(cfg config.Config, creds PipelineCreds, task VideoTask) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
		defer cancel()
		db, err := openPipelineDB(cfg)
		if err != nil {
			log.Printf("[AvatarPipeline] 打开数据库失败，任务无法落失败状态 task=%s err=%v", task.ID, err)
			return
		}
		defer db.Close()
		if err := runAvatarPipeline(ctx, db, creds, task); err != nil {
			writeCtx, cancelWrite := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
			_ = FailTask(writeCtx, db, task.ID, err.Error())
			cancelWrite()
			log.Printf("[AvatarPipeline] 任务失败 task=%s err=%v", task.ID, err)
		}
	}()
}

func openPipelineDB(cfg config.Config) (*sql.DB, error) {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		db, err := httpx.OpenDB(cfg)
		if err == nil {
			return db, nil
		}
		last = err
		time.Sleep(time.Duration(attempt+1) * 200 * time.Millisecond)
	}
	return nil, last
}

func runAvatarPipeline(ctx context.Context, db *sql.DB, creds PipelineCreds, task VideoTask) error {
	voiceBase, voiceKey := creds.VoiceRoute()
	driverBase, driverKey := creds.DriverRoute()
	if voiceKey == "" || voiceBase == "" || driverKey == "" || driverBase == "" {
		return errors.New("未配置音频与唇形网关密钥")
	}
	if _, ok := ClassifyDriver(creds.LipsyncModel); !ok {
		return errors.New("所选模型不是对口型驱动模型，请改用可灵对口型、OmniHuman、万相数字人、Hedra 或 LatentSync")
	}
	character, err := FindCharacter(ctx, db, task.WorkspaceID, task.AvatarID)
	if err != nil {
		return err
	}
	if character == nil || strings.TrimSpace(character.VideoURL) == "" {
		return errors.New("数字人形象不存在或没有视频素材")
	}
	if character.Status != 1 {
		return errors.New("数字人形象尚未就绪")
	}
	if reason := presetMediaReason(character.Type, character.VideoURL); reason != "" {
		return errors.New(reason)
	}
	voice, err := FindVoice(ctx, db, task.WorkspaceID, task.VoiceID)
	if err != nil {
		return err
	}
	if voice == nil {
		return errors.New("配音声音不存在")
	}
	if voice.Status != 1 {
		return errors.New("配音声音尚未就绪")
	}
	if reason := presetMediaReason(voice.Type, voice.AudioURL); reason != "" {
		return errors.New(reason)
	}
	_ = UpdateTaskProgress(ctx, db, task.ID, 20, "语音合成", "正在调用语音网关生成口播音频")
	voiceName := strings.TrimSpace(voice.VoiceID)
	if voiceName == "" {
		voiceName = voice.ID
	}
	speed := task.VoiceSpeed
	if speed <= 0 {
		speed = 1
	}
	speech, err := synthSpeech(ctx, generate.SpeechRequest{
		Base: voiceBase, APIKey: voiceKey, Model: creds.TTSModel, Text: task.ScriptContent,
		Voice: voiceName, Format: "mp3", Speed: speed, Volume: task.VoiceVolume,
	})
	if err != nil {
		return errors.New("语音合成失败：" + err.Error())
	}
	audioURL, err := publicSpeechURL(ctx, task, speech)
	if err != nil {
		return err
	}
	avatarURL, err := publicAvatarURL(ctx, task.WorkspaceID, task.ID, character.VideoURL)
	if err != nil {
		return err
	}
	_ = UpdateTaskProgress(ctx, db, task.ID, 55, "唇形同步", "正在提交唇形驱动任务")
	lipTaskID, err := submitLip(ctx, creds, avatarURL, audioURL, aspectFromLayout(task.Layout))
	if err != nil {
		return err
	}
	_ = UpdateTaskProgress(ctx, db, task.ID, 75, "唇形同步", "正在等待唇形成片")
	videoURL, err := pollLip(ctx, creds, lipTaskID)
	if err != nil {
		return err
	}
	_ = UpdateTaskProgress(ctx, db, task.ID, 90, "成片整理", "正在处理背景与字幕")
	finalURL, err := composeAvatarExtras(ctx, task, videoURL)
	if err != nil {
		return err
	}
	duration := float64(len([]rune(task.ScriptContent))) * 0.25 / speed
	if duration < 3 {
		duration = 3
	}
	writeCtx, cancelWrite := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancelWrite()
	return CompleteTask(writeCtx, db, task.ID, finalURL, character.CoverURL, duration)
}

func publicSpeechURL(ctx context.Context, task VideoTask, speech generate.SpeechResult) (string, error) {
	if len(speech.Bytes) > 0 {
		url, err := publishBytes(ctx, task.WorkspaceID, task.ID+".mp3", speech.ContentType, speech.Bytes)
		if err != nil {
			return "", err
		}
		if url != "" {
			return url, nil
		}
	}
	remote := strings.TrimSpace(speech.RemoteURL)
	if strings.HasPrefix(remote, "https://") && !privateMediaHost(remote) {
		return remote, nil
	}
	if strings.HasPrefix(remote, "http://") || strings.HasPrefix(remote, "https://") {
		body, err := readAvatarMedia(ctx, remote)
		if err != nil {
			return "", errors.New("唇形模型需要公网音频地址，请先配置云存储")
		}
		contentType := speech.ContentType
		if contentType == "" {
			contentType = http.DetectContentType(body)
		}
		return publishBytes(ctx, task.WorkspaceID, task.ID+".mp3", contentType, body)
	}
	return "", errors.New("唇形模型需要公网音频地址，请先配置云存储")
}

func aspectFromLayout(layout int) string {
	if layout == 1 {
		return "16:9"
	}
	return "9:16"
}
