package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
)

func learnCategorySkill(cfg config.Config, w http.ResponseWriter, r *http.Request, db *sql.DB, payload map[string]any) {
	var ok bool
	r, ok = generate.BindTextProtocol(w, r, payload)
	if !ok {
		return
	}
	workspace, folder := httpx.WorkspaceFrom(r), styleString(payload, "folderId")
	dataset, err := learning.LoadDataset(r.Context(), db, workspace, folder)
	if err != nil {
		writeSkillError(w, 400, err.Error())
		return
	}
	scope, err := learning.ReadScope(r.Context(), db, workspace, folder)
	if err != nil {
		writeSkillError(w, 500, "技能状态读取失败")
		return
	}
	if len(dataset.Samples) < scope.MinSamples {
		writeSkillError(w, 400, fmt.Sprintf("当前有效、去重、原图完整的样本为 %d 套，整体提炼需要至少 %d 套", len(dataset.Samples), scope.MinSamples))
		return
	}
	versions, err := learning.Versions(r.Context(), db, workspace, folder)
	if err != nil {
		writeSkillError(w, 500, "技能版本读取失败")
		return
	}
	feedback, err := learning.Feedbacks(r.Context(), db, workspace, folder)
	if err != nil {
		writeSkillError(w, 500, "成图反馈读取失败")
		return
	}
	feedback = learning.TrainingFeedback(dataset, feedback)
	pending := []learning.Sample{}
	cached := []map[string]any{}
	for _, sample := range dataset.Samples {
		if sample.Role != "training" {
			continue
		}
		raw, err := learning.Observation(r.Context(), db, workspace, folder, sample)
		if err != nil {
			writeSkillError(w, 500, "观察资料读取失败")
			return
		}
		if raw == nil {
			pending = append(pending, sample)
		} else {
			var observation map[string]any
			if json.Unmarshal(raw, &observation) != nil {
				writeSkillError(w, 500, "观察资料损坏")
				return
			}
			cached = append(cached, map[string]any{"groupId": sample.ID, "observation": observation})
		}
	}
	lastFeedback := ""
	if len(versions) > 0 {
		lastFeedback = versions[0].Manifest.FeedbackFingerprint
	}
	feedbackHash := learning.FeedbackFingerprint(feedback)
	force, _ := payload["force"].(bool)
	if len(versions) > 0 && len(pending) == 0 && lastFeedback == feedbackHash {
		writeSkillError(w, 409, "没有新增样本或反馈，无需重复调用模型")
		return
	}
	if !force && len(versions) > 0 && len(pending) < 5 && lastFeedback == feedbackHash {
		writeSkillError(w, 409, "增量提炼等待至少 5 套新样本或新的成图反馈")
		return
	}
	base, key, model := styleCredentials(cfg, r, payload)
	if key == "" || model == "" {
		writeSkillError(w, 400, "请先选择并配置可用的多模态分析模型")
		return
	}
	fingerprint := learning.Hash([]string{dataset.Fingerprint, feedbackHash})
	token, err := learning.BeginRun(r.Context(), db, workspace, folder, fingerprint, force)
	if err != nil {
		writeSkillError(w, 409, err.Error())
		return
	}
	failure := "分析中断，已完成的逐组观察保留；可手动重试"
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = learning.FinishRun(ctx, db, workspace, folder, token, failure)
		if failure != "" {
			_ = learning.Log(ctx, db, workspace, folder, "", "failed", failure)
		}
	}()
	if err := learning.SaveRoles(r.Context(), db, workspace, folder, dataset.Samples); err != nil {
		writeSkillError(w, 500, "样本分工保存失败")
		return
	}
	_ = learning.Log(r.Context(), db, workspace, folder, "", "learning", fmt.Sprintf("有效 %d 套；逐组分析新样本，留出图组不参与规则提炼", len(dataset.Samples)))
	remaining := len(pending) - 30
	if len(pending) > 30 {
		pending = pending[:30]
	}
	observations := []map[string]any{}
	usage := map[string]any{}
	for i, sample := range pending {
		content := []any{map[string]any{"type": "text", "text": observeSamplePrompt(dataset.Folder, sample)}}
		for _, url := range sample.Images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": url}})
		}
		raw, status, tokens, err := categorySkillChat(r.Context(), base, key, model, payload, content)
		addLearningUsage(usage, tokens)
		if err != nil || status >= 300 {
			failure = fmt.Sprintf("图组「%s」分析失败，已完成观察保留；请检查模型连接后重试", sample.Title)
			writeSkillError(w, 502, failure)
			return
		}
		observation := learningJSON(raw)
		if err := validObservation(observation); err != nil {
			failure = fmt.Sprintf("图组「%s」：%s", sample.Title, err)
			writeSkillError(w, 502, failure)
			return
		}
		encoded, _ := json.Marshal(observation)
		if err := learning.SaveObservation(r.Context(), db, workspace, folder, model, sample, encoded); err != nil {
			writeSkillError(w, 500, "逐组观察保存失败")
			return
		}
		observations = append(observations, map[string]any{"groupId": sample.ID, "observation": observation})
		if err := learning.Progress(r.Context(), db, workspace, folder, token, i+1); err != nil {
			writeSkillError(w, 409, err.Error())
			return
		}
	}
	for _, observation := range cached {
		if len(observations) >= 30 {
			break
		}
		observations = append(observations, observation)
	}
	previous := ""
	inherited := []learning.Sample{}
	if scope.ActiveVersionID != "" {
		active, err := learning.ReadVersion(r.Context(), db, workspace, folder, scope.ActiveVersionID)
		if err != nil {
			writeSkillError(w, 500, "生产版本读取失败")
			return
		}
		previous = active.PromptSnippet
		inherited = active.Manifest.Samples
	}
	recent := feedback
	if len(recent) > 20 {
		recent = recent[len(recent)-20:]
	}
	content := []any{map[string]any{"type": "text", "text": consolidatePrompt(dataset.Folder, observations, previous, recent)}}
	for i := len(recent) - 1; i >= 0 && i >= len(recent)-3; i-- {
		f := recent[i]
		for _, key := range []string{"productImage", "referenceImage", "resultImage"} {
			url, _ := f.Evidence[key].(string)
			if url != "" {
				content = append(content, map[string]any{"type": "text", "text": "成图反馈 " + f.TaskID + " / " + key}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": url}})
			}
		}
	}
	raw, status, tokens, err := categorySkillChat(r.Context(), base, key, model, payload, content)
	addLearningUsage(usage, tokens)
	if err != nil || status >= 300 {
		failure = "整体架构提炼失败，逐组观察已保留，可重试整理"
		writeSkillError(w, 502, failure)
		return
	}
	candidate := learningJSON(raw)
	prompt, summary := styleString(candidate, "promptSnippet"), styleString(candidate, "summary")
	if utf8.RuneCountInString(prompt) < 300 || utf8.RuneCountInString(prompt) > 12000 || summary == "" || !validLearningEvidence(candidate, observations) {
		failure = "模型没有返回完整规则与可核对的样本依据，未保存候选"
		writeSkillError(w, 502, failure)
		return
	}
	fresh, err := learning.LoadDataset(r.Context(), db, workspace, folder)
	if err != nil || fresh.Fingerprint != dataset.Fingerprint {
		failure = "分析期间样本发生变化，逐组观察已保留，请重新整理"
		writeSkillError(w, 409, failure)
		return
	}
	used := map[string]bool{}
	for _, observation := range observations {
		used[styleString(observation, "groupId")] = true
	}
	for _, sample := range inherited {
		used[sample.ID] = true
	}
	samples := []learning.Sample{}
	for _, sample := range dataset.Samples {
		if used[sample.ID] || sample.Role == "holdout" {
			samples = append(samples, sample)
		}
	}
	evidence := []map[string]any{}
	if list, ok := candidate["evidence"].([]any); ok {
		for _, raw := range list {
			if entry, ok := raw.(map[string]any); ok {
				evidence = append(evidence, entry)
			}
		}
	}
	id, err := learning.SaveVersion(r.Context(), db, workspace, folder, token, learning.Version{ParentVersionID: scope.ActiveVersionID, SourceFingerprint: dataset.Fingerprint, Manifest: learning.Manifest{Samples: samples, FeedbackFingerprint: feedbackHash, RuleEvidence: evidence}, PromptSnippet: prompt, Summary: summary, Model: model})
	if err != nil {
		writeSkillError(w, 409, "候选保存失败或生产版本已变化，请刷新重试")
		return
	}
	_ = learning.Log(r.Context(), db, workspace, folder, id, "candidate", "已保存有样本依据的候选规则；尚需留出图组的实际成图对照")
	failure = ""
	if remaining >= 5 {
		_, _ = db.ExecContext(r.Context(), `UPDATE "CategorySkillScope" SET "lastAttempt"='' WHERE "workspaceId"=? AND "folderId"=? AND "runningToken"=?`, workspace, folder, token)
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "versionId": id, "usage": usage, "model": model, "analyzedGroups": len(pending)})
}
func addLearningUsage(total, usage map[string]any) {
	for key, value := range usage {
		if number, ok := value.(float64); ok {
			old, _ := total[key].(float64)
			total[key] = old + number
		} else if number, ok := value.(int); ok {
			old, _ := total[key].(float64)
			total[key] = old + float64(number)
		}
	}
}
func validLearningEvidence(candidate map[string]any, observations []map[string]any) bool {
	allowed := map[string]bool{}
	for _, o := range observations {
		allowed[styleString(o, "groupId")] = true
	}
	list, ok := candidate["evidence"].([]any)
	if !ok || len(list) == 0 {
		return false
	}
	for _, value := range list {
		item, ok := value.(map[string]any)
		if !ok || !allowed[styleString(item, "groupId")] || styleString(item, "rule") == "" || styleString(item, "condition") == "" {
			return false
		}
	}
	return true
}
