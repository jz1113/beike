package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func Versions(ctx context.Context, db *sql.DB, workspace, folder string) ([]Version, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? ORDER BY "createdAt" DESC LIMIT 50`, workspace, folder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := []Version{}
	for rows.Next() {
		v, err := scanVersion(rows)
		if err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

type scanner interface{ Scan(...any) error }

func scanVersion(row scanner) (Version, error) {
	var v Version
	var manifest string
	err := row.Scan(&v.ID, &v.FolderID, &v.ParentVersionID, &v.SourceFingerprint, &manifest, &v.PromptSnippet, &v.Summary, &v.Model, &v.CreatedAt)
	if err != nil {
		return v, err
	}
	err = json.Unmarshal([]byte(manifest), &v.Manifest)
	return v, err
}
func ReadVersion(ctx context.Context, db *sql.DB, workspace, folder, id string) (Version, error) {
	return scanVersion(db.QueryRowContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? AND "id"=?`, workspace, folder, id))
}
func SaveVersion(ctx context.Context, db *sql.DB, workspace, folder, token string, version Version) (string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var parent, running string
	if err := tx.QueryRowContext(ctx, `SELECT "activeVersionId","runningToken" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&parent, &running); err != nil {
		return "", err
	}
	if running != token || parent != version.ParentVersionID {
		return "", ErrConflict
	}
	version.ID = ID()
	manifest, err := json.Marshal(version.Manifest)
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO "CategorySkillVersion" ("id","workspaceId","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?)`, version.ID, workspace, folder, parent, version.SourceFingerprint, string(manifest), version.PromptSnippet, version.Summary, version.Model, now())
	if err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return version.ID, nil
}
func ManifestCurrent(version Version, dataset Dataset) bool {
	current := map[string]string{}
	for _, s := range dataset.Samples {
		current[s.ID] = s.Fingerprint
	}
	for _, s := range version.Manifest.Samples {
		if current[s.ID] != s.Fingerprint {
			return false
		}
	}
	return len(version.Manifest.Samples) > 0 || len(version.Manifest.Notes) > 0
}

