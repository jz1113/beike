package database

import (
	"context"
	"database/sql"
	"fmt"
)

type SeedPurge struct {
	Scenes, Outfits, Actions, Personas int
}

func (result SeedPurge) Total() int {
	return result.Scenes + result.Outfits + result.Actions + result.Personas
}

var seedSceneTitles = []string{
	"苏式园林月亮门雕花木窗棂", "雅致新中式茶空间实木茶台", "现代都会高层落地采光大窗边",
	"阳光轻食餐厅靠窗白色大理石小圆桌", "阳光街区林荫树下木质长椅", "私享车内副驾驶座真皮座椅天光",
	"海滨落日余晖观景木栈道露台", "晨光洒满的舒适起居室米白布艺沙发角", "原木风极简办公工位与随身咖啡",
	"法式小酒馆露天座遮阳棚咖啡位", "浪漫海岛细软白沙滩与清澈浪花边", "现代极简艺术工作室高挑采光天窗下",
}

var seedOutfitTitles = []string{
	"素雅奶白真丝盘扣开衫配改良马面裙", "浅燕麦灰修身小西装配垂感阔腿裤", "法式软糯奶黄色针织开衫配复古微喇牛仔裤",
	"深炭灰高领羊绒衫配冷白西装裤", "浪漫度假纯白亚麻法式方领小方领长裙", "清爽法式水蓝细条纹男友风宽松衬衫",
	"经典极简赫本风方领小黑裙", "复古水洗浅蓝丹宁牛仔衬衫配白色直筒裤",
}

var seedActionTitles = []string{
	"45度侧颜发髻微风半身抓拍", "侧后方45度回眸发髻流苏抓拍", "发髻与首饰超清微距大特写",
	"双耳耳垂贴耳小巧耳饰超清特写", "正面平视双手轻托腮甜笑互动自拍肖像", "手部自然平放台面手镯超清微距",
	"颈间正中项链正面平视展示", "生活氛围感半身随拍交互",
}

var seedPersonaNames = []string{
	"小红书顶流清纯温润神颜博主", "东方古典温婉端庄名媛博主", "都会极简时髦职场女性", "阳光干净自然东亚青年男生",
}

var workspaceClearTables = []string{
	"AssistantTurnItem", "AssistantTurn", "AssistantThread", "ImageTask", "PromptRecord", "Product",
	"StyleRecipe", "ActionAsset", "SceneAsset", "OutfitAsset", "PersonaAsset", "FullPromptAsset",
	"PromptImportSource", "DeconstructReview", "WorkshopBatchState", "WorkshopBatch", "WorkshopWorkspace", "PromptAlbum",
}

func PurgeSeedAssets(ctx context.Context, db *sql.DB, workspace string) (SeedPurge, error) {
	var result SeedPurge
	var err error
	result.Scenes, err = purgeSeedRows(ctx, db, workspace, "SceneAsset", "title", "coverUrl", seedSceneTitles)
	if err != nil {
		return SeedPurge{}, err
	}
	result.Outfits, err = purgeSeedRows(ctx, db, workspace, "OutfitAsset", "title", "coverUrl", seedOutfitTitles)
	if err != nil {
		return SeedPurge{}, err
	}
	result.Actions, err = purgeSeedRows(ctx, db, workspace, "ActionAsset", "title", "coverUrl", seedActionTitles)
	if err != nil {
		return SeedPurge{}, err
	}
	result.Personas, err = purgeSeedRows(ctx, db, workspace, "PersonaAsset", "name", "avatarUrl", seedPersonaNames)
	return result, err
}

func purgeSeedRows(ctx context.Context, db *sql.DB, workspace, table, nameColumn, mediaColumn string, names []string) (int, error) {
	query := fmt.Sprintf(`
		DELETE FROM "%s"
		WHERE "workspaceId" = ? AND "%s" IN (%s) AND "provenance" = 'manual'
			AND "reversePrompt" IS NULL AND "%s" IS NULL`,
		table, nameColumn, questionMarks(len(names)), mediaColumn)
	args := make([]any, 0, len(names)+1)
	args = append(args, workspace)
	for _, name := range names {
		args = append(args, name)
	}
	result, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	count, err := result.RowsAffected()
	return int(count), err
}

func ClearLibraryType(ctx context.Context, db *sql.DB, workspace, target string) (int, error) {
	deleted := 0
	for _, item := range []struct{ target, table string }{
		{"scene", "SceneAsset"}, {"outfit", "OutfitAsset"}, {"action", "ActionAsset"}, {"persona", "PersonaAsset"},
	} {
		if target != item.target && target != "all" {
			continue
		}
		count, err := deleteWorkspaceRows(ctx, db, workspace, item.table)
		if err != nil {
			return 0, err
		}
		deleted += count
	}
	if target == "full_prompt" || target == "all" {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return 0, err
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := deleteWorkspaceRows(ctx, tx, workspace, "FullPromptImageReplacement"); err != nil {
			return 0, err
		}
		count, err := deleteWorkspaceRows(ctx, tx, workspace, "FullPromptAsset")
		if err != nil {
			return 0, err
		}
		if err := tx.Commit(); err != nil {
			return 0, err
		}
		deleted += count
	}
	return deleted, nil
}

func ClearLocalWorkspace(ctx context.Context, db *sql.DB, workspace string) (int, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	deleted, err := deleteWorkspaceRows(ctx, tx, workspace, "FullPromptImageReplacement")
	if err != nil {
		return 0, err
	}
	for _, table := range workspaceClearTables {
		count, err := deleteWorkspaceRows(ctx, tx, workspace, table)
		if err != nil {
			return 0, err
		}
		deleted += count
	}
	categories, err := deleteWorkspaceCategories(ctx, tx, workspace)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return deleted + categories, nil
}

func deleteWorkspaceRows(ctx context.Context, tx execContext, workspace, table string) (int, error) {
	result, err := tx.ExecContext(ctx, `DELETE FROM "`+table+`" WHERE "workspaceId" = ?`, workspace)
	if err != nil {
		return 0, err
	}
	count, err := result.RowsAffected()
	return int(count), err
}

type execContext interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func deleteWorkspaceCategories(ctx context.Context, tx *sql.Tx, workspace string) (int, error) {
	deleted := 0
	for {
		rows, err := tx.QueryContext(ctx, `
			SELECT "id" FROM "AssetProductCategory" AS category
			WHERE "workspaceId" = ? AND NOT EXISTS (
				SELECT 1 FROM "AssetProductCategory" AS child
				WHERE child."parentId" = category."id" AND child."workspaceId" IN (?, ?)
			)`, workspace, workspace, officialWorkspace)
		if err != nil {
			return 0, err
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return 0, err
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return 0, err
		}
		rows.Close()
		if len(ids) == 0 {
			return deleted, nil
		}
		result, err := tx.ExecContext(ctx, `
			DELETE FROM "AssetProductCategory" WHERE "workspaceId" = ? AND "id" IN (`+questionMarks(len(ids))+`)`,
			append([]any{workspace}, stringsToArgs(ids)...)...)
		if err != nil {
			return 0, err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		if count == 0 {
			return 0, LibraryFailure{Message: "分类清理未取得进展，已取消本次清理"}
		}
		deleted += int(count)
	}
}

func stringsToArgs(values []string) []any {
	args := make([]any, len(values))
	for index, value := range values {
		args[index] = value
	}
	return args
}
