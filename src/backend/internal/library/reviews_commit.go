package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

var durableImageURL = regexp.MustCompile(`^https?://|^/[^/]`)

func commitDeconstructReview(cfg config.Config, w http.ResponseWriter, r *http.Request, id, action string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	defer db.Close()
	_, payload, status, ok, err := dblibrary.GetDeconstructReview(r.Context(), db, httpx.WorkspaceFrom(r), id)
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if !ok {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "审核图集不存在"})
		return
	}
	var stored map[string]any
	if json.Unmarshal([]byte(payload), &stored) != nil || stored == nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if action == "replace" {
		replaceMotherReview(w, r, db, id, status, stored)
		return
	}
	if status == "approved" {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "fullPromptIds": stored["fullPromptIds"]})
		return
	}
	if status != "pending" {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "请先恢复此图集再审核"})
		return
	}
	if stored["parsedResult"] == nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	fullOnly, _ := stored["fullPromptOnly"].(bool)
	parent := stringValue(stored["parentFullPromptId"])
	if fullOnly && parent != "" {
		var registryID string
		err := db.QueryRowContext(r.Context(), `SELECT "id" FROM "PromptAssetRegistry" WHERE "workspaceId" = ? AND "assetType" = 'full_prompt' AND "sourceAssetId" = ?`, httpx.WorkspaceFrom(r), parent).Scan(&registryID)
		if err == sql.ErrNoRows {
			httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "来源母本记录不存在，请重新选择母本后提炼"})
			return
		}
		if err != nil {
			writeReviewFailure(w, "审核失败")
			return
		}
	}
	drafts, draftErr := deconstructGroupDrafts(stored)
	if draftErr != nil {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": draftErr.Error()})
		return
	}
	ids, saveErr := dblibrary.CommitDeconstructGroups(r.Context(), db, httpx.WorkspaceFrom(r), id, drafts)
	if saveErr != nil {
		writeReviewFailure(w, "参考母本入库失败，候选仍保留："+saveErr.Error())
		return
	}

	if source := stringValue(stored["sourceKey"]); source != "" {
		_, _ = db.ExecContext(r.Context(), `UPDATE "PromptImportSource" SET "state" = 'approved', "updatedAt" = "updatedAt" WHERE "workspaceId" = ? AND "sourceKey" = ?`, httpx.WorkspaceFrom(r), source)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "fullPromptIds": ids})
}

