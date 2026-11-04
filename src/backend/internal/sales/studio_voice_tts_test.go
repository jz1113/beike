package sales

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/system"
)

func TestCreatingVoiceSamplesDoesNotRegisterATtsVoice(t *testing.T) {
	cfg, db, mux := setupStudioSoundsTest(t)
	cfg.Root, _ = filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if _, ok := system.FFmpegBinary(cfg.Root); !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	writeVoiceSample(t, "local/sample.wav", 2)
	mux.HandleFunc("POST /api/sales/studio-sounds", StudioSounds(cfg))
	for _, test := range []struct {
		name, sample, inputID, wantID, wantTts string
	}{
		{"sample-only", "/storage/local/sample.wav", "", "", ""},
		{"sample-with-explicit-id", "/storage/local/sample.wav", "provider-voice", "provider-voice", "provider-voice"},
		{"existing-default-without-sample", "", "", "male-qn-jingying", "male-qn-jingying"},
		{"sample-with-legacy-preset", "/storage/local/sample.wav", "preset_voice_03", "preset_voice_03", "female-yujie"},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := map[string]any{"name": test.name, "gender": "male", "audioUrl": test.sample}
			if test.inputID != "" {
				body["voiceId"] = test.inputID
			}
			raw, _ := json.Marshal(body)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/studio-sounds", strings.NewReader(string(raw))))
			var result struct {
				Voice studioVoice `json:"voice"`
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil {
				t.Fatalf("creating voice failed: %d %s", rec.Code, rec.Body.String())
			}
			if result.Voice.VoiceID != test.wantID || result.Voice.TtsVoice != test.wantTts || result.Voice.SampleAudioURL != test.sample {
				t.Fatalf("sample or explicit TTS selection was replaced: %+v", result.Voice)
			}
			var voiceID, sample string
			if err := db.QueryRow(`SELECT "voiceId","sampleAudioUrl" FROM "AvatarVoice" WHERE "id"=?`, result.Voice.ID).Scan(&voiceID, &sample); err != nil {
				t.Fatal(err)
			}
			if voiceID != test.wantID || sample != test.sample {
				t.Fatalf("saved voice differs from response: id=%q sample=%q", voiceID, sample)
			}
			voices, err := queryStudioVoices(t.Context(), db, "local")
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, item := range voices {
				if item.ID == result.Voice.ID {
					found = true
					if item.VoiceID != test.wantID || item.TtsVoice != test.wantTts {
						t.Fatalf("reload introduced a different TTS voice: %+v", item)
					}
				}
			}
			if !found {
				t.Fatal("saved voice was not returned by the catalog")
			}
		})
	}
}

func TestReadingAndEditingVoiceSamplePreservesEmptyAndExistingTtsIDs(t *testing.T) {
	_, db, mux := setupStudioSoundsTest(t)
	for _, test := range []struct {
		id, voiceID string
	}{
		{"sample-only", ""},
		{"legacy-sample-with-id", "existing-provider-voice"},
	} {
		t.Run(test.id, func(t *testing.T) {
			if _, err := db.Exec(`INSERT INTO "AvatarVoice" ("id","workspaceId","name","voiceId","sampleAudioUrl","gender") VALUES (?,'local',?,?,'/storage/local/sample.wav','male')`, test.id, test.id, test.voiceID); err != nil {
				t.Fatal(err)
			}
			assertVoice := func() {
				t.Helper()
				voices, err := queryStudioVoices(t.Context(), db, "local")
				if err != nil {
					t.Fatal(err)
				}
				found := false
				for _, voice := range voices {
					if voice.ID == test.id {
						found = true
						if voice.VoiceID != test.voiceID || voice.TtsVoice != test.voiceID {
							t.Fatalf("sample silently acquired or lost a TTS ID: %+v", voice)
						}
					}
				}
				if !found {
					t.Fatal("voice was not returned")
				}
				var stored string
				if err := db.QueryRow(`SELECT "voiceId" FROM "AvatarVoice" WHERE "id"=?`, test.id).Scan(&stored); err != nil || stored != test.voiceID {
					t.Fatalf("existing stored ID changed: %q %v", stored, err)
				}
			}
			assertVoice()
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/studio-sounds/"+test.id, strings.NewReader(`{"name":"编辑后的名称","gender":"female"}`)))
			if rec.Code != 200 {
				t.Fatalf("editing voice failed: %d %s", rec.Code, rec.Body.String())
			}
			assertVoice()
		})
	}
}

func TestVoiceTtsIDPatchDistinguishesOmittedAndExplicitlyEmpty(t *testing.T) {
	for _, test := range []struct {
		name, body, want string
	}{
		{"edit-provider-id", `{"voiceId":" updated-provider "}`, "updated-provider"},
		{"clear-provider-id", `{"voiceId":""}`, ""},
		{"rename-without-id", `{"name":"新名称"}`, "original-voice"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, db, mux := setupStudioSoundsTest(t)
			if _, err := db.Exec(`UPDATE "AvatarVoice" SET "audioUrl"='/storage/local/sample.wav',"sampleAudioUrl"='/storage/local/sample.wav' WHERE "id"='voice_mine'`); err != nil {
				t.Fatal(err)
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/studio-sounds/voice_mine", strings.NewReader(test.body)))
			if rec.Code != 200 {
				t.Fatalf("patch failed: %d %s", rec.Code, rec.Body.String())
			}
			var voiceID, sample, audio string
			if err := db.QueryRow(`SELECT "voiceId","sampleAudioUrl","audioUrl" FROM "AvatarVoice" WHERE "id"='voice_mine'`).Scan(&voiceID, &sample, &audio); err != nil {
				t.Fatal(err)
			}
			if voiceID != test.want || sample != "/storage/local/sample.wav" || audio != sample {
				t.Fatalf("voice selection or sample not preserved: id=%q sample=%q audio=%q", voiceID, sample, audio)
			}
			voices, err := queryStudioVoices(t.Context(), db, "local")
			if err != nil || len(voices) != 1 || voices[0].VoiceID != test.want || voices[0].TtsVoice != test.want {
				t.Fatalf("catalog changed patched TTS selection: %+v %v", voices, err)
			}
		})
	}
}
