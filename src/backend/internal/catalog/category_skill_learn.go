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
		categoryReadError(w, err)
		return
	}
	scope, err := learning.ReadScope(r.Context(), db, workspace, folder)
	if err != nil {
		writeSkillError(w, 500, "技能状态读取失败")
		return
	}
	memory, err := learning.ReadMemory(r.Context(), db, workspace, folder, dataset)
	if err != nil {
		writeSkillError(w, 500, "类目记忆读取失败，请检查数据库升级状态")
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
	feedbackHash := learning.FeedbackFingerprint(feedback)
	observeOnly := r.URL.Query().Get("action") == "observe"
	limit := 5
	if value, exists := payload["maxNewSamples"]; exists {
		number, valid := value.(float64)
		if !valid || number != float64(int(number)) || number < 1 || number > 30 {
			writeSkillError(w, 400, "每轮读图数量应为 1–30 套")
			return
		}
		limit = int(number)
	}
	if memory.Pending == 0 && (observeOnly || len(versions) > 0 && versions[0].SourceFingerprint == dataset.Fingerprint && versions[0].Manifest.FeedbackFingerprint == feedbackHash && versions[0].Manifest.MemoryFingerprint == memory.Fingerprint && versions[0].Manifest.EngineVersion == learning.EngineVersion && learning.MemoryCovered(memory, versions[0])) {
		writeSkillError(w, 409, "没有新增样本、经验或反馈，无需重复调用模型")
		return
	}
	if memory.Pending == 0 && !learning.ReadyToConsolidate(memory, scope.MinSamples) {
		writeSkillError(w, 400, "有效学习样本不足，请继续投喂同类目参考图")
		return
	}
	base, key, model := styleCredentials(cfg, r, payload)
	if key == "" || model == "" {
		writeSkillError(w, 400, "请先选择并配置可用的多模态分析模型")
		return
	}
	force, _ := payload["force"].(bool)
	fingerprint := categoryAttempt(dataset, memory, feedbackHash)
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
	pendingIDs := map[string]bool{}
	for _, entry := range memory.Entries {
		if entry.State == "pending" {
			pendingIDs[entry.GroupID] = true
		}
	}
	analyzed := 0
	usage := map[string]any{}
	for _, sample := range dataset.Samples {
		if !pendingIDs[sample.ID] || analyzed >= limit {
			continue
		}
		content, err := categorySampleContent(cfg, dataset.Folder, sample)
		if err != nil {
			failure = fmt.Sprintf("图组「%s」原图无法读取，请修复来源后重试；已完成观察保留", sample.Title)
			writeSkillError(w, 400, failure)
			return
		}
		raw, status, tokens, err := categorySkillChat(r.Context(), base, key, model, payload, content)
		addLearningUsage(usage, tokens)
		if err != nil || status < 200 || status >= 300 {
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
		analyzed++
		if err := learning.Progress(r.Context(), db, workspace, folder, token, analyzed); err != nil {
			writeSkillError(w, 409, err.Error())
			return
		}
	}
	memory, err = learning.ReadMemory(r.Context(), db, workspace, folder, dataset)
	if err != nil {
		writeSkillError(w, 500, "观察记忆读取失败")
		return
	}
	if observeOnly || !learning.ReadyToConsolidate(memory, scope.MinSamples) {
		failure = ""
		_ = learning.Log(r.Context(), db, workspace, folder, "", "observed", fmt.Sprintf("本轮读取 %d 套；累计记住 %d 套，待学习 %d 套，不适用 %d 套", analyzed, memory.Learned, memory.Pending, memory.Rejected))
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "stage": "observed", "analyzedGroups": analyzed, "remaining": memory.Pending, "usage": usage, "model": model})
		return
	}
	// Continue the newest usable draft, so unpublished improvements are remembered.
	previous, inherited := categoryParent(versions, scope.ActiveVersionID, dataset, memory)
	observations := selectCategorySources(memory.Sources, inherited)
	recent := feedback
	if len(recent) > 20 {
		recent = recent[len(recent)-20:]
	}
	content := []any{map[string]any{"type": "text", "text": learning.NotePrompt(memory.Notes) + consolidatePrompt(dataset.Folder, observations, previous, recent)}}
	content, err = categoryFeedbackContent(cfg, content, recent)
	if err != nil {
		failure = "评分反馈的原图无法读取，请修复图片来源后重试；观察记忆已保留"
		writeSkillError(w, 400, failure)
		return
	}
	raw, status, tokens, err := categorySkillChat(r.Context(), base, key, model, payload, content)
	addLearningUsage(usage, tokens)
	if err != nil || status < 200 || status >= 300 {
		failure = "技能整理失败，逐组观察已保留，可重试整理"
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
	notes, noteErr := learning.Notes(r.Context(), db, workspace, folder)
	if err != nil || noteErr != nil || fresh.Fingerprint != dataset.Fingerprint || learning.Hash(notes) != memory.Fingerprint {
		failure = "分析期间样本或经验发生变化，观察记忆已保留，请重新整理"
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
	manifest := learning.Manifest{Samples: samples, FeedbackFingerprint: feedbackHash, RuleEvidence: evidence, MemoryFingerprint: memory.Fingerprint, Notes: memory.Notes, EngineVersion: learning.EngineVersion}
	id, err := learning.SaveVersion(r.Context(), db, workspace, folder, token, learning.Version{ParentVersionID: scope.ActiveVersionID, SourceFingerprint: dataset.Fingerprint, Manifest: manifest, PromptSnippet: prompt, Summary: summary, Model: model})
	if err != nil {
		writeSkillError(w, 409, "候选保存失败或正式版本已变化，请刷新重试")
		return
	}
	_ = learning.Log(r.Context(), db, workspace, folder, id, "candidate", fmt.Sprintf("基于 %d 套新旧观察整理候选，保留历史经验；等待实际成图对照", len(observations)))
	failure = ""
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "stage": "candidate", "versionId": id, "usage": usage, "model": model, "analyzedGroups": analyzed, "remaining": memory.Pending})
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

func categoryParent(versions []learning.Version, active string, dataset learning.Dataset, memory learning.Memory) (string, []learning.Sample) {
	rejected := map[string]bool{}
	for _, entry := range memory.Entries {
		rejected[entry.GroupID] = entry.State == "rejected"
	}
	for _, version := range versions {
		compatible := true
		for _, sample := range version.Manifest.Samples {
			if rejected[sample.ID] {
				compatible = false
			}
		}
		if compatible && (version.ParentVersionID == active || version.ID == active) && learning.ManifestCurrent(version, dataset) {
			return version.PromptSnippet, version.Manifest.Samples
		}
	}
	return "", nil
}

func selectCategorySources(sources []map[string]any, inherited []learning.Sample) []map[string]any {
	known := map[string]bool{}
	for _, sample := range inherited {
		known[sample.ID] = true
	}
	selected := []map[string]any{}
	characters := 0
	// Retrieve new experience first; previous rules carry forward older observations.
	for _, wasKnown := range []bool{false, true} {
		for _, source := range sources {
			if known[styleString(source, "groupId")] == wasKnown && len(selected) < 30 {
				raw, _ := json.Marshal(source)
				size := utf8.RuneCount(raw)
				if characters+size > 50000 {
					continue
				}
				selected = append(selected, source)
				characters += size
			}
		}
	}
	return selected
}
