package modelgw

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDispatchModalitySuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"task_id":"task-audio-123"}`))
	}))
	defer server.Close()

	res := SubmitAudio(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/tts"},
		APIKey:      "test-key",
		PayloadJSON: `{"text":"hello"}`,
		Client:      server.Client(),
		ReadTaskID: func(m map[string]any) string {
			id, _ := m["task_id"].(string)
			return id
		},
	})

	if res.Outcome != Accepted || res.TaskID != "task-audio-123" {
		t.Fatalf("unexpected result: %#v", res)
	}
}

func TestDispatchModalityAvatarAndThreeD(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"task-avatar-999"}`))
	}))
	defer server.Close()

	avatarRes := SubmitAvatar(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/avatar"},
		APIKey:      "test-key",
		PayloadJSON: `{"video_id":"vid-1"}`,
		Client:      server.Client(),
		ReadTaskID: func(m map[string]any) string {
			id, _ := m["id"].(string)
			return id
		},
	})
	if avatarRes.Outcome != Accepted || avatarRes.TaskID != "task-avatar-999" {
		t.Fatalf("avatar submit failed: %#v", avatarRes)
	}

	threedRes := SubmitThreeD(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/threed"},
		APIKey:      "test-key",
		PayloadJSON: `{"image_url":"https://example.com/img.png"}`,
		Client:      server.Client(),
		ReadTaskID: func(m map[string]any) string {
			id, _ := m["id"].(string)
			return id
		},
	})
	if threedRes.Outcome != Accepted || threedRes.TaskID != "task-avatar-999" {
		t.Fatalf("threed submit failed: %#v", threedRes)
	}
}

func TestDispatchModalityMultimodal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"prompt too long"}`))
	}))
	defer server.Close()

	res := SubmitMultimodal(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/vlm"},
		APIKey:      "test-key",
		PayloadJSON: `{}`,
		Client:      server.Client(),
	})
	if res.Outcome != Rejected || res.Error != "prompt too long" {
		t.Fatalf("unexpected multimodal rejection: %#v", res)
	}
}