func Switch(ctx context.Context, db *sql.DB, workspace, folder, action, versionID string, revision int) error {
	scope, err := ReadScope(ctx, db, workspace, folder)
	if err != nil {
		return err
	}
	if scope.Revision != revision {
		return ErrConflict
	}
	active, trial, comparison := scope.ActiveVersionID, scope.TrialVersionID, scope.ComparisonVersionID
	switch action {
	case "baseline":
		trial = ""
	case "rollback":
		if active == "" {
			return errors.New("尚无可回滚的生产版本")
		}
		v, err := ReadVersion(ctx, db, workspace, folder, active)
		if err != nil {
			return err
		}
		active = v.ParentVersionID
		trial = ""
		comparison = ""
		versionID = active
	case "trial", "publish", "activate":
		version, err := ReadVersion(ctx, db, workspace, folder, versionID)
		if err != nil {
			return err
		}
		if version.ParentVersionID != active {
			return errors.New("候选版本的基础版本已变化，请重新提炼")
		}
		dataset, err := LoadDataset(ctx, db, workspace, folder)
		if err != nil {
			return err
		}
		if !ManifestCurrent(version, dataset) {
			return errors.New("候选版本的参考样本已修改或移除，请重新提炼")
		}
		notes, err := Notes(ctx, db, workspace, folder)
		if err != nil {
			return err
		}
		if version.Manifest.MemoryFingerprint != "" && version.Manifest.MemoryFingerprint != Hash(notes) {
			return errors.New("类目经验已更新，请先整理新技能再试用或发布")
		}
		if action == "trial" {
			trial = versionID
			comparison = versionID
		} else if action == "activate" {
			active = versionID
			trial = ""
			comparison = ""
		} else {
			feedback, err := Feedbacks(ctx, db, workspace, folder)
			if err != nil {
				return err
			}
			validation := Validate(version, feedback)
			if !validation.Passed {
				return errors.New(validation.Reason)
			}
			active = versionID
			trial = ""
			comparison = ""
		}
	default:
		return errors.New("技能操作无效")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "activeVersionId"=?,"trialVersionId"=?,"comparisonVersionId"=?,"revision"="revision"+1 WHERE "workspaceId"=? AND "folderId"=? AND "revision"=?`, active, trial, comparison, workspace, folder, revision)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, versionID, action, map[string]string{"trial": "后续分析试用候选版本；已分析批次不变", "baseline": "后续分析恢复正式技能，用于同商品同设置对照", "publish": "候选通过同条件的实际成图对照，升级为正式技能", "activate": "直接设为当前细分的正式技能", "rollback": "恢复上一生产版本，保留历史记录"}[action], now())
	if err != nil {
		return err
	}
	return tx.Commit()
}

const BaseRecipeID = "__category_skill__"

// The base is a complete creative skill; training references are never production inputs.
func BaseRecipe() map[string]any {
	return map[string]any{"id": BaseRecipeID, "name": "按商品细分应用创作技能", "category": "general", "tag": "自动细分", "libraryVersion": "category-creative-v2", "promptSnippet": "以当前商品图（@图片1）确认身份、型号、颜色、结构、标识、比例和材质，不臆造不可见细节或未经证实的参数。根据商品用途、可见结构及适用的类目创作方法，自主设计可共同发布的小红书生活摄影分镜：每镜有明确展示目的、构图机位、主体占比、动作或摆放接触、生活场景、自然光色、真实材质与接触阴影。四镜或八镜按内容安排递进与差异，不机械重复机位，不强制人像、棚拍或奢华道具。需要人物时明确成年人物身份与穿搭，并在同款多镜中保持一致；纯静物不添加人脸或手部，仅手部镜头不扩展为人像。每镜输出完整、独立可执行的提示词。技能中的历史样本只用于归纳创作方法，生产不绑定或复刻任何参考原图。"}
}

func Apply(ctx context.Context, db *sql.DB, workspace string, group map[string]any, refs []string, shots []map[string]any, base map[string]any) (map[string]any, error) {
	folder := GroupFolder(group)
	if folder == "" {
		return base, nil
	}
	if _, err := ReadFolder(ctx, db, workspace, folder); err != nil {
		return nil, err
	}
	scope, err := ReadScope(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	versionID := scope.TrialVersionID
	if versionID == "" {
		versionID = scope.ActiveVersionID
	}
	result := map[string]any{}
	for key, value := range base {
		result[key] = value
	}
	result["learningScopeId"], result["learningVersionId"] = folder, versionID
	result["learningReferenceFingerprint"] = Hash(map[string]any{"images": refs, "shots": shots})
	notes, err := Notes(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	result["baseRecipeVersion"] = Hash(map[string]any{"base": base, "notes": notes})
	result["promptSnippet"] = text(base, "promptSnippet") + NotePrompt(notes)
	if versionID == "" {
		return result, nil
	}
	version, err := ReadVersion(ctx, db, workspace, folder, versionID)
	if err != nil {
		return nil, err
	}
	// Never apply a candidate against a silently edited or removed source dataset.
	dataset, err := LoadDataset(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	if !ManifestCurrent(version, dataset) {
		return nil, errors.New("细分技能的学习样本已变化，请回到素材与技能重新提炼或回滚")
	}
	result["name"], result["promptSnippet"], result["libraryVersion"] = dataset.Folder.Name+" · 类目技能", text(base, "promptSnippet")+"\n【类目技能】\n"+strings.TrimSpace(version.PromptSnippet)+NotePrompt(notes), versionID
	result["updatedAt"] = version.CreatedAt
	return result, nil
}

func RecoverRuns(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "runningToken"='',"error"='服务重启中断了分析；逐组观察保留，请手动重试' WHERE "runningToken"<>''`)
	return err
}

