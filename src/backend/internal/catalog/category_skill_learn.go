package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
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
	action := r.URL.Query().Get("action")
	observeOnly := action == "observe"
	consolidateOnly := action == "consolidate"
	limit := 5
	if value, exists := payload["maxNewSamples"]; exists {
		number, valid := value.(float64)
		if !valid || number != float64(int(number)) || number < 1 || number > 30 {
			writeSkillError(w, 400, "每轮读图数量应为 1–30 套")
			return
		}
		limit = int(number)
	}
	if (memory.Pending == 0 || consolidateOnly) && (observeOnly || len(versions) > 0 && versions[0].SourceFingerprint == dataset.Fingerprint && versions[0].Manifest.FeedbackFingerprint == feedbackHash && versions[0].Manifest.MemoryFingerprint == memory.Fingerprint && versions[0].Manifest.EngineVersion == learning.EngineVersion && learning.MemoryCovered(memory, versions[0])) {
		writeSkillError(w, 409, "没有新增样本、经验或反馈，无需重复调用模型")
		return
	}
	if consolidateOnly && !learning.ReadyToConsolidate(memory, scope.MinSamples) {
		writeSkillError(w, 400, "尚无已学观察或手动经验，请先读图或记录经验")
		return
	}
	if !consolidateOnly && memory.Pending == 0 && !learning.ReadyToConsolidate(memory, scope.MinSamples) {
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
	run := categorySkillRun{cfg: cfg, workspace: workspace, folder: folder, token: token, base: base, key: key, model: model,
		payload: payload, dataset: dataset, scope: scope, memory: memory, versions: versions, feedback: feedback,
		feedbackHash: feedbackHash, observeOnly: observeOnly, consolidateOnly: consolidateOnly, limit: limit}
	if background, _ := payload["background"].(bool); background {
		protocol := gateway.TextProtocol(r.Context(), model)
		go func() {
			workerDB, openErr := httpx.OpenDB(cfg)
			if openErr != nil {
				finishCategorySkillRun(cfg, workspace, folder, token, "后台分析无法打开数据库，请稍后重试")
				return
			}
			defer workerDB.Close()
			workerRequest := r.Clone(gateway.WithTextProtocol(context.Background(), protocol))
			run.db = workerDB
			run.request = workerRequest
			run.writer = nil
			executeCategorySkillRun(run)
		}()
		httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"success": true, "stage": "running", "analyzedGroups": 0, "remaining": memory.Pending, "model": model})
		return
	}
	run.db = db
	run.request = r
	run.writer = w
	executeCategorySkillRun(run)
}

type categorySkillRun struct {
	cfg                                        config.Config
	db                                         *sql.DB
	request                                    *http.Request
	writer                                     http.ResponseWriter
	workspace, folder, token, base, key, model string
	payload                                    map[string]any
	dataset                                    learning.Dataset
	scope                                      learning.Scope
	memory                                     learning.Memory
	versions                                   []learning.Version
	feedback                                   []learning.Feedback
	feedbackHash                               string
	observeOnly, consolidateOnly               bool
	limit                                      int
}

func finishCategorySkillRun(cfg config.Config, workspace, folder, token, message string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = learning.FinishRun(ctx, db, workspace, folder, token, message)
	if message != "" {
		_ = learning.Log(ctx, db, workspace, folder, "", "failed", message)
	}
}

