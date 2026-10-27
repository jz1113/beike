package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func LoadDataset(ctx context.Context, db *sql.DB, workspace, folderID string) (Dataset, error) {
	folder, err := ReadFolder(ctx, db, workspace, folderID)
	if err != nil {
		return Dataset{}, err
	}
	rows, err := db.QueryContext(ctx, `SELECT "id" FROM "FullPromptAsset" WHERE "workspaceId" IN (?, 'official') AND "productSubcategory" IN (?,?) ORDER BY "id"`, workspace, folderID, strings.TrimPrefix(folderID, database.PromptSubcategoryPrefix+"digital_3c:"))
	if err != nil {
		return Dataset{}, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return Dataset{}, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dataset{}, err
	}
	dataset := Dataset{Folder: folder, Total: len(ids), Samples: []Sample{}}
	// Only explicit edits change the observation guidance. Generated candidates
	// must never invalidate their own inputs and cause an endless relearning loop.
	err = db.QueryRowContext(ctx, `SELECT "promptSnippet" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? AND "model"='manual' ORDER BY "createdAt" DESC,"id" DESC LIMIT 1`, workspace, folderID).Scan(&dataset.LearningInstruction)
	if err != nil && err != sql.ErrNoRows {
		return Dataset{}, err
	}
	dataset.LearningFingerprint = Hash([]string{ObservationVersion, ObservationPrompt(folder, Sample{}), dataset.LearningInstruction})
	seen := map[string]bool{}
	for _, id := range ids {
		raw, err := dblibrary.LibraryPromptDetail(ctx, db, workspace, id)
		if err != nil {
			return Dataset{}, err
		}
		var group map[string]any
		if json.Unmarshal(raw, &group) != nil {
			return Dataset{}, ErrScope
		}
		if !belongsToMajor(group, folder.MajorID) {
			dataset.Excluded++
			continue
		}
		sample, ok := sampleFromGroup(group)
		if !ok {
			dataset.Excluded++
			continue
		}
		images := append([]string{}, sample.Images...)
		sort.Strings(images)
		key := Hash(images)
		if seen[key] {
			dataset.Duplicates++
			continue
		}
		seen[key] = true
		sample.Fingerprint = Hash(map[string]any{"images": sample.Images, "shots": sample.Shots, "observationVersion": ObservationVersion})
		sample.ObservationKey = Hash([]string{sample.Fingerprint, dataset.LearningFingerprint})
		dataset.Samples = append(dataset.Samples, sample)
	}
	sort.Slice(dataset.Samples, func(i, j int) bool { return dataset.Samples[i].ID < dataset.Samples[j].ID })
	// Every effective original may contribute observations. Historical manifests
	// retain their old validation roles for provenance and optional comparisons.
	for i := range dataset.Samples {
		dataset.Samples[i].Role = "training"
	}
	manifest := []string{}
	for _, sample := range dataset.Samples {
		manifest = append(manifest, sample.ID+":"+sample.Fingerprint+":"+sample.Role)
	}
	dataset.Fingerprint = Hash(manifest)
	return dataset, nil
}

func belongsToMajor(group map[string]any, major string) bool {
	var ids []string
	_ = json.Unmarshal([]byte(text(group, "productCategoryIds")), &ids)
	for _, id := range ids {
		if id == major {
			return true
		}
	}
	return false
}

func sampleFromGroup(group map[string]any) (Sample, bool) {
	if group["contentEligible"] != true || text(group, "productionBlockReason") != "" || text(group, "provenance") == "workshop_generated" {
		return Sample{}, false
	}
	var images []string
	var indices []int
	var shots []map[string]any
	decode(group["sourceImages"], &images)
	decode(group["sourceImageIndices"], &indices)
	decode(group["shotPromptsJson"], &shots)
	if len(indices) != 4 || len(shots) != 4 {
		return Sample{}, false
	}
	refs := []string{}
	seenURL := map[string]bool{}
	seen := map[int]bool{}
	for i, n := range indices {
		if n < 1 || n > len(images) || seen[n] || seenURL[images[n-1]] || strings.TrimSpace(images[n-1]) == "" || strings.TrimSpace(text(shots[i], "prompt")) == "" {
			return Sample{}, false
		}
		seen[n] = true
		seenURL[images[n-1]] = true
		refs = append(refs, images[n-1])
	}
	return Sample{ID: text(group, "id"), Title: text(group, "title"), Images: refs, Shots: shots}, true
}
func decode(value any, target any) {
	if raw, ok := value.(string); ok {
		_ = json.Unmarshal([]byte(raw), target)
	} else {
		body, _ := json.Marshal(value)
		_ = json.Unmarshal(body, target)
	}
}
func text(value map[string]any, key string) string { result, _ := value[key].(string); return result }

func sampleSourceRole(sample Sample) string {
	images := append([]string{}, sample.Images...)
	sort.Strings(images)
	return "source:" + Hash(images)
}
