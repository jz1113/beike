package catalog

import (
	"encoding/json"
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
				writeSkillError(w, 400, err.Error())
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
			pending := 0
			for _, sample := range dataset.Samples {
				if sample.Role != "training" {
					continue
				}
				raw, err := learning.Observation(r.Context(), db, workspace, folder, sample)
				if err != nil {
					writeSkillError(w, 500, "样本分析进度读取失败")
					return
				}
				if raw == nil {
					pending++
				}
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
			latest := ""
			if len(versions) > 0 {
				latest = versions[0].Manifest.FeedbackFingerprint
			}
			fingerprint := learning.Hash([]string{dataset.Fingerprint, learning.FeedbackFingerprint(learning.TrainingFeedback(dataset, feedback))})
			feedbackChanged := latest != learning.FeedbackFingerprint(learning.TrainingFeedback(dataset, feedback))
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "scope": scope, "dataset": dataset, "versions": versions, "events": events, "validations": validations, "pendingSamples": pending, "feedbackCount": len(feedback), "feedbackChanged": feedbackChanged, "attemptFingerprint": fingerprint})
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
		if action == "learn" {
			learnCategorySkill(cfg, w, r, db, payload)
			return
		}
		revision, ok := payload["revision"].(float64)
		if !ok || revision != float64(int(revision)) {
			writeSkillError(w, 400, "请刷新后再修改技能状态")
			return
		}
		if action == "configure" {
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
