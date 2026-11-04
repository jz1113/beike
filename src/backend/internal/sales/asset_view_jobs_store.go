package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/generate"
)

type assetViewJob struct {
	ID         string               `json:"id"`
	Key        string               `json:"key"`
	Kind       string               `json:"kind"`
	AssetID    string               `json:"assetId"`
	Model      string               `json:"model"`
	Name       string               `json:"name"`
	Status     string               `json:"status"`
	Error      string               `json:"error"`
	Images     map[string]string    `json:"images"`
	CreatedAt  string               `json:"createdAt"`
	UpdatedAt  string               `json:"updatedAt"`
	Creation   *assetCreationResult `json:"creation,omitempty"`
	checkpoint generate.ImageTaskCheckpoint
	generation map[string]any
	assetData  map[string]any
	baseSaved  bool
}

var assetViewJobMu sync.Mutex
var assetViewJobActive = map[string]bool{}
var assetViewJobSlots = make(chan struct{}, 2)

const assetViewJobColumns = `"id","requestKey","kind","assetId","model","status","error","imagesJson","createdAt","updatedAt","taskId","resultUrl","generationJson","assetDataJson","baseSaved"`

func scanAssetViewJob(row interface{ Scan(...any) error }) (assetViewJob, error) {
	var job assetViewJob
	var images, generation, assetData string
	err := row.Scan(&job.ID, &job.Key, &job.Kind, &job.AssetID, &job.Model, &job.Status, &job.Error, &images, &job.CreatedAt, &job.UpdatedAt, &job.checkpoint.TaskID, &job.checkpoint.ResultURL, &generation, &assetData, &job.baseSaved)
	if err != nil {
		return job, err
	}
	job.Images = map[string]string{}
	job.generation = map[string]any{}
	job.assetData = map[string]any{}
	if json.Unmarshal([]byte(images), &job.Images) != nil || json.Unmarshal([]byte(generation), &job.generation) != nil || json.Unmarshal([]byte(assetData), &job.assetData) != nil {
		return job, errors.New("invalid saved asset generation")
	}
	job.Creation = assetCreationResultFor(job.generation)
	job.Name, _ = job.assetData["name"].(string)
	if job.Name == "" {
		job.Name, _ = job.assetData["title"].(string)
	}
	return job, nil
}

func loadAssetViewJob(ctx context.Context, db *sql.DB, workspace, column, value string) (assetViewJob, error) {
	if column != "id" && column != "requestKey" {
		return assetViewJob{}, errors.New("invalid job lookup")
	}
	return scanAssetViewJob(db.QueryRowContext(ctx, `SELECT `+assetViewJobColumns+` FROM "SalesAssetViewJob" WHERE "workspaceId"=? AND "`+column+`"=?`, workspace, value))
}

func persistAssetViewJob(ctx context.Context, db *sql.DB, workspace string, job *assetViewJob) error {
	job.Creation = assetCreationResultFor(job.generation)
	job.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	images, err := json.Marshal(job.Images)
	if err != nil {
		return err
	}
	generation, err := json.Marshal(safeAssetViewGeneration(job.generation))
	if err != nil {
		return err
	}
	assetData, err := json.Marshal(job.assetData)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "SalesAssetViewJob" ("id","workspaceId","requestKey","kind","assetId","model","status","error","imagesJson","createdAt","updatedAt","taskId","resultUrl","generationJson","assetDataJson","baseSaved") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("id") DO UPDATE SET "assetId"=excluded."assetId","status"=excluded."status","error"=excluded."error","imagesJson"=excluded."imagesJson","updatedAt"=excluded."updatedAt","taskId"=excluded."taskId","resultUrl"=excluded."resultUrl","generationJson"=excluded."generationJson","baseSaved"=excluded."baseSaved"`, job.ID, workspace, job.Key, job.Kind, job.AssetID, job.Model, job.Status, job.Error, string(images), job.CreatedAt, job.UpdatedAt, job.checkpoint.TaskID, job.checkpoint.ResultURL, string(generation), string(assetData), job.baseSaved)
	return err
}

func safeAssetViewGeneration(payload map[string]any) map[string]any {
	// Only generation settings needed for recovery are persisted. Credentials stay
	// in the detached request and must be provided again after a service restart.
	out := map[string]any{}
	for _, key := range []string{"model", "modelSelection", "prompt", "size", "quality", "imageQuality", "aspectRatio", "customBaseUrl", "customProtocol", "requestTemplate", "imageProtocol", "imageProtocolTemplate", "useReferenceImage", "referenceImageUrl", "referenceImages", "source", "metadata", "allowInsecureHttp", "assetCreation"} {
		if value, ok := payload[key]; ok {
			out[key] = withoutAssetViewSecrets(value)
		}
	}
	return out
}

func withoutAssetViewSecrets(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		clean := map[string]any{}
		for key, nested := range typed {
			lower := strings.ToLower(key)
			if strings.Contains(lower, "key") || strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "authorization") {
				text, _ := nested.(string)
				if !strings.Contains(text, "{{apiKey}}") {
					continue
				}
			}
			clean[key] = withoutAssetViewSecrets(nested)
		}
		return clean
	case []any:
		clean := make([]any, len(typed))
		for i, nested := range typed {
			clean[i] = withoutAssetViewSecrets(nested)
		}
		return clean
	default:
		return value
	}
}

func assetViewJobRunning(job assetViewJob) bool {
	return job.Status != "completed" && job.Status != "failed"
}

func assetViewJobIdentity(file, workspace, id string) string {
	return file + "\x00" + workspace + "\x00" + id
}

func interruptOrphanAssetViewJob(ctx context.Context, db *sql.DB, file, workspace string, job *assetViewJob) error {
	if !assetViewJobRunning(*job) || assetViewJobActive[assetViewJobIdentity(file, workspace, job.ID)] {
		return nil
	}
	job.Status, job.Error = "failed", "服务已重启或任务中断，请继续补全；将核对原任务并沿用已生成图片"
	return persistAssetViewJob(ctx, db, workspace, job)
}
