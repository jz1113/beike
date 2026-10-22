package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
)

func Feedbacks(ctx context.Context, db *sql.DB, workspace, folder string) ([]Feedback, error) {
	rows, err := db.QueryContext(ctx, `SELECT "versionId","taskId","comparisonKey","groupId","decision","scoresJson","note","evidenceJson","createdAt" FROM "CategorySkillFeedback" WHERE "workspaceId"=? AND "folderId"=? ORDER BY "createdAt" ASC`, workspace, folder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	feedback := []Feedback{}
	for rows.Next() {
		var f Feedback
		var scores, evidence string
		if err := rows.Scan(&f.VersionID, &f.TaskID, &f.ComparisonKey, &f.GroupID, &f.Decision, &scores, &f.Note, &evidence, &f.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(scores), &f.Scores); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(evidence), &f.Evidence); err != nil {
			return nil, err
		}
		feedback = append(feedback, f)
	}
	return feedback, rows.Err()
}

type feedbackExec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func SaveFeedback(ctx context.Context, db feedbackExec, workspace, folder string, f Feedback) error {
	scores, err := json.Marshal(f.Scores)
	if err != nil {
		return err
	}
	evidence, err := json.Marshal(f.Evidence)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "CategorySkillFeedback" ("workspaceId","folderId","versionId","taskId","comparisonKey","groupId","decision","scoresJson","note","evidenceJson","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT ("workspaceId","taskId") DO UPDATE SET "folderId"=excluded."folderId","versionId"=excluded."versionId","comparisonKey"=excluded."comparisonKey","groupId"=excluded."groupId","decision"=excluded."decision","scoresJson"=excluded."scoresJson","note"=excluded."note","evidenceJson"=excluded."evidenceJson","createdAt"=excluded."createdAt"`, workspace, folder, f.VersionID, f.TaskID, f.ComparisonKey, f.GroupID, f.Decision, string(scores), f.Note, string(evidence), now())
	return err
}
func FeedbackFingerprint(feedback []Feedback) string { return Hash(feedback) }

// Compare actual, explicitly rated outputs, never a model's self-assessment.
// Pair keys contain product images, reference hash, model and generation settings.
func Validate(version Version, feedback []Feedback) Validation {
	result := Validation{Reason: "需要至少 3 款商品，在留出图组上完成同商品、同参考、同生成设置的新旧版成图评分对照"}
	holdouts := map[string]bool{}
	for _, s := range version.Manifest.Samples {
		if s.Role == "holdout" {
			holdouts[s.ID] = true
		}
	}
	baseline := map[string]Feedback{}
	candidate := map[string]Feedback{}
	for _, f := range feedback {
		if !holdouts[f.GroupID] || !validScores(f.Scores) || f.ComparisonKey == "" {
			continue
		}
		if f.VersionID == version.ParentVersionID {
			baseline[f.ComparisonKey] = f
		}
		if f.VersionID == version.ID {
			candidate[f.ComparisonKey] = f
		}
	}
	totals := map[string]int{}
	products := map[string]bool{}
	acceptedOld, acceptedNew := 0, 0
	keys := []string{}
	for key := range candidate {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		next := candidate[key]
		old, ok := baseline[key]
		if !ok || old.GroupID != next.GroupID {
			continue
		}
		result.Pairs++
		products[strings.SplitN(key, ":", 2)[0]] = true
		if old.Decision == "accepted" {
			acceptedOld++
		}
		if next.Decision == "accepted" {
			acceptedNew++
		}
		for _, metric := range []string{"productFidelity", "composition", "aesthetic", "consistency"} {
			totals[metric] += next.Scores[metric] - old.Scores[metric]
		}
		if next.Decision != "accepted" || next.Scores["productFidelity"] < 80 || next.Scores["composition"] < 70 || next.Scores["aesthetic"] < 70 || next.Scores["consistency"] < 70 {
			result.Reason = "候选成图存在未采用结果或未达到商品保真/构图/真实感/一致性评分要求"
			return result
		}
	}
	result.Products = len(products)
	if result.Products < 3 {
		return result
	}
	for _, metric := range []string{"productFidelity", "composition", "aesthetic", "consistency"} {
		if totals[metric] < 0 {
			result.Reason = "候选在实际对照中有评分维度退步，暂不升级"
			return result
		}
	}
	improvement := acceptedNew > acceptedOld
	for _, delta := range totals {
		if delta > 0 {
			improvement = true
		}
	}
	if !improvement {
		result.Reason = "对照尚未显示优于生产版，保留当前版本"
		return result
	}
	result.Passed = true
	result.Reason = "留出图组至少 3 款商品的实际对照通过，各维度无退步且存在提升"
	return result
}
func validScores(scores map[string]int) bool {
	if len(scores) != 4 {
		return false
	}
	for _, key := range []string{"productFidelity", "composition", "aesthetic", "consistency"} {
		value, ok := scores[key]
		if !ok || value < 0 || value > 100 {
			return false
		}
	}
	return true
}

// Held-out images, observations and feedback never enter rule-writing prompts.
func TrainingFeedback(dataset Dataset, feedback []Feedback) []Feedback {
	allowed := map[string]bool{}
	for _, s := range dataset.Samples {
		if s.Role == "training" {
			allowed[s.ID] = true
		}
	}
	result := []Feedback{}
	for _, f := range feedback {
		if allowed[f.GroupID] {
			result = append(result, f)
		}
	}
	return result
}