// EditVersion preserves published text and creates a candidate against the current active version.
func EditVersion(ctx context.Context, db *sql.DB, workspace, folder, sourceID, content, summary string, revision int) (string, error) {
	content = strings.TrimSpace(content)
	summary = strings.TrimSpace(summary)
	if sourceID == "" || content == "" || utf8.RuneCountInString(content) > 16000 || utf8.RuneCountInString(summary) > 200 {
		return "", errors.New("技能正文需为 1–16000 字，修改说明最多 200 字")
	}
	if _, err := ReadFolder(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var active, running string
	var current int
	if err := tx.QueryRowContext(ctx, `SELECT "activeVersionId","runningToken","revision" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&active, &running, &current); err != nil {
		return "", err
	}
	if current != revision || running != "" {
		return "", ErrConflict
	}
	source, err := scanVersion(tx.QueryRowContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? AND "id"=?`, workspace, folder, sourceID))
	if err != nil {
		return "", errors.New("来源技能不可用，请刷新后重试")
	}
	if content == strings.TrimSpace(source.PromptSnippet) {
		return "", errors.New("技能正文未修改")
	}
	if summary == "" {
		summary = "手动编辑技能"
	}
	manifest, err := json.Marshal(source.Manifest)
	if err != nil {
		return "", err
	}
	id, created := ID(), now()
	if _, err := tx.ExecContext(ctx, `INSERT INTO "CategorySkillVersion" ("id","workspaceId","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?)`, id, workspace, folder, active, source.SourceFingerprint, string(manifest), content, summary, "manual", created); err != nil {
		return "", err
	}
	result, err := tx.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "revision"="revision"+1,"lastAttempt"='' WHERE "workspaceId"=? AND "folderId"=? AND "revision"=? AND "runningToken"=''`, workspace, folder, revision)
	if err != nil {
		return "", err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return "", ErrConflict
	}
	detail := "手动编辑保存为新候选；来源版本：" + sourceID
	if _, err := tx.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, id, "edit", detail, created); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

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
	result := Validation{Reason: "需要至少 3 款商品，以相同商品图和生成设置完成新旧技能的实际成图评分对照"}
	holdouts := map[string]bool{}
	for _, s := range version.Manifest.Samples {
		if s.Role == "holdout" || s.Role == "training" {
			holdouts[s.ID] = true
		}
	}
	baseline := map[string]Feedback{}
	candidate := map[string]Feedback{}
	for _, f := range feedback {
		skillOnly := version.FolderID != "" && f.GroupID == "skill:"+version.FolderID
		if (!holdouts[f.GroupID] && !skillOnly) || !validScores(f.Scores) || f.ComparisonKey == "" {
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
	result.Reason = "至少 3 款商品的实际成图对照通过，各维度无退步且存在提升"
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
	if dataset.Folder.ID != "" {
		allowed["skill:"+dataset.Folder.ID] = true
	}
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

// ForProduct loads only the published/trial skill and notes. Its training
// dataset is checked when activating a version, never as a production dependency.
func ForProduct(ctx context.Context, db *sql.DB, workspace, title string, props map[string]string, base map[string]any) (map[string]any, error) {
	org, err := dblibrary.ListAssetOrganization(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	folder := productSkillFolder(org.Categories, title, props)
	if folder == "" {
		return base, nil
	}
	named, err := ReadFolder(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	scope, err := ReadScope(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	versionID := scope.TrialVersionID
	if versionID == "" {
		versionID = scope.ActiveVersionID
	}
	notes, err := Notes(ctx, db, workspace, folder)
	if err != nil {
		return nil, err
	}
	result := map[string]any{}
	for key, value := range base {
		result[key] = value
	}
	result["learningScopeId"], result["learningVersionId"] = folder, versionID
	// Stable across skill versions so actual same-product/settings comparisons pair.
	result["learningReferenceFingerprint"] = Hash(map[string]any{"production": "skill_only", "folder": folder})
	result["baseRecipeVersion"] = Hash(map[string]any{"base": base, "notes": notes})
	result["promptSnippet"] = text(base, "promptSnippet") + NotePrompt(notes)
	result["name"] = named.Name + " · 基础创作技能"
	if versionID == "" {
		return result, nil
	}
	version, err := ReadVersion(ctx, db, workspace, folder, versionID)
	if err != nil {
		return nil, errors.New("当前创作技能版本不可访问，请在素材与技能检查或回滚")
	}
	if strings.TrimSpace(version.PromptSnippet) == "" {
		return nil, errors.New("当前创作技能内容为空，请重新整理技能")
	}
	result["name"] = named.Name + " · 创作技能"
	result["promptSnippet"] = text(base, "promptSnippet") + "\n【类目创作技能】\n" + strings.TrimSpace(version.PromptSnippet) + NotePrompt(notes)
	result["libraryVersion"], result["updatedAt"] = versionID, version.CreatedAt
	return result, nil
}

// Match saved folder rules independently of whether that folder has any images.
// Equal evidence for different folders is ambiguous; use the base rather than
// silently choosing another product's skill.
func productSkillFolder(categories []dblibrary.OrganizationCategory, title string, props map[string]string) string {
	roots := map[string]bool{}
	for _, row := range categories {
		if row.ParentID == nil && !row.IsArchived {
			roots[row.ID] = true
		}
	}
	active := []dblibrary.OrganizationCategory{}
	for _, row := range categories {
		if row.ParentID != nil && roots[*row.ParentID] && !row.IsArchived && strings.HasPrefix(row.ID, database.PromptSubcategoryPrefix) {
			active = append(active, row)
		}
	}
	// Built-in digital folders exist virtually unless explicitly archived.
	if roots["digital_3c"] {
		for _, kind := range []string{"phone", "case", "earphone", "tablet"} {
			id, found := database.BuiltinFolderID(kind), false
			for _, row := range categories {
				if row.ID == id {
					found = true
					break
				}
			}
			if !found {
				parent := "digital_3c"
				active = append(active, dblibrary.OrganizationCategory{ID: id, ParentID: &parent})
			}
		}
	}
	soldTitle := dblibrary.ProductSubjectText(title)
	soldProps := map[string]string{}
	for key, value := range props {
		if !strings.ContainsAny(key, "赠促销活动礼品") {
			soldProps[key] = value
		}
	}
	raw, _ := json.Marshal(soldProps)
	subject := strings.ToLower(soldTitle + " " + string(raw))
	digital := dblibrary.ProductSubcategory(soldTitle, soldProps)
	type match struct {
		id    string
		score int
	}
	matches := []match{}
	for _, row := range active {
		builtin := ""
		for _, kind := range []string{"phone", "case", "earphone", "tablet"} {
			if row.ID == database.BuiltinFolderID(kind) {
				builtin = kind
				break
			}
		}
		if builtin != "" && digital != "" && builtin != digital {
			continue
		}
		score := 0
		for _, rawWords := range []string{row.Keywords, row.Aliases} {
			var words []string
			_ = json.Unmarshal([]byte(rawWords), &words)
			for _, word := range words {
				word = strings.ToLower(strings.TrimSpace(word))
				if word != "" && strings.Contains(subject, word) {
					n := len(utf16.Encode([]rune(word)))
					if n > score {
						score = n
					}
				}
			}
		}
		// Explicit rules win over names and built-in compatibility fallbacks.
		if score > 0 {
			score += 1000
		} else if builtin != "" && builtin == digital {
			score = 500
		} else if name := strings.ToLower(strings.TrimSpace(row.Name)); name != "" && strings.Contains(subject, name) {
			score = 100
		}
		if score > 0 {
			matches = append(matches, match{row.ID, score})
		}
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].score > matches[j].score })
	if len(matches) == 0 || len(matches) > 1 && matches[0].score == matches[1].score {
		return ""
	}
	return matches[0].id
}

var ErrConflict = errors.New("技能状态已变化或正在分析，请刷新后重试")

func ReadScope(ctx context.Context, db *sql.DB, workspace, folder string) (Scope, error) {
	s := Scope{FolderID: folder, MinSamples: 1}
	err := db.QueryRowContext(ctx, `SELECT "autoAnalyze","autoPublish","minSamples","activeVersionId","trialVersionId","comparisonVersionId","revision","runningToken","runningAt","progress","lastAttempt","error" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&s.AutoAnalyze, &s.AutoPublish, &s.MinSamples, &s.ActiveVersionID, &s.TrialVersionID, &s.ComparisonVersionID, &s.Revision, &s.RunningToken, &s.RunningAt, &s.Progress, &s.LastAttempt, &s.Error)
	if err == sql.ErrNoRows {
		return s, nil
	}
	return s, err
}