func executeCategorySkillRun(run categorySkillRun) {
	r, db, w := run.request, run.db, run.writer
	failure := "分析中断，已完成的逐组观察保留；可手动重试"
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = learning.FinishRun(ctx, db, run.workspace, run.folder, run.token, failure)
		if failure != "" {
			_ = learning.Log(ctx, db, run.workspace, run.folder, "", "failed", failure)
		}
	}()
	fail := func(status int, message string) {
		failure = message
		if w != nil {
			writeSkillError(w, status, message)
		}
	}
	ctx := r.Context()
	if err := learning.SaveRoles(ctx, db, run.workspace, run.folder, run.dataset.Samples); err != nil {
		fail(500, "样本分工保存失败")
		return
	}
	pendingIDs := map[string]bool{}
	for _, entry := range run.memory.Entries {
		if entry.State == "pending" || entry.State == "stale" || entry.State == "failed" {
			pendingIDs[entry.GroupID] = true
		}
	}
	analyzed, attempted := 0, 0
	failedSamples := []string{}
	usage := map[string]any{}
	for _, sample := range run.dataset.Samples {
		if run.consolidateOnly || !pendingIDs[sample.ID] || attempted >= run.limit {
			continue
		}
		attempted++
		// Remove only a cached failure when the user explicitly retries this run.
		observation, tokens, err := observeCategorySample(run.cfg, r, run.base, run.key, run.model, run.payload, run.dataset.Folder, sample, run.dataset.LearningInstruction)
		addLearningUsage(usage, tokens)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			message := fmt.Sprintf("图组「%s」：%s", sample.Title, err)
			failedSamples = append(failedSamples, message)
			observation = map[string]any{"error": message}
		} else {
			analyzed++
		}
		encoded, _ := json.Marshal(observation)
		if err := learning.SaveObservation(ctx, db, run.workspace, run.folder, run.model, sample, encoded); err != nil {
			fail(500, "逐组观察保存失败")
			return
		}
		if err := learning.Progress(ctx, db, run.workspace, run.folder, run.token, attempted); err != nil {
			fail(409, err.Error())
			return
		}
	}
	memory, err := learning.ReadMemory(ctx, db, run.workspace, run.folder, run.dataset)
	if err != nil {
		fail(500, "观察记忆读取失败")
		return
	}
	if len(failedSamples) > 0 {
		failure = strings.Join(failedSamples, "；")
		fail(502, fmt.Sprintf("本轮完成 %d 套，失败 %d 套。%s；已完成观察保留，可重试未成功图组", analyzed, len(failedSamples), failure))
		return
	}
	if run.observeOnly || (!run.consolidateOnly && !learning.ReadyToConsolidate(memory, run.scope.MinSamples)) {
		failure = ""
		_ = learning.Log(ctx, db, run.workspace, run.folder, "", "observed", fmt.Sprintf("本轮读取 %d 套；累计记住 %d 套，待学习 %d 套，不适用 %d 套", analyzed, memory.Learned, memory.Pending, memory.Rejected))
		if w != nil {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "stage": "observed", "analyzedGroups": analyzed, "remaining": memory.Pending, "usage": usage, "model": run.model})
		}
		return
	}
	// Continue the newest usable draft, so unpublished improvements are remembered.
	previous, inherited := categoryParent(run.versions, run.scope.ActiveVersionID, run.dataset, memory)
	if run.dataset.LearningInstruction != "" {
		previous = run.dataset.LearningInstruction + "\n【此前已整理规则】\n" + previous
	}
	observations := selectCategorySources(memory.Sources, inherited)
	recent := run.feedback
	if len(recent) > 20 {
		recent = recent[len(recent)-20:]
	}
	content := []any{map[string]any{"type": "text", "text": learning.NotePrompt(memory.Notes) + consolidatePrompt(run.dataset.Folder, observations, previous, recent)}}
	content, err = categoryFeedbackContent(run.cfg, content, recent)
	if err != nil {
		failure = "评分反馈的原图无法读取，请修复图片来源后重试；观察记忆已保留"
		fail(400, failure)
		return
	}
	raw, status, tokens, err := categorySkillChat(ctx, run.base, run.key, run.model, run.payload, content)
	addLearningUsage(usage, tokens)
	if err != nil || status < 200 || status >= 300 {
		failure = "技能整理失败，逐组观察已保留，可重试整理"
		fail(502, failure)
		return
	}
	candidate := learningJSON(raw)
	prompt, summary := styleString(candidate, "promptSnippet"), styleString(candidate, "summary")
	if utf8.RuneCountInString(prompt) < 300 || utf8.RuneCountInString(prompt) > 12000 || summary == "" || !validLearningEvidence(candidate, observations, len(memory.Notes) > 0) {
		failure = "模型没有返回完整规则与可核对的样本依据，未保存候选"
		fail(502, failure)
		return
	}
	fresh, err := learning.LoadDataset(ctx, db, run.workspace, run.folder)
	notes, noteErr := learning.Notes(ctx, db, run.workspace, run.folder)
	if err != nil || noteErr != nil || fresh.Fingerprint != run.dataset.Fingerprint || fresh.LearningFingerprint != run.dataset.LearningFingerprint || learning.Hash(notes) != memory.Fingerprint {
		failure = "分析期间样本或经验发生变化，观察记忆已保留，请重新整理"
		fail(409, failure)
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
	for _, sample := range run.dataset.Samples {
		if used[sample.ID] {
			sample.ObservationDigest = learning.MemoryDigest(memory, sample.ID)
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
	manifest := learning.Manifest{Samples: samples, FeedbackFingerprint: run.feedbackHash, RuleEvidence: evidence, MemoryFingerprint: memory.Fingerprint, Notes: memory.Notes, EngineVersion: learning.EngineVersion}
	id, err := learning.SaveVersion(ctx, db, run.workspace, run.folder, run.token, learning.Version{ParentVersionID: run.scope.ActiveVersionID, SourceFingerprint: run.dataset.Fingerprint, Manifest: manifest, PromptSnippet: prompt, Summary: summary, Model: run.model})
	if err != nil {
		fail(409, "候选保存失败或正式版本已变化，请刷新重试")
		return
	}
	_ = learning.Log(ctx, db, run.workspace, run.folder, id, "candidate", fmt.Sprintf("基于 %d 套新旧观察整理候选，保留历史经验；可直接设为正式技能或先试用对比", len(observations)))
	failure = ""
	if w != nil {
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "stage": "candidate", "versionId": id, "usage": usage, "model": run.model, "analyzedGroups": analyzed, "remaining": memory.Pending})
	}
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

func validLearningEvidence(candidate map[string]any, observations []map[string]any, notesOnly ...bool) bool {
	if len(observations) == 0 && len(notesOnly) > 0 && notesOnly[0] {
		list, ok := candidate["evidence"].([]any)
		return ok && len(list) == 0
	}
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
