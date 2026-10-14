package database

import (
	"context"
	"database/sql"
	"encoding/json"
)

func importOneFolderRule(ctx context.Context, tx *sql.Tx, workspace, parentID, mode, name string, keywords, anatomy []string, hasAnatomy bool, siblings *[]ruleFolder, position *int) (bool, error) {
	var same []ruleFolder
	for _, sibling := range *siblings {
		if sibling.name == name {
			same = append(same, sibling)
		}
	}
	var candidates []ruleFolder
	for _, sibling := range same {
		if !sibling.archived && sibling.workspace == workspace {
			candidates = append(candidates, sibling)
		}
	}
	if len(candidates) > 1 {
		return false, errText("同名文件夹「" + name + "」存在多条记录，请先整理分类")
	}
	if len(candidates) == 0 && len(same) > 0 {
		return false, errText("文件夹「" + name + "」已归档或不属于当前工作区")
	}
	if len(candidates) == 1 {
		existing := candidates[0]
		storedKeywords := keywords
		if mode == "append" {
			merged, err := mergeRuleWords(existing.keywords, keywords, 200)
			if err != nil {
				return false, err
			}
			storedKeywords = merged
		}
		storedAnatomy := existing.anatomy
		if storedAnatomy == "" {
			storedAnatomy = "[]"
		}
		if hasAnatomy {
			values := anatomy
			if mode == "append" {
				merged, err := mergeRuleWords(existing.anatomy, anatomy, 32)
				if err != nil {
					return false, err
				}
				values = merged
			}
			body, _ := json.Marshal(values)
			storedAnatomy = string(body)
		}
		keywordJSON, _ := json.Marshal(storedKeywords)
		if _, err := tx.ExecContext(ctx, `
			UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, string(keywordJSON), storedAnatomy, existing.id, workspace); err != nil {
			return false, err
		}
		return false, nil
	}
	id, err := newImportedFolderID(ctx, tx, workspace, parentID, name)
	if err != nil {
		return false, err
	}
	anatomyJSON := "[]"
	if hasAnatomy {
		body, _ := json.Marshal(anatomy)
		anatomyJSON = string(body)
	}
	keywordJSON, _ := json.Marshal(keywords)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]',?,?)`, id, workspace, name, parentID, *position, string(keywordJSON), anatomyJSON); err != nil {
		return false, err
	}
	*siblings = append(*siblings, ruleFolder{id: id, name: name, workspace: workspace, parentID: &parentID, position: *position, keywords: string(keywordJSON), anatomy: anatomyJSON})
	*position++
	return true, nil
}

func newImportedFolderID(ctx context.Context, tx *sql.Tx, workspace, parentID, name string) (string, error) {
	kind := ""
	if parentID == "digital_3c" {
		kind = builtinKindByLabel(name)
	}
	if kind == "" {
		return newPromptFolderID()
	}
	id := builtinFolderID(kind)
	existing, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil {
		return "", err
	}
	if existing != nil && (existing.archived || existing.workspace != workspace) {
		return "", errText("内置文件夹「" + name + "」已归档或不属于当前工作区")
	}
	if existing == nil {
		return id, nil
	}
	return newPromptFolderID()
}
