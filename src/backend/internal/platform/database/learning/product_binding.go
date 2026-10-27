package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"unicode/utf16"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

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
