package learning

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

var ErrScope = errors.New("请选择当前工作区可见、未归档的商品细分文件夹")

func ReadFolder(ctx context.Context, db *sql.DB, workspace, id string) (Folder, error) {
	org, err := dblibrary.ListAssetOrganization(ctx, db, workspace)
	if err != nil {
		return Folder{}, err
	}
	var child *dblibrary.OrganizationCategory
	for i := range org.Categories {
		if org.Categories[i].ID == id {
			child = &org.Categories[i]
			break
		}
	}
	majorID := ""
	if child != nil {
		if child.IsArchived || child.ParentID == nil || !strings.HasPrefix(id, database.PromptSubcategoryPrefix) {
			return Folder{}, ErrScope
		}
		majorID = *child.ParentID
	} else {
		for _, sub := range []string{"phone", "case", "earphone", "tablet"} {
			if id == database.BuiltinFolderID(sub) {
				majorID = "digital_3c"
			}
		}
		if majorID == "" {
			return Folder{}, ErrScope
		}
	}
	for _, major := range org.Categories {
		if major.ID == majorID && major.ParentID == nil && !major.IsArchived {
			name := ""
			if child != nil {
				name = child.Name
			} else {
				name = map[string]string{"phone": "手机本体", "case": "手机壳", "earphone": "耳机", "tablet": "平板"}[strings.TrimPrefix(id, database.PromptSubcategoryPrefix+"digital_3c:")]
			}
			return Folder{ID: id, Name: name, MajorID: major.ID, MajorName: major.Name}, nil
		}
	}
	return Folder{}, ErrScope
}

func GroupFolder(group map[string]any) string {
	sub, _ := group["productSubcategory"].(string)
	if database.BuiltinSubcategory(sub) {
		return database.BuiltinFolderID(sub)
	}
	if strings.HasPrefix(sub, database.PromptSubcategoryPrefix) {
		return sub
	}
	return ""
}
