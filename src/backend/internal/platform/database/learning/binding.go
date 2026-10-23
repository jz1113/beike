package learning

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

const BaseRecipeID = "__category_skill__"

// The base supplies product constraints while each original group supplies its own visual style.
func BaseRecipe() map[string]any {
	return map[string]any{"id": BaseRecipeID, "name": "按参考图组应用细分技能", "category": "general", "tag": "自动细分", "libraryVersion": "category-base-v1", "promptSnippet": "商品身份、外形、颜色、结构、标识、比例与材质以当前商品图片为准，不复制参考图中的旧商品，不臆造不可见细节。逐镜沿用原始参考的构图、机位、主体占比、裁切、动作、空间、自然光色与可见纹理；只修改换品必需的握持、佩戴、支撑、接触、遮挡与受光关系。明确替换项按用户选择执行，其他内容沿用原图；静物、手部、人像的出镜范围保持一致。细分规则须按适用条件调用，不将各组不同风格平均为模板。文案只写已知事实，不捏造体验、参数或效果。"}
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
