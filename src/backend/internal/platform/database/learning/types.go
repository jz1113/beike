package learning

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"
)

type Folder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MajorID   string `json:"majorId"`
	MajorName string `json:"majorName"`
}
type Sample struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Fingerprint string           `json:"fingerprint"`
	Images      []string         `json:"images"`
	Shots       []map[string]any `json:"shots"`
	Role        string           `json:"role"`
}
type Dataset struct {
	Folder      Folder   `json:"folder"`
	Total       int      `json:"total"`
	Excluded    int      `json:"excluded"`
	Duplicates  int      `json:"duplicates"`
	Samples     []Sample `json:"samples"`
	Fingerprint string   `json:"fingerprint"`
}
type Scope struct {
	FolderID            string `json:"folderId"`
	AutoAnalyze         bool   `json:"autoAnalyze"`
	AutoPublish         bool   `json:"autoPublish"`
	MinSamples          int    `json:"minSamples"`
	ActiveVersionID     string `json:"activeVersionId"`
	TrialVersionID      string `json:"trialVersionId"`
	ComparisonVersionID string `json:"comparisonVersionId"`
	Revision            int    `json:"revision"`
	RunningToken        string `json:"runningToken"`
	RunningAt           string `json:"runningAt"`
	Progress            int    `json:"progress"`
	LastAttempt         string `json:"lastAttempt"`
	Error               string `json:"error"`
}
type Manifest struct {
	Samples             []Sample         `json:"samples"`
	FeedbackFingerprint string           `json:"feedbackFingerprint"`
	RuleEvidence        []map[string]any `json:"ruleEvidence"`
	MemoryFingerprint   string           `json:"memoryFingerprint"`
	Notes               []Note           `json:"notes"`
	EngineVersion       string           `json:"engineVersion"`
}

// Bump when observation or consolidation semantics change.
const EngineVersion = "category-agent-v3"

type Version struct {
	ID                string   `json:"id"`
	FolderID          string   `json:"folderId"`
	ParentVersionID   string   `json:"parentVersionId"`
	SourceFingerprint string   `json:"sourceFingerprint"`
	Manifest          Manifest `json:"manifest"`
	PromptSnippet     string   `json:"promptSnippet"`
	Summary           string   `json:"summary"`
	Model             string   `json:"model"`
	CreatedAt         string   `json:"createdAt"`
}
type Feedback struct {
	VersionID     string         `json:"versionId"`
	TaskID        string         `json:"taskId"`
	ComparisonKey string         `json:"comparisonKey"`
	GroupID       string         `json:"groupId"`
	Decision      string         `json:"decision"`
	Scores        map[string]int `json:"scores"`
	Note          string         `json:"note"`
	CreatedAt     string         `json:"createdAt"`
	Evidence      map[string]any `json:"evidence"`
}
type Validation struct {
	Passed   bool   `json:"passed"`
	Pairs    int    `json:"pairs"`
	Products int    `json:"products"`
	Reason   string `json:"reason"`
}
type Event struct {
	ID        string `json:"id"`
	VersionID string `json:"versionId"`
	Type      string `json:"type"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

func Hash(value any) string {
	raw, _ := json.Marshal(value)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func ID() string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(data[:])
}
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }
