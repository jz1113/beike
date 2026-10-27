package learning

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

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