func EnsureScope(ctx context.Context, db *sql.DB, workspace, folder string) error {
	_, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillScope" ("workspaceId","folderId","minSamples") VALUES (?,?,1)`, workspace, folder)
	return err
}
func Configure(ctx context.Context, db *sql.DB, workspace, folder string, revision, min int, analyze, publish bool) error {
	if min < 1 || min > 30 {
		return errors.New("整体提炼阈值应在 1–30 套之间")
	}
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return err
	}
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "autoAnalyze"=?,"autoPublish"=?,"minSamples"=?,"revision"="revision"+1 WHERE "workspaceId"=? AND "folderId"=? AND "revision"=? AND "runningToken"=''`, analyze, publish, min, workspace, folder, revision)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return ErrConflict
	}
	return nil
}
func BeginRun(ctx context.Context, db *sql.DB, workspace, folder, fingerprint string, force bool) (string, error) {
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	token := ID()
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "runningToken"=?,"runningAt"=?,"lastAttempt"=?,"progress"=0,"error"='' WHERE "workspaceId"=? AND "folderId"=? AND ("runningToken"='' OR "runningAt"<?) AND (? OR "lastAttempt"<>?)`, token, now(), fingerprint, workspace, folder, time.Now().Add(-30*time.Minute).UTC().Format(time.RFC3339Nano), force, fingerprint)
	if err != nil {
		return "", err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return "", ErrConflict
	}
	return token, nil
}
func FinishRun(ctx context.Context, db *sql.DB, workspace, folder, token, message string) error {
	_, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "runningToken"='',"error"=? WHERE "workspaceId"=? AND "folderId"=? AND "runningToken"=?`, message, workspace, folder, token)
	return err
}
func Progress(ctx context.Context, db *sql.DB, workspace, folder, token string, n int) error {
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "progress"=?,"runningAt"=? WHERE "workspaceId"=? AND "folderId"=? AND "runningToken"=?`, n, now(), workspace, folder, token)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return ErrConflict
	}
	return nil
}

