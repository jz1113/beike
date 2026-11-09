package generate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

// These receipts describe transport facts, never provider capabilities or whether
// the provider actually used a reference. Audio bytes and signed URLs stay out.
type videoSubmissionDiagnostics struct {
	Version             int                             `json:"version"`
	Model               string                          `json:"model"`
	RefMode             string                          `json:"refMode,omitempty"`
	ExtensionStrategy   string                          `json:"extensionStrategy,omitempty"`
	Family              string                          `json:"family"`
	GenerateAudio       *bool                           `json:"generateAudio,omitempty"`
	ContextIREnabled    *bool                           `json:"contextIrEnabled,omitempty"`
	AudioReferenceCount int                             `json:"audioReferenceCount"`
	AudioReferences     []videoAudioReferenceDiagnostic `json:"audioReferences"`
	Endpoint            *videoEndpointDiagnostic        `json:"endpoint,omitempty"`
	EndpointAttempts    int                             `json:"endpointAttempts"`
	SubmissionOutcome   string                          `json:"submissionOutcome"`
	PreparedAt          string                          `json:"preparedAt"`
	SubmittedAt         string                          `json:"submittedAt,omitempty"`
}

type videoAudioReferenceDiagnostic struct {
	Index                    int     `json:"index"`
	Role                     string  `json:"role"`
	SourceType               string  `json:"sourceType"`
	VoiceID                  string  `json:"voiceId,omitempty"`
	SourceSHA256             string  `json:"sourceSha256,omitempty"`
	ReferenceSHA256          string  `json:"referenceSha256"`
	SourceDurationSeconds    float64 `json:"sourceDurationSeconds,omitempty"`
	SubmittedDurationSeconds float64 `json:"submittedDurationSeconds,omitempty"`
	Trimmed                  bool    `json:"trimmed,omitempty"`
}

type videoEndpointDiagnostic struct {
	Host string `json:"host"`
	Path string `json:"path"`
}

var videoDiagnosticPathSecret = regexp.MustCompile(`(?i)(/(?:api[_-]?key|token|authorization|secret)(?:/|=))[^/]+`)

func safeVideoDiagnosticEndpoint(raw, apiKey string) *videoEndpointDiagnostic {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil
	}
	path, host := parsed.Path, parsed.Host
	if apiKey != "" {
		path = strings.ReplaceAll(path, apiKey, "[redacted]")
		host = strings.ReplaceAll(host, apiKey, "[redacted]")
	}
	path = videoDiagnosticPathSecret.ReplaceAllString(path, "${1}[redacted]")
	return &videoEndpointDiagnostic{Host: host, Path: path}
}

func prepareVideoSubmissionDiagnostics(cfg config.Config, r *http.Request, recordID string, payload map[string]json.RawMessage, adapted videoAdapted) (*videoSubmissionDiagnostics, error) {
	diagnostic := &videoSubmissionDiagnostics{
		Version: 1, Model: adapted.modelID, Family: adapted.family,
		AudioReferences: []videoAudioReferenceDiagnostic{}, SubmissionOutcome: "prepared",
		PreparedAt: time.Now().UTC().Format(time.RFC3339Nano), RefMode: rawString(payload, "ref_mode"),
	}
	if adapted.family == "veo" && diagnostic.RefMode == "extend" {
		diagnostic.ExtensionStrategy = "frame-continuation"
		if adapted.payload["instances"] != nil {
			diagnostic.ExtensionStrategy = "native"
		}
	}
	if enabled, ok := adapted.payload["context_ir_enabled"].(bool); ok {
		diagnostic.ContextIREnabled = &enabled
	}
	if enabled, ok := adapted.payload["generate_audio"].(bool); ok {
		diagnostic.GenerateAudio = &enabled
	} else if enabled, ok := adapted.payload["audio"].(bool); ok {
		diagnostic.GenerateAudio = &enabled
	} else if parameters, ok := adapted.payload["parameters"].(map[string]any); ok {
		if enabled, ok := parameters["audio"].(bool); ok {
			diagnostic.GenerateAudio = &enabled
		}
	}
	refs, roles := submittedVideoAudioReferences(adapted)
	sources := rawStringList(payload["audios"])
	for index, ref := range refs {
		item := videoAudioReferenceDiagnostic{Index: index + 1, Role: roles[index], SourceType: "remote", ReferenceSHA256: videoDiagnosticDigest([]byte(ref))}
		if item.Role == "reference_voice" {
			item.SourceType, item.VoiceID = "preset", ref
			diagnostic.AudioReferences = append(diagnostic.AudioReferences, item)
			continue
		}
		if index < len(adapted.audioPreparation) {
			prepared := adapted.audioPreparation[index]
			item.SourceDurationSeconds, item.SubmittedDurationSeconds, item.Trimmed = prepared.sourceDuration, prepared.submittedDuration, prepared.trimmed
		}
		if index < len(sources) && strings.HasPrefix(strings.TrimSpace(sources[index]), "/storage/") {
			path, err := localReferenceAudioPath(strings.TrimSpace(sources[index]), workspaceOf(r), cfg.Production())
			if err != nil {
				return nil, err
			}
			item.SourceSHA256, err = videoDiagnosticFileDigest(path)
			if err != nil {
				return nil, err
			}
			item.SourceType = "local"
		} else if strings.HasPrefix(strings.ToLower(ref), "asset://") {
			item.SourceType = "asset"
		}
		diagnostic.AudioReferences = append(diagnostic.AudioReferences, item)
	}
	diagnostic.AudioReferenceCount = len(diagnostic.AudioReferences)
	return diagnostic, writeVideoSubmissionDiagnostics(cfg, workspaceOf(r), recordID, diagnostic)
}

