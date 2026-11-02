package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func dedupStrings(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, raw := range items {
		clean := strings.TrimSpace(raw)
		if clean == "" {
			continue
		}
		if _, exists := seen[clean]; exists {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	return out
}

func hairLabelZh(key string) string {
	switch key {
	case "short":
		return "短发"
	case "medium":
		return "中发"
	case "semilong":
		return "中长发"
	case "long":
		return "长发"
	default:
		return "标准发型"
	}
}

func seriesLabelZh(key string) string {
	switch key {
	case "full_std":
		return "标准全身"
	case "full_sexy":
		return "时尚全身"
	case "upper":
		return "上半身"
	case "duo":
		return "双人互动"
	default:
		return "姿态图鉴"
	}
}

func angleCameraZh(angle string) string {
	switch angle {
	case "front":
		return "正面平视机位"
	case "diagonal":
		return "斜侧 45° 机位"
	case "side":
		return "侧面 90° 机位"
	case "high":
		return "俯拍机位"
	case "low":
		return "仰拍机位"
	default:
		return "标准机位"
	}
}

func describeAtlasFace(item atlasFaceItemRaw, customName string) (name, desc, tags string) {
	hair := hairLabelZh(item.Hair)
	sec := "纯底正脸"
	desc = "正面平视纯底人像参考，适合跨镜头锁定角色五官一致性，可一键延展 1+9 全身九宫格"
	if item.Sec == "styling" {
		sec = "造型人像"
		desc = "带发型质感、穿搭风格与整体氛围的人像参考"
	}
	if strings.TrimSpace(item.Style) != "" {
		desc += " · " + strings.TrimSpace(item.Style)
	}
	shortID := item.ID
	if len(shortID) > 6 {
		shortID = shortID[:6]
	}
	name = strings.TrimSpace(customName)
	if name == "" {
		name = fmt.Sprintf("人像图鉴 · %s%s #%s", hair, sec, shortID)
	}
	tags = fmt.Sprintf("人像图鉴,%s,%s", hair, sec)
	return name, desc, tags
}

func localizeAtlasFaceMedia(ctx context.Context, client *http.Client, atlasDir, workspace string, item atlasFaceItemRaw) (string, error) {
	storageRoot := storage.ResolveRoot()
	// 1. 优先检查本地全尺寸原图
	if item.Full != "" {
		if localFull := storage.SafeWithin(atlasDir, item.Full); localFull != "" {
			if info, err := os.Stat(localFull); err == nil && info.Mode().IsRegular() {
				ext := strings.ToLower(filepath.Ext(localFull))
				rel := storage.WorkspaceKey("azhuo/assets/atlas/faces/"+item.ID+ext, workspace)
				dest := storage.SafeWithin(storageRoot, rel)
				if dest != "" && copyFileAtomic(localFull, dest) == nil {
					return "/storage/" + rel, nil
				}
			}
		}
	}
	// 2. 在线按需拉取全尺寸 PNG
	if item.FullRemote != "" {
		rel := storage.WorkspaceKey("azhuo/assets/atlas/faces/"+item.ID+".png", workspace)
		dest := storage.SafeWithin(storageRoot, rel)
		if dest != "" && tryDownloadRemotePortrait(ctx, client, item.FullRemote, dest) {
			return "/storage/" + rel, nil
		}
	}
	// 3. 离线兜底复制本机高清 WebP 缩略图
	localThumb := storage.SafeWithin(atlasDir, item.Thumb)
	if localThumb == "" {
		return "", fmt.Errorf("人像 %s 缺少本地图鉴文件", item.ID)
	}
	ext := strings.ToLower(filepath.Ext(localThumb))
	if ext == "" {
		ext = ".webp"
	}
	rel := storage.WorkspaceKey("azhuo/assets/atlas/faces/"+item.ID+ext, workspace)
	dest := storage.SafeWithin(storageRoot, rel)
	if dest == "" || copyFileAtomic(localThumb, dest) != nil {
		return "", fmt.Errorf("写入人像文件 %s 失败", item.ID)
	}
	return "/storage/" + rel, nil
}

func importAtlasPoses(ctx context.Context, db *sql.DB, atlasDir, workspace, now string, ids []string, body atlasImportRequest) ([]string, int, int, error) {
	posesFile, err := loadAtlasPosesFile(atlasDir)
	if err != nil {
		return nil, 0, 0, errors.New("本机尚未同步姿态图鉴，请先执行 pnpm setup:atlas")
	}
	byID := make(map[string]atlasPoseItemRaw, len(posesFile.Poses))
	for _, p := range posesFile.Poses {
		byID[p.ID] = p
	}
	storageRoot := storage.ResolveRoot()
	angleOrder := []string{"front", "diagonal", "side", "high", "low"}
	importedIDs := make([]string, 0, len(ids))
	imported, skipped := 0, 0

	for _, rawID := range ids {
		pose, ok := byID[rawID]
		if !ok {
			return nil, 0, 0, fmt.Errorf("未找到姿态编号 %s", rawID)
		}
		actionID := atlasDeterministicID(workspace, "atlas-pose", pose.ID)
		var existing string
		if db.QueryRowContext(ctx, `SELECT "id" FROM "ActionAsset" WHERE "workspaceId"=? AND "id"=?`, workspace, actionID).Scan(&existing) == nil && existing != "" {
			skipped++
			importedIDs = append(importedIDs, actionID)
			continue
		}
		actionViews := map[string]string{}
		for _, v := range pose.Variants {
			src := storage.SafeWithin(atlasDir, v.Full)
			if src == "" {
				src = storage.SafeWithin(atlasDir, v.Thumb)
			} else if info, statErr := os.Stat(src); statErr != nil || !info.Mode().IsRegular() {
				src = storage.SafeWithin(atlasDir, v.Thumb)
			}
			if src == "" {
				continue
			}
			ext := strings.ToLower(filepath.Ext(src))
			if ext == "" {
				ext = ".png"
			}
			rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/assets/atlas/poses/%s_%s%s", pose.ID, v.Angle, ext), workspace)
			dest := storage.SafeWithin(storageRoot, rel)
			if dest != "" && copyFileAtomic(src, dest) == nil {
				actionViews[v.Angle] = "/storage/" + rel
			}
		}
		if len(actionViews) == 0 {
			return nil, 0, 0, fmt.Errorf("姿态 %s 缺少可用视角图像", pose.ID)
		}
		sources := make([]string, 0, len(actionViews))
		for _, ang := range angleOrder {
			if u, has := actionViews[ang]; has {
				sources = append(sources, u)
			}
		}
		for _, u := range actionViews {
			found := false
			for _, s := range sources {
				if s == u {
					found = true
					break
				}
			}
			if !found {
				sources = append(sources, u)
			}
		}
		chosenAngle := strings.TrimSpace(body.PreferredAngle)
		if _, has := actionViews[chosenAngle]; !has {
			if _, hasFront := actionViews["front"]; hasFront {
				chosenAngle = "front"
			} else {
				for k := range actionViews {
					chosenAngle = k
					break
				}
			}
		}
		primaryURL := actionViews[chosenAngle]
		catID := ensureAtlasCategory(ctx, db, workspace, pose.Category, now)
		catIDs := []string{}
		if catID != "" {
			catIDs = []string{catID}
		}
		catJSON, _ := json.Marshal(catIDs)
		sourcesJSON, _ := json.Marshal(sources)
		dimsJSON, _ := json.Marshal(map[string]any{
			"atlasId": pose.ID, "series": pose.Series, "category": pose.Category,
			"defaultAngle": chosenAngle, "actionViews": actionViews,
		})
		title := strings.TrimSpace(body.CustomNames[pose.ID])
		if title == "" {
			title = fmt.Sprintf("%s · %s", seriesLabelZh(pose.Series), pose.Names.Zh)
		}
		actionDesc := fmt.Sprintf("%s（%s，含 %d 个机位视角姿态参考）", pose.Names.Zh, pose.Category, len(sources))
		shotType := "full_body"
		if pose.Series == "upper" {
			shotType = "half_body"
		}
		tags := fmt.Sprintf("姿态图鉴,%s,%s,%s", seriesLabelZh(pose.Series), pose.Category, pose.No)

		_, execErr := db.ExecContext(ctx, `
			INSERT INTO "ActionAsset" (
				"id", "workspaceId", "title", "action", "shotType", "spatialType", "camera",
				"suitableAnatomy", "tags", "coverUrl", "sourceImages", "dimensions", "provenance",
				"sceneId", "shotOrder", "usageCount", "isFavorite", "createdAt", "updatedAt",
				"productCategoryIds", "isUniversal", "mediaType", "mediaUrl", "sourceUrl"
			) VALUES (?, ?, ?, ?, ?, 'general', ?, '["all"]', ?, ?, ?, ?, 'manual', NULL, 0, 0, 0, ?, ?, ?, 0, 'image', ?, '')`,
			actionID, workspace, title, actionDesc, shotType, angleCameraZh(chosenAngle),
			tags, primaryURL, string(sourcesJSON), string(dimsJSON), now, now, string(catJSON), primaryURL)
		if execErr != nil {
			return nil, 0, 0, errors.New("保存姿态动作资产失败，请重试")
		}
		ensureAtlasRegistry(ctx, db, workspace, "action", actionID, now)
		imported++
		importedIDs = append(importedIDs, actionID)
	}
	return importedIDs, imported, skipped, nil
}
