package generate

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func TestReferenceAudioBudgetsRetainEveryVoiceInOrder(t *testing.T) {
	for _, item := range []struct {
		model         string
		lengths, want []float64
	}{
		{"viduq4-preview", []float64{15, 15, 15}, []float64{12, 12, 12}},
		{"doubao-seedance-2.0-mini", []float64{8, 8, 8}, []float64{8, 5, 2}},
		{"doubao-seedance-2.5", []float64{25, 20}, []float64{25, 5}},
		{"wan3.0-video", []float64{10, 10}, []float64{10, 5}},
		{"wan3.0-video", []float64{2, 3}, []float64{2, 3}},
		{"MiniMax-H3", []float64{8, 8, 8}, []float64{8, 5, 2}},
	} {
		sources := make([]localVideoAudioSource, len(item.lengths))
		for index, duration := range item.lengths {
			sources[index] = localVideoAudioSource{path: "voice", duration: duration}
		}
		got, err := planVideoAudioDurations(videoAudioLimits(item.model), sources)
		if err != nil || len(got) != len(item.want) {
			t.Fatalf("model %s lost a voice: %v %v", item.model, got, err)
		}
		for index := range got {
			if math.Abs(got[index]-item.want[index]) > .001 {
				t.Fatalf("model %s voice %d budget %v want %v", item.model, index+1, got, item.want)
			}
		}
	}
}

func TestMultipleVoiceSamplesAreAutomaticallyTrimmedToModelTotal(t *testing.T) {
	for _, item := range []struct {
		model         string
		seconds, refs int
		want          []float64
	}{
		{"doubao-seedance-2.0-mini", 8, 3, []float64{8, 5, 2}},
		{"doubao-seedance-2.5", 20, 2, []float64{20, 10}},
		{"wan3.0-video", 10, 2, []float64{10, 5}},
	} {
		t.Run(item.model, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			path := writeReferenceWav(t, root, "local/audio/voice.wav", item.seconds)
			original, _ := os.ReadFile(path)
			var generations atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/assets/create") {
					_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"person","status":"Active"}}`))
					return
				}
				generations.Add(1)
				var sent map[string]any
				_ = json.NewDecoder(r.Body).Decode(&sent)
				count := 0
				if item.model == "wan3.0-video" {
					for _, raw := range sent["input"].(map[string]any)["media"].([]any) {
						if raw.(map[string]any)["type"] == "reference_audio" {
							count++
						}
					}
				} else {
					for _, raw := range sent["content"].([]any) {
						if raw.(map[string]any)["type"] == "audio_url" {
							count++
						}
					}
				}
				if count != item.refs {
					t.Error("automatic trimming dropped a selected voice")
				}
				_, _ = w.Write([]byte(`{"task_id":"multi-trimmed"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			cfg.Root = audioTestProjectRoot(t)
			refs := make([]string, item.refs)
			for index := range refs {
				refs[index] = "/storage/local/audio/voice.wav"
			}
			payload := map[string]any{
				"model": item.model, "prompt": "每个音频分别提供不同人物音色", "images": []string{"https://cdn.example/person.jpg"},
				"audios": refs, "ref_mode": "omni", "audio": true, "clientTaskId": "multi-trimmed",
				"customBaseUrl": server.URL, "customApiKey": "test-key", "storageConfig": json.RawMessage(wanOSSStorageJSON),
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body))
			req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
			response := httptest.NewRecorder()
			Video(cfg).ServeHTTP(response, req)
			var result struct {
				Diagnostic *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusOK || result.Diagnostic == nil {
				t.Fatalf("multi-voice auto trim failed: %d %s %v", response.Code, response.Body.String(), err)
			}
			if generations.Load() != 1 || store.calls != item.refs || len(result.Diagnostic.AudioReferences) != item.refs {
				t.Fatalf("wrong uploads/generations/voices: %d/%d/%d", store.calls, generations.Load(), len(result.Diagnostic.AudioReferences))
			}
			total := 0.0
			for index, voice := range result.Diagnostic.AudioReferences {
				if math.Abs(voice.SubmittedDurationSeconds-item.want[index]) > .001 || voice.SourceDurationSeconds != float64(item.seconds) || voice.Trimmed != (item.want[index] < float64(item.seconds)) {
					t.Fatalf("voice %d lost its duration/trim receipt: %+v", index+1, voice)
				}
				total += voice.SubmittedDurationSeconds
			}
			if total > videoAudioLimits(item.model).total {
				t.Fatal("uploaded voices exceeded combined budget", total)
			}
			preserved, _ := os.ReadFile(path)
			if !bytes.Equal(original, preserved) {
				t.Fatal("multi-voice trimming changed library source")
			}
		})
	}
}

