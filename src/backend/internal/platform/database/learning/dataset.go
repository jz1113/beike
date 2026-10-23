package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strconv"
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
		sample.Fingerprint = Hash(map[string]any{"images": sample.Images, "shots": sample.Shots})
		dataset.Samples = append(dataset.Samples, sample)
	}
	sort.Slice(dataset.Samples, func(i, j int) bool { return dataset.Samples[i].ID < dataset.Samples[j].ID })
	roleRows, err := db.QueryContext(ctx, `SELECT "groupId","role" FROM "CategorySkillSampleRole" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folderID)
	if err != nil {
		return Dataset{}, err
	}
	roles := map[string]string{}
	for roleRows.Next() {
		var id, role string
		if err := roleRows.Scan(&id, &role); err != nil {
			roleRows.Close()
			return Dataset{}, err
		}
		roles[id] = role
	}
	err = roleRows.Err()
	roleRows.Close()
	if err != nil {
		return Dataset{}, err
	}
	holdouts := 0
	for i := range dataset.Samples {
		sample := &dataset.Samples[i]
		sample.Role = roles[sample.ID]
		if role := roles[sampleSourceRole(*sample)]; role != "" {
			sample.Role = role
		}
		if sample.Role == "" {
			number, _ := strconv.ParseUint(Hash(sample.ID)[:2], 16, 8)
			sample.Role = "training"
			if number%5 == 0 {
				sample.Role = "holdout"
			}
		}
		if sample.Role == "holdout" {
			holdouts++
		}
	}
	// Establish at least three held-out groups before the first consolidation.
	if len(dataset.Samples) >= 20 {
		for i := range dataset.Samples {
			if holdouts >= 3 {
				break
			}
			sample := &dataset.Samples[i]
			// Already observed training images must never become validation evidence.
			if sample.Role != "holdout" && roles[sample.ID] == "" && roles[sampleSourceRole(*sample)] == "" {
				sample.Role = "holdout"
				holdouts++
			}
		}
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