func Observation(ctx context.Context, db *sql.DB, workspace, folder string, sample Sample) (json.RawMessage, error) {
	var raw string
	err := db.QueryRowContext(ctx, `SELECT "observationJson" FROM "CategorySkillObservation" WHERE "workspaceId"=? AND "folderId"=? AND "groupId"=? AND "fingerprint"=?`, workspace, folder, sample.ID, observationKey(sample)).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return json.RawMessage(raw), err
}
func SaveObservation(ctx context.Context, db *sql.DB, workspace, folder, model string, sample Sample, raw json.RawMessage) error {
	_, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillObservation" ("workspaceId","folderId","groupId","fingerprint","observationJson","model","createdAt") VALUES (?,?,?,?,?,?,?) ON CONFLICT ("workspaceId","folderId","groupId","fingerprint") DO UPDATE SET "observationJson"=excluded."observationJson","model"=excluded."model","createdAt"=excluded."createdAt"`, workspace, folder, sample.ID, observationKey(sample), string(raw), model, now())
	return err
}
func SaveRoles(ctx context.Context, db *sql.DB, workspace, folder string, samples []Sample) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	entries := []Sample{}
	for _, s := range samples {
		entries = append(entries, s, Sample{ID: sampleSourceRole(s), Role: s.Role})
	}
	for _, s := range entries {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillSampleRole" ("workspaceId","folderId","groupId","role") VALUES (?,?,?,?)`, workspace, folder, s.ID, s.Role); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func Log(ctx context.Context, db *sql.DB, workspace, folder, version, kind, detail string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, version, kind, detail, now())
	return err
}
func Events(ctx context.Context, db *sql.DB, workspace, folder string) ([]Event, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","versionId","eventType","detail","createdAt" FROM "CategorySkillEvent" WHERE "workspaceId"=? AND "folderId"=? ORDER BY "createdAt" DESC LIMIT 30`, workspace, folder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Event{}
	for rows.Next() {
		var event Event
		if err := rows.Scan(&event.ID, &event.VersionID, &event.Type, &event.Detail, &event.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func observationKey(sample Sample) string {
	if sample.ObservationKey != "" {
		return Hash([]string{sample.Fingerprint, sample.ObservationKey})
	}
	return sample.Fingerprint
}