func submittedVideoAudioReferences(adapted videoAdapted) (refs, roles []string) {
	if adapted.family == "grok-video" {
		if voices, ok := adapted.payload["reference_audios"].([]map[string]string); ok {
			for _, voice := range voices {
				refs, roles = append(refs, voice["voice_id"]), append(roles, "reference_voice")
			}
		}
	}
	if adapted.family == "minimax" {
		if audios, ok := adapted.payload["audioUrls"].([]string); ok {
			for _, ref := range audios {
				refs, roles = append(refs, ref), append(roles, "reference_audio")
			}
		}
	}
	if adapted.family == "vidu" {
		if sounds, ok := adapted.payload["sounds"].([]string); ok {
			for _, ref := range sounds {
				refs, roles = append(refs, ref), append(roles, "reference_audio")
			}
		}
	}
	if content, ok := adapted.payload["content"].([]map[string]any); ok {
		for _, item := range content {
			if item["type"] != "audio_url" {
				continue
			}
			if node, ok := item["audio_url"].(map[string]string); ok {
				refs = append(refs, node["url"])
				role, _ := item["role"].(string)
				roles = append(roles, role)
			}
		}
	}
	if input, ok := adapted.payload["input"].(map[string]any); ok {
		if media, ok := input["media"].([]map[string]string); ok {
			for _, item := range media {
				if item["type"] == "reference_audio" {
					refs, roles = append(refs, item["url"]), append(roles, item["type"])
				}
			}
		}
	}
	return refs, roles
}

func finishVideoSubmissionDiagnostics(cfg config.Config, r *http.Request, recordID string, diagnostic *videoSubmissionDiagnostics, result gateway.SubmitResult, apiKey string) bool {
	diagnostic.Endpoint = safeVideoDiagnosticEndpoint(result.UsedSubmitURL, apiKey)
	diagnostic.EndpointAttempts = result.EndpointAttempts
	diagnostic.SubmissionOutcome = string(result.Outcome)
	diagnostic.SubmittedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return writeVideoSubmissionDiagnostics(cfg, workspaceOf(r), recordID, diagnostic) == nil
}

func rejectVideoDiagnosticPreparation(cfg config.Config, w http.ResponseWriter, r *http.Request, recordID, key string) {
	message := "视频请求诊断记录保存失败，尚未向上游提交，可以重新生成"
	_ = settleVideoSubmission(cfg, r, recordID, imageTaskDraft{Status: "FAILURE", FailReason: message})
	httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
		"success": false, "taskKey": key, "recordId": recordID, "submissionOutcome": "rejected",
		"submissionRejected": true, "submissionUnknown": false, "submitted": false, "retryable": false, "error": message,
	})
}

func videoDiagnosticDigest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func videoDiagnosticFileDigest(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	count, err := io.Copy(hash, io.LimitReader(file, videoReferenceAudioMaxBytes+1))
	if err != nil {
		return "", err
	}
	if count == 0 || count > videoReferenceAudioMaxBytes {
		return "", errors.New("参考音频为空或超过 15MB")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func videoSubmissionDiagnosticFile(cfg config.Config, workspace, recordID string) string {
	root := cfg.DataDir()
	if root == "" {
		root = filepath.Join(cfg.Root, ".local")
	}
	// Workspace names never form path segments, including when supplied by tests
	// or older development clients. The database lookup supplies the record ID.
	key := videoDiagnosticDigest([]byte(workspace + "\x00" + recordID))
	return filepath.Join(root, "submission-receipts", "video", key+".json")
}

func writeVideoSubmissionDiagnostics(cfg config.Config, workspace, recordID string, diagnostic *videoSubmissionDiagnostics) error {
	body, err := json.Marshal(diagnostic)
	if err != nil {
		return err
	}
	path := videoSubmissionDiagnosticFile(cfg, workspace, recordID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".video-diagnostic-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(body); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func readVideoSubmissionDiagnostics(cfg config.Config, workspace, recordID string) *videoSubmissionDiagnostics {
	file, err := os.Open(videoSubmissionDiagnosticFile(cfg, workspace, recordID))
	if err != nil {
		return nil
	}
	defer file.Close()
	var diagnostic videoSubmissionDiagnostics
	if json.NewDecoder(io.LimitReader(file, 64<<10)).Decode(&diagnostic) != nil || diagnostic.Version != 1 {
		return nil
	}
	return &diagnostic
}