func TestReferenceAudioPreparesAllMinimumLengthsBeforeAnyUpload(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	writeReferenceWav(t, root, "local/audio/long.wav", 20)
	writeReferenceWav(t, root, "local/audio/short.wav", 1)
	_, _, err := prepareVideoAudioReferences(context.Background(), audioTestProjectRoot(t), "viduq4-preview",
		[]string{"/storage/local/audio/long.wav", "/storage/local/audio/short.wav"}, "local", false, viduAudioTestStorage(t))
	if err == nil || !strings.Contains(err.Error(), "音频2") || store.calls != 0 {
		t.Fatal("short sample was not rejected before any uploads", err, store.calls)
	}
}

func TestViduMinimumLengthConversionDoesNotShortenThreeSecondSample(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	writeReferenceWav(t, root, "local/audio/three.wav", 3)
	_, prepared, err := prepareVideoAudioReferences(context.Background(), audioTestProjectRoot(t), "viduq4-preview",
		[]string{"/storage/local/audio/three.wav"}, "local", false, viduAudioTestStorage(t))
	if err != nil || len(prepared) != 1 || prepared[0].submittedDuration < 3 || prepared[0].submittedDuration > 3.1 || prepared[0].trimmed {
		t.Fatalf("minimum Q4 sample was shortened: %+v %v", prepared, err)
	}
	file := filepath.Join(t.TempDir(), "submitted.mp3")
	if err := os.WriteFile(file, store.body, 0600); err != nil {
		t.Fatal(err)
	}
	duration, err := system.ProbeAudioDuration(context.Background(), audioTestProjectRoot(t), file)
	if err != nil || duration < 3 || duration > 12 {
		t.Fatalf("invalid Q4 MP3 duration: %f %v", duration, err)
	}
}

func TestReferenceAudioTotalIncludesFractionalMilliseconds(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	path := writeReferenceWav(t, root, "local/audio/fractional.wav", 8)
	data, _ := os.ReadFile(path)
	// 60004 samples at 8000 Hz: two originals total 15.001 seconds.
	data = data[:44+60004*2]
	binary.LittleEndian.PutUint32(data[4:8], uint32(len(data)-8))
	binary.LittleEndian.PutUint32(data[40:44], uint32(len(data)-44))
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	_, prepared, err := prepareVideoAudioReferences(context.Background(), audioTestProjectRoot(t), "wan3.0-video",
		[]string{"/storage/local/audio/fractional.wav", "/storage/local/audio/fractional.wav"}, "local", false, viduAudioTestStorage(t))
	if err != nil || len(prepared) != 2 {
		t.Fatalf("fractional duration preparation: %v %v", prepared, err)
	}
	if prepared[0].submittedDuration+prepared[1].submittedDuration > 15 || !prepared[0].trimmed || !prepared[1].trimmed {
		t.Fatalf("fractional milliseconds exceeded the total budget: %+v", prepared)
	}
}

func TestCompatibleMP3ReferenceIsNotReencodedForFractionalDuration(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	wav := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	original, _, _, err := transcodeReferenceAudio(context.Background(), audioTestProjectRoot(t), wav, "mp3", 0)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "local/audio/original.mp3")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	for _, model := range []string{"viduq4-preview", "doubao-seedance-2.0-mini", "wan3.0-video"} {
		_, prepared, err := prepareVideoAudioReferences(context.Background(), audioTestProjectRoot(t), model,
			[]string{"/storage/local/audio/original.mp3"}, "local", false, viduAudioTestStorage(t))
		if err != nil || len(prepared) != 1 || prepared[0].trimmed || !bytes.Equal(original, store.body) {
			t.Fatalf("compatible MP3 was unnecessarily reencoded for %s: %+v %v", model, prepared, err)
		}
	}
}