func replaceMotherReview(w http.ResponseWriter, r *http.Request, db *sql.DB, reviewID, status string, stored map[string]any) {
	if status != "pending" && status != "approved" {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "请先恢复此图集再审核"})
		return
	}
	fullOnly, _ := stored["fullPromptOnly"].(bool)
	motherID := stringValue(stored["parentFullPromptId"])
	if !fullOnly || motherID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "换图候选没有关联来源母组", "code": "missing_mother"})
		return
	}
	var existingReview string
	err := db.QueryRowContext(r.Context(), `SELECT "reviewId" FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" = ?`, httpx.WorkspaceFrom(r), motherID).Scan(&existingReview)
	if err == nil {
		if existingReview == reviewID {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "motherId": motherID, "alreadyReplaced": true})
			return
		}
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "此母组已完成一次换图，不能再次覆盖", "code": "mother_already_replaced"})
		return
	}
	if err != sql.ErrNoRows {
		writeReviewFailure(w, "审核失败")
		return
	}
	if status != "pending" {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "此候选已作为衍生母本入库，不能再替换来源母组", "code": "review_already_approved"})
		return
	}
	var provenance, shots string
	err = db.QueryRowContext(r.Context(), `SELECT "provenance","shotPromptsJson" FROM "FullPromptAsset" WHERE "id" = ? AND "workspaceId" = ?`, motherID, httpx.WorkspaceFrom(r)).Scan(&provenance, &shots)
	if err == sql.ErrNoRows {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "来源母组不存在或不属于当前工作区", "code": "mother_not_found"})
		return
	}
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if provenance == "workshop_generated" {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "生成的衍生母组已使用原创成图，无需替换", "code": "generated_mother"})
		return
	}
	urls := stringList(stored["imageUrls"])
	images, _ := stored["perImageResults"].([]any)
	parsed, _ := stored["parsedResult"].(map[string]any)
	groups, _ := parsed["content_groups"].([]any)
	if len(urls) != 4 || len(images) != 4 || len(groups) != 1 || !durableGroup(urls, images) {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "换图必须是四张完整、可长期访问且已重新分析的成图", "code": "incomplete_generated_group"})
		return
	}
	if !shotsMatch(shots, images) {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "新图的人物／静物镜头顺序与母组不一致，请改为新增衍生母组", "code": "shot_structure_mismatch"})
		return
	}
	drafts, draftErr := deconstructGroupDrafts(stored)
	if draftErr != nil || len(drafts) != 1 {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "新图未形成完整四镜反推词，原母本未修改"})
		return
	}
	rawShots := []byte(stringValue(drafts[0]["shotPromptsJson"]))
	summary := ""
	if parsed != nil {
		summary = stringValue(parsed["content_summary"])
	}
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	defer tx.Rollback()
	snapshot, _ := json.Marshal(map[string]any{"priorPromptHash": hashText(shots)})
	generated, _ := json.Marshal(urls)
	result, err := tx.ExecContext(r.Context(), `
		INSERT OR IGNORE INTO "FullPromptImageReplacement" ("motherAssetId","workspaceId","reviewId","sourceSnapshotJson","generatedImagesJson","createdAt")
		VALUES (?,?,?,?,?,datetime('now'))`, motherID, httpx.WorkspaceFrom(r), reviewID, string(snapshot), string(generated))
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "此母组已完成换图，或候选状态已变化", "code": "mother_already_replaced"})
		return
	}
	updated, err := tx.ExecContext(r.Context(), `
		UPDATE "FullPromptAsset" SET "sourceImages" = ?, "sourceImageIndices" = ?, "shotPromptsJson" = ?, "contentSummary" = ?, "reversePromptZh" = ?
		WHERE "id" = ? AND "workspaceId" = ?`, string(generated), "[1,2,3,4]", string(rawShots), summary, summary, motherID, httpx.WorkspaceFrom(r))
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if changed, _ := updated.RowsAffected(); changed != 1 {
		writeReviewFailure(w, "母组已变化，换图未提交")
		return
	}
	reviewed, err := tx.ExecContext(r.Context(), `UPDATE "DeconstructReview" SET "status" = 'approved' WHERE "workspaceId" = ? AND "id" = ? AND "status" = 'pending'`, httpx.WorkspaceFrom(r), reviewID)
	if err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	if changed, _ := reviewed.RowsAffected(); changed != 1 {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "候选审核状态已变化，换图未提交", "code": "review_status_changed"})
		return
	}
	if err := tx.Commit(); err != nil {
		writeReviewFailure(w, "审核失败")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "motherId": motherID, "alreadyReplaced": false})
}

func durableGroup(urls []string, images []any) bool {
	for _, url := range urls {
		if !durableImageURL.MatchString(url) {
			return false
		}
	}
	for index, image := range images {
		item, _ := image.(map[string]any)
		number, _ := item["image_index"].(float64)
		prompt := stringValue(item["reverse_prompt_zh"])
		if int(number) != index+1 || prompt == "" {
			return false
		}
	}
	return true
}

func shotsMatch(raw string, images []any) bool {
	var old []map[string]any
	if json.Unmarshal([]byte(raw), &old) != nil || len(old) != 4 || len(images) != 4 {
		return false
	}
	for index, image := range images {
		item, _ := image.(map[string]any)
		oldHuman, oldType := shotSubject(old[index]["has_human"], stringValue(old[index]["shot_type"]))
		action, _ := item["action"].(map[string]any)
		shotType := stringValue(action["shot_type"])
		if shotType == "" {
			shotType = stringValue(item["shot_type"])
		}
		newHuman, newType := shotSubject(item["has_human"], shotType)
		if oldHuman != newHuman || oldType != newType {
			return false
		}
	}
	return true
}

func shotSubject(hasHuman any, shotType string) (bool, string) {
	switch shotType {
	case "hand_held_only", "pure_product":
		return false, shotType
	case "model_shot":
		return true, shotType
	}
	if value, ok := hasHuman.(bool); ok {
		if value {
			return true, "model_shot"
		}
		return false, "pure_product"
	}
	return true, "model_shot"
}

func hashText(value string) string {
	sum := sha256.Sum256([]byte(value))
	return string(sum[:])
}

func writeReviewFailure(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": message, "code": "internal_error"})
}
