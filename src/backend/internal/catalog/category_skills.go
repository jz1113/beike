package catalog

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
)

func CategorySkills(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeSkillError(w, 500, "细分技能库暂时无法读取")
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodGet {
			folder := r.URL.Query().Get("folderId")
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
			versions, err := learning.Versions(r.Context(), db, workspace, folder)
			if err != nil {
				writeSkillError(w, 500, "技能版本读取失败")
				return
			}
			known := map[string]bool{}
			for _, v := range versions {
				known[v.ID] = true
			}
			for _, id := range []string{scope.ActiveVersionID, scope.TrialVersionID, scope.ComparisonVersionID} {
				if id != "" && !known[id] {
					version, err := learning.ReadVersion(r.Context(), db, workspace, folder, id)
					if err != nil {
						writeSkillError(w, 500, "当前技能版本读取失败")
						return
					}
					versions = append(versions, version)
					known[id] = true
				}
			}

			feedback, err := learning.Feedbacks(r.Context(), db, workspace, folder)
			if err != nil {
				writeSkillError(w, 500, "成图反馈读取失败")
				return
			}
			events, err := learning.Events(r.Context(), db, workspace, folder)
			if err != nil {
				writeSkillError(w, 500, "优化记录读取失败")
				return
			}
			memory, err := learning.ReadMemory(r.Context(), db, workspace, folder, dataset)
			if err != nil {
				writeSkillError(w, 500, "类目记忆暂时无法读取，请检查服务是否已完成数据库升级")
				return
			}
			validations := map[string]learning.Validation{}
			for i := range versions {
				validations[versions[i].ID] = learning.Validate(versions[i], feedback)
				for j := range versions[i].Manifest.Samples {
					versions[i].Manifest.Samples[j].Images = nil
					versions[i].Manifest.Samples[j].Shots = nil
				}
			}
			for i := range dataset.Samples {
				dataset.Samples[i].Images = nil
				dataset.Samples[i].Shots = nil
			}
			feedbackHash := learning.FeedbackFingerprint(learning.TrainingFeedback(dataset, feedback))
			fingerprint := categoryAttempt(dataset, memory, feedbackHash)
			feedbackChanged, memoryChanged := len(feedback) > 0, len(memory.Notes) > 0
			needsConsolidation := memory.Learned > 0
			if len(versions) > 0 {
				latest := versions[0]
				feedbackChanged = latest.Manifest.FeedbackFingerprint != feedbackHash
				memoryChanged = latest.Manifest.MemoryFingerprint != memory.Fingerprint
				needsConsolidation = latest.SourceFingerprint != dataset.Fingerprint || feedbackChanged || memoryChanged || !learning.MemoryCovered(memory, latest) || latest.Manifest.EngineVersion != learning.EngineVersion
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "scope": scope, "dataset": dataset, "versions": versions, "events": events, "validations": validations, "memory": memory, "pendingSamples": memory.Pending, "feedbackCount": len(feedback), "feedbackChanged": feedbackChanged, "memoryChanged": memoryChanged, "needsConsolidation": needsConsolidation, "attemptFingerprint": fingerprint, "engineVersion": learning.EngineVersion})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, (256<<10)+1))
		if err != nil || len(body) > 256<<10 {
			writeSkillError(w, 400, "技能请求无效")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeSkillError(w, 400, "技能请求无效")
			return
		}
		folder := styleString(payload, "folderId")
		if _, err := learning.ReadFolder(r.Context(), db, workspace, folder); err != nil {
			writeSkillError(w, 400, err.Error())
			return
		}
		action := r.URL.Query().Get("action")
		if action == "learn" || action == "observe" {
			learnCategorySkill(cfg, w, r, db, payload)
			return
		}
		revision, ok := payload["revision"].(float64)
		if !ok || revision != float64(int(revision)) {
			writeSkillError(w, 400, "请刷新后再修改技能状态")
			return
		}
		if action == "remember" || action == "forget" || action == "retry-sample" {
			if action == "retry-sample" {
				dataset, loadErr := learning.LoadDataset(r.Context(), db, workspace, folder)
				if loadErr != nil {
					categoryReadError(w, loadErr)
					return
				}
				found := false
				for _, sample := range dataset.Samples {
					if sample.ID == styleString(payload, "id") && sample.Role == "training" {
						found = true
					}
				}
				if !found {
					writeSkillError(w, 400, "只能重新观察当前细分的学习样本")
					return
				}
			}
			err = learning.ChangeMemory(r.Context(), db, workspace, folder, action, styleString(payload, "id"), styleString(payload, "kind"), styleString(payload, "content"), int(revision))
		} else if action == "configure" {
			min, minOK := payload["minSamples"].(float64)
			analyze, analyzeOK := payload["autoAnalyze"].(bool)
			publish, publishOK := payload["autoPublish"].(bool)
			if !minOK || min != float64(int(min)) || !analyzeOK || !publishOK {
				writeSkillError(w, 400, "学习设置无效")
				return
			}
			err = learning.Configure(r.Context(), db, workspace, folder, int(revision), int(min), analyze, publish)
		} else {
			err = learning.Switch(r.Context(), db, workspace, folder, action, styleString(payload, "versionId"), int(revision))
		}
		if err != nil {
			writeSkillError(w, http.StatusConflict, err.Error())
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true})
	})
}

func categoryReadError(w http.ResponseWriter, err error) {
	if errors.Is(err, learning.ErrScope) {
		writeSkillError(w, 400, err.Error())
	} else {
		writeSkillError(w, 500, "类目资料暂时无法读取，请检查服务是否已完成数据库升级后重试")
	}
}

func categoryAttempt(dataset learning.Dataset, memory learning.Memory, feedbackHash string) string {
	return learning.Hash([]string{dataset.Fingerprint, feedbackHash, memory.Fingerprint, learning.EngineVersion})
}
