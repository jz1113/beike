package avatar

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/generate"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	schema := `
	CREATE TABLE "AvatarCharacter" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "name" TEXT, "type" INTEGER,
		"status" INTEGER, "statusMsg" TEXT, "videoUrl" TEXT, "coverUrl" TEXT,
		"coverWidth" INTEGER, "coverHeight" INTEGER, "audioPromptUrl" TEXT,
		"welcomeVideoUrl" TEXT, "humanId" TEXT, "description" TEXT,
		"createdAt" DATETIME, "updatedAt" DATETIME
	);
	CREATE TABLE "AvatarVoice" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "name" TEXT, "type" INTEGER,
		"status" INTEGER, "statusMsg" TEXT, "audioUrl" TEXT, "promptNpyUrl" TEXT,
		"promptText" TEXT, "sampleAudioUrl" TEXT, "voiceId" TEXT, "gender" TEXT,
		"tags" TEXT, "createdAt" DATETIME, "updatedAt" DATETIME
	);
	CREATE TABLE "AvatarFont" (
		"id" TEXT PRIMARY KEY, "name" TEXT UNIQUE, "nickname" TEXT, "fontUrl" TEXT, "previewUrl" TEXT
	);
	CREATE TABLE "AvatarVideoTask" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "title" TEXT, "scriptContent" TEXT,
		"layout" INTEGER, "resolution" INTEGER, "frameRate" INTEGER, "exportFormat" TEXT,
		"avatarId" TEXT, "avatarPosition" TEXT, "avatarScale" REAL, "voiceId" TEXT,
		"voiceSpeed" REAL, "voiceVolume" REAL, "bgType" TEXT, "bgColor" TEXT,
		"bgMediaUrl" TEXT, "subtitleEnabled" BOOLEAN, "fontId" TEXT, "fontSize" INTEGER,
		"fontColor" TEXT, "fontPosition" TEXT, "status" INTEGER, "progress" INTEGER,
		"currentStage" TEXT, "statusMsg" TEXT, "videoUrl" TEXT, "coverUrl" TEXT,
		"duration" REAL, "error" TEXT, "createdAt" DATETIME, "updatedAt" DATETIME,
		"finishedAt" DATETIME
	);
	`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("failed to init schema: %v", err)
	}
	return db
}

func TestAvatarCRUD(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	// 1. Character
	char := Character{
		ID:          "char_1",
		WorkspaceID: "ws_test",
		Name:        "测试主播",
		Type:        1,
		Status:      1,
		StatusMsg:   "就绪",
		VideoURL:    "http://test.com/a.mp4",
		CoverURL:    "http://test.com/c.jpg",
		CoverWidth:  1080,
		CoverHeight: 1920,
	}
	if err := InsertCharacter(ctx, db, char); err != nil {
		t.Fatalf("InsertCharacter failed: %v", err)
	}
	chars, err := ListCharacters(ctx, db, "ws_test")
	if err != nil || len(chars) != 1 {
		t.Fatalf("ListCharacters failed: %v, count: %d", err, len(chars))
	}

	// 2. Voice
	voice := Voice{
		ID:          "voice_1",
		WorkspaceID: "ws_test",
		Name:        "甜美女声",
		Type:        1,
		Status:      1,
		AudioURL:    "http://test.com/v.mp3",
		Gender:      "female",
		Tags:        []string{"活泼", "带货"},
	}
	if err := InsertVoice(ctx, db, voice); err != nil {
		t.Fatalf("InsertVoice failed: %v", err)
	}
	voices, err := ListVoices(ctx, db, "ws_test")
	if err != nil || len(voices) != 1 {
		t.Fatalf("ListVoices failed: %v, count: %d", err, len(voices))
	}

	// 3. Task
	task := VideoTask{
		ID:            "task_1",
		WorkspaceID:   "ws_test",
		Title:         "商品口播",
		ScriptContent: "今天给大家推荐这款好物",
		AvatarID:      "char_1",
		VoiceID:       "voice_1",
		Status:        0,
		Progress:      10,
	}
	if err := InsertTask(ctx, db, task); err != nil {
		t.Fatalf("InsertTask failed: %v", err)
	}
	gotTask, err := GetTask(ctx, db, "ws_test", "task_1")
	if err != nil || gotTask == nil {
		t.Fatalf("GetTask failed: %v", err)
	}

	if err := UpdateTaskProgress(ctx, db, "task_1", 50, "唇形对齐", "正在生成中"); err != nil {
		t.Fatalf("UpdateTaskProgress failed: %v", err)
	}
	if err := CompleteTask(ctx, db, "task_1", "http://test.com/out.mp4", "http://test.com/cover.jpg", 12.5); err != nil {
		t.Fatalf("CompleteTask failed: %v", err)
	}
	doneTask, err := GetTask(ctx, db, "ws_test", "task_1")
	if err != nil || doneTask.Status != 1 || doneTask.Progress != 100 {
		t.Fatalf("task completion verify failed")
	}

	if err := DeleteTask(ctx, db, "ws_test", "task_1"); err != nil {
		t.Fatalf("DeleteTask failed: %v", err)
	}
}

func TestParseDBTimeAcceptsSQLiteDatetime(t *testing.T) {
	got := parseDBTime("2026-01-02 03:04:05")
	if got.IsZero() || got.Format("2006-01-02 15:04:05") != "2026-01-02 03:04:05" {
		t.Fatalf("sqlite datetime parse failed: %v", got)
	}
}

func TestRunAvatarPipelineOutcomes(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()
	if err := InsertCharacter(ctx, db, Character{
		ID: "char_pipe", WorkspaceID: "ws_test", Name: "主播", Status: 1,
		VideoURL: "https://cdn.example/avatar.mp4", CoverURL: "https://cdn.example/cover.jpg",
	}); err != nil {
		t.Fatal(err)
	}
	if err := InsertVoice(ctx, db, Voice{
		ID: "voice_pipe", WorkspaceID: "ws_test", Name: "音色", Status: 1, VoiceID: "female-shaonv", Tags: []string{},
	}); err != nil {
		t.Fatal(err)
	}
	task := VideoTask{
		ID: "pipe_1", WorkspaceID: "ws_test", Title: "口播", ScriptContent: "你好世界",
		AvatarID: "char_pipe", VoiceID: "voice_pipe", VoiceSpeed: 1, Layout: 2,
	}
	if err := InsertTask(ctx, db, task); err != nil {
		t.Fatal(err)
	}
	prevSynth, prevPub, prevSubmit, prevPoll := synthSpeech, publishBytes, submitLip, pollLip
	t.Cleanup(func() {
		synthSpeech, publishBytes, submitLip, pollLip = prevSynth, prevPub, prevSubmit, prevPoll
	})
	creds := PipelineCreds{Base: "https://gateway.example", APIKey: "k", TTSModel: "speech-01-hd", LipsyncModel: "wanx-avatar-v2"}

	synthSpeech = func(context.Context, generate.SpeechRequest) (generate.SpeechResult, error) {
		return generate.SpeechResult{}, errors.New("down")
	}
	if err := runAvatarPipeline(ctx, db, creds, task); err == nil || !strings.Contains(err.Error(), "语音合成失败") {
		t.Fatalf("tts failure: %v", err)
	}

	synthSpeech = func(context.Context, generate.SpeechRequest) (generate.SpeechResult, error) {
		return generate.SpeechResult{Bytes: []byte("ID3audio"), ContentType: "audio/mpeg"}, nil
	}
	publishBytes = func(context.Context, string, string, string, []byte) (string, error) {
		return "", errors.New("唇形模型需要公网素材地址，请先配置云存储")
	}
	if err := runAvatarPipeline(ctx, db, creds, task); err == nil || !strings.Contains(err.Error(), "云存储") {
		t.Fatalf("cloud failure: %v", err)
	}

	publishBytes = func(context.Context, string, string, string, []byte) (string, error) {
		return "https://cdn.example/a.mp3", nil
	}
	submitLip = func(context.Context, PipelineCreds, string, string, string) (string, error) {
		return "", errors.New("唇形拒绝")
	}
	if err := runAvatarPipeline(ctx, db, creds, task); err == nil || !strings.Contains(err.Error(), "唇形拒绝") {
		t.Fatalf("lipsync failure: %v", err)
	}

	submitLip = func(context.Context, PipelineCreds, string, string, string) (string, error) { return "lip-1", nil }
	pollLip = func(context.Context, PipelineCreds, string) (string, error) {
		return "https://cdn.example/out.mp4", nil
	}
	if err := runAvatarPipeline(ctx, db, creds, task); err != nil {
		t.Fatal(err)
	}
	done, err := GetTask(ctx, db, "ws_test", "pipe_1")
	if err != nil || done == nil || done.Status != 1 || done.VideoURL != "https://cdn.example/out.mp4" {
		t.Fatalf("success task = %#v err=%v", done, err)
	}
}
