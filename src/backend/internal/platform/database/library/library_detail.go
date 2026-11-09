package library

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
)

var ErrLibraryDetailMissing = errors.New("library detail missing")

func LibraryDetail(ctx context.Context, db *sql.DB, workspace, assetType, id string) (json.RawMessage, error) {
	table, columns, ok := libraryAssetTable(assetType)
	if !ok {
		return nil, ErrLibraryDetailMissing
	}
	item, err := loadSharedLibraryItem(ctx, db, table, columns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	registry, status, err := libraryRegistry(ctx, db, workspace, assetType, id)
	if err != nil {
		registry, status = nil, ""
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	eligible, reason := libraryProduction(assetType, fields, status)
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason)
	return extendJSON(item, extra)
}

func libraryRegistry(ctx context.Context, db *sql.DB, workspace, assetType, id string) (json.RawMessage, string, error) {
	var row libraryRegistryRecord
	err := db.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		FROM "PromptAssetRegistry"
		WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ?`,
		workspace, assetType, id).Scan(
		&row.id, &row.workspace, &row.assetType, &row.sourceID, &row.status, &row.version, &row.provenance,
		&row.sourceRef, &row.quality, &row.confidence, &row.publishedAt, &row.disabledReason, &row.createdAt, &row.updatedAt)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	body, err := orderedJSON([]any{
		"id", row.id, "workspaceId", row.workspace, "assetType", row.assetType, "sourceAssetId", row.sourceID,
		"status", row.status, "version", row.version, "provenance", row.provenance,
		"sourceRef", libraryNullText(row.sourceRef), "qualityScore", nullFloat(row.quality), "confidence", nullFloat(row.confidence),
		"publishedAt", libraryNullText(row.publishedAt), "disabledReason", libraryNullText(row.disabledReason),
		"createdAt", row.createdAt, "updatedAt", row.updatedAt,
	})
	return body, row.status, err
}

type libraryRegistryRecord struct {
	id, workspace, assetType, sourceID, status, provenance, createdAt, updatedAt string
	version                                                                      int64
	sourceRef, publishedAt, disabledReason                                       sql.NullString
	quality, confidence                                                          sql.NullFloat64
}

func libraryNullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func nullFloat(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func extendJSON(item json.RawMessage, extra []any) (json.RawMessage, error) {
	body := bytes.TrimSuffix(bytes.TrimRight(item, "\n"), []byte("}"))
	var buf bytes.Buffer
	buf.Write(body)
	for i := 0; i < len(extra); i += 2 {
		buf.WriteByte(',')
		key, err := json.Marshal(extra[i])
		if err != nil {
			return nil, err
		}
		var value bytes.Buffer
		encoder := json.NewEncoder(&value)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(extra[i+1]); err != nil {
			return nil, err
		}
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(bytes.TrimRight(value.Bytes(), "\n"))
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func libraryProduction(assetType string, fields map[string]any, registryStatus string) (bool, any) {
	issue := visualLibraryIssue(assetType, fields)
	eligible := !placeholderLibraryIdentity(assetType, fields) && issue == ""
	if issue != "" {
		return eligible, issue
	}
	if reason := libraryBlockReason(assetType, fields, registryStatus); reason != "" {
		return eligible, reason
	}
	return eligible, nil
}

func placeholderLibraryIdentity(assetType string, fields map[string]any) bool {
	if assetType != "persona" && assetType != "outfit" {
		return false
	}
	identity := strings.TrimSpace(firstLibraryText(fields, "name", "title"))
	if identity != "" {
		return placeholderIdentityPattern.MatchString(identity)
	}
	description := strings.TrimSpace(firstLibraryText(fields, "description", "reversePrompt"))
	return description == "" || placeholderIdentityPattern.MatchString(description)
}

func visualLibraryIssue(assetType string, fields map[string]any) string {
	if assetType != "persona" && assetType != "outfit" {
		return ""
	}
	title := strings.TrimSpace(firstLibraryText(fields, "title", "name"))
	if assetType == "outfit" {
		if outfitFragmentPattern.MatchString(title) && !outfitWholePattern.MatchString(title) {
			return "仅有衣物局部，不能作为可复用穿搭；请重新拆解或修正分类"
		}
		if libraryText(fields["top"]) != "" || libraryText(fields["bottom"]) != "" {
			if !reusableOutfit(fields) {
				return "未识别到清晰的服装款式，请核对原图后修正"
			}
		}
	}
	if assetType == "persona" && personaFacePattern.MatchString(title) {
		return "没有可辨识的人物面部，不能作为人物资产"
	}
	return ""
}

func libraryBlockReason(assetType string, fields map[string]any, registryStatus string) string {
	if placeholderLibraryIdentity(assetType, fields) {
		return "占位记录，不是可用的人物或穿搭资产"
	}
	if issue := visualLibraryIssue(assetType, fields); issue != "" {
		return issue
	}
	provenance := libraryText(fields["provenance"])
	if provenance == "reference_import" || provenance == "legacy_single" {
		return "参考素材尚未转为生产资产"
	}
	status := registryStatus
	if status == "" {
		status = "published"
	}
	if status != "published" {
		return "资产尚未发布或已停用"
	}
	if assetType == "full_prompt" && !completePromptGroup(fields) {
		return "母本缺少完整的四图分镜"
	}
	return ""
}

func reusableOutfit(fields map[string]any) bool {
	for _, key := range []string{"top", "bottom"} {
		text := strings.TrimSpace(libraryText(fields[key]))
		if text == "" || unknownDetailPattern.MatchString(text) || unknownWordPattern.MatchString(text) {
			continue
		}
		if garmentPattern.MatchString(text) && !outfitFragmentPattern.MatchString(text) {
			return true
		}
	}
	return false
}

func firstLibraryText(fields map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := libraryText(fields[key]); text != "" {
			return text
		}
	}
	return ""
}

func libraryText(value any) string {
	text, _ := value.(string)
	return text
}

var (
	placeholderIdentityPattern = regexp.MustCompile(`^(?:不适用|无法确认|信息不足|未知|未识别|无人物|无人物穿搭|无人(?:像|物|出镜)?(?:穿搭)?|无模特|纯商品|纯静物|无穿搭|无服装)(?:[（(：:，,。\s].*)?$`)
	unknownDetailPattern       = regexp.MustCompile(`无法确认|无法辨认|无法判断|信息不足|不可见|未入(?:画|镜)|未见|看不清|不适用|无人物|无服装|未知`)
	unknownWordPattern         = regexp.MustCompile(`(?i)^(?:无|没有|不明|不详|none|null|unknown)$`)
	garmentPattern             = regexp.MustCompile(`衬衫|T恤|恤衫|上衣|卫衣|毛衣|针织衫|外套|开衫|夹克|西装|大衣|风衣|背心|吊带|连衣裙|半身裙|长裙|短裙|长裤|短裤|牛仔裤|套装|旗袍|礼服`)
	outfitFragmentPattern      = regexp.MustCompile(`局部|仅见|只见|只露|仅露|袖口|衣角|领口|衣袖`)
	outfitWholePattern         = regexp.MustCompile(`套装|连衣裙`)
	personaFacePattern         = regexp.MustCompile(`无人物|无人像|仅.*(?:手部|手指|手臂)|不露脸`)
)

func LibrarySceneDetail(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, error) {
	item, err := loadSharedLibraryItem(ctx, db, "SceneAsset", sceneAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	actions, err := listSceneActions(ctx, db, workspace, id, 0)
	if err != nil {
		return nil, err
	}
	shots := sceneDetailShots(id, item, actions)
	registry, status, err := libraryRegistry(ctx, db, workspace, "scene", id)
	if err != nil {
		registry, status = nil, ""
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	eligible, reason := libraryProduction("scene", fields, status)
	extra := []any{"actions", actions}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "shots", shots, "shotCount", len(shots))
	return extendJSON(item, extra)
}

func listSceneActions(ctx context.Context, db *sql.DB, workspace, sceneID string, limit int) ([]json.RawMessage, error) {
	names := make([]string, len(actionAssetColumns))
	for i, column := range actionAssetColumns {
		names[i] = `"` + column.name + `"`
	}
	query := `
		SELECT ` + strings.Join(names, ", ") + ` FROM "ActionAsset"
		WHERE "sceneId" = ? AND "workspaceId" IN (?, ?)
		ORDER BY "shotOrder" ASC, "createdAt" ASC`
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}
	rows, err := db.QueryContext(ctx, query, sceneID, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		holders := make([]any, len(actionAssetColumns))
		for i, column := range actionAssetColumns {
			switch column.kind {
			case colInt, colNullInt, colBool:
				holders[i] = new(sql.NullInt64)
			default:
				holders[i] = new(sql.NullString)
			}
		}
		if err := rows.Scan(holders...); err != nil {
			return nil, err
		}
		fields := make([]any, 0, len(actionAssetColumns)*2)
		for i, column := range actionAssetColumns {
			fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
		}
		item, err := orderedJSON(fields)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func sceneDetailShots(sceneID string, scene json.RawMessage, actions []json.RawMessage) []json.RawMessage {
	if len(actions) == 0 {
		var fields map[string]any
		_ = json.Unmarshal(scene, &fields)
		title, _ := fields["title"].(string)
		description, _ := fields["description"].(string)
		templates := harmonizedSceneShots(sceneID, title, description)
		shots := make([]json.RawMessage, 0, len(templates))
		for i, template := range templates {
			body, _ := orderedJSON([]any{
				"id", "harmonized-" + sceneID + "-" + strconv.Itoa(i+1),
				"title", template.title, "action", template.action, "camera", template.camera,
				"angle", template.angle, "shotType", template.shotType, "shotOrder", i + 1,
				"provenance", "harmonized", "sceneId", sceneID,
			})
			shots = append(shots, body)
		}
		return shots
	}
	type linked struct {
		raw      json.RawMessage
		id       string
		title    string
		action   string
		shotType string
		camera   any
		sceneID  any
		order    int64
		source   string
	}
	linkedActions := make([]linked, 0, len(actions))
	for _, raw := range actions {
		var fields map[string]any
		_ = json.Unmarshal(raw, &fields)
		item := linked{raw: raw, camera: fields["camera"], sceneID: fields["sceneId"]}
		item.id, _ = fields["id"].(string)
		item.title, _ = fields["title"].(string)
		item.action, _ = fields["action"].(string)
		item.shotType, _ = fields["shotType"].(string)
		item.source, _ = fields["provenance"].(string)
		if item.source == "" {
			item.source = "manual"
		}
		if number, ok := fields["shotOrder"].(float64); ok {
			item.order = int64(number)
		}
		linkedActions = append(linkedActions, item)
	}
	sort.SliceStable(linkedActions, func(i, j int) bool {
		if linkedActions[i].order != linkedActions[j].order {
			return linkedActions[i].order < linkedActions[j].order
		}
		return linkedActions[i].title < linkedActions[j].title
	})
	if len(linkedActions) > 4 {
		linkedActions = linkedActions[:4]
	}
	shots := make([]json.RawMessage, 0, len(linkedActions))
	for i, item := range linkedActions {
		order := i + 1
		if item.order > 0 {
			order = int(item.order)
		}
		body, _ := orderedJSON([]any{
			"id", item.id, "title", item.title, "action", item.action, "camera", item.camera,
			"angle", item.title, "shotType", item.shotType, "shotOrder", order,
			"provenance", item.source, "sceneId", item.sceneID,
		})
		shots = append(shots, body)
	}
	return shots
}

var scenePromptRules = []struct {
	pattern *regexp.Regexp
	replace string
}{
	{regexp.MustCompile(`(?:一张)?(?:真实|高清|唯美)?(?:摄影|人像|商业|胶片|胶卷)?(?:照片|大片|特写|画面)[，,\s]*`), ""},
	{regexp.MustCompile(`(?:一位|一个)?(?:年轻|成熟)?(?:东方|中国|亚洲|金发|金橙色|橙金|橙发|橙卷发|黑发|黑长直|棕发|浅金短发|卷发|短发)?(?:女性|女子|女生|模特|女郎|行人|博主|人物|名媛)`), ""},
	{regexp.MustCompile(`(?:她|他)?(?:留着|蓄着|顶着|剪着|有着)?[^，。；;\n]*(?:卷发|直发|短发|长发|发型|马尾|发夹|头饰|发饰|海星发夹|发带)[，。；;\s]*`), ""},
	{regexp.MustCompile(`(?:双手|单手)?(?:前伸|举至|微举|下垂|放于|搭在|托腮|托下巴|比出|比心|遮阳|掩面|掩嘴|侧立|前倾|盘腿|站立|行走|漫步|奔跑|跳跃|跃起|大笑|露齿甜笑|微笑|欢笑|微表情|神情|眼神|回眸|侧颜)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:身着|身穿|穿着|穿搭|搭配|穿|内搭|外搭|套着|裹着|下穿|下着|系有|系着|系|单肩挂|挂有|肩挎|手提|手拿|手握|背着|挎着|拿着|佩戴|戴有|戴着|脚穿|脚蹬|穿鞋)?[^，。；;\n]*?(?:开衫|衬衫|短裙|长裙|半身裙|连衣裙|百褶裙|蓬蓬裙|马面裙|白裙|黑裙|红裙|吊带裙|蕾丝裙|蕾丝白裙|牛仔裤|长裤|短裤|西裤|休闲裤|夹克|大衣|风衣|西装|T恤|卫衣|外套|针织衫|毛衣|马甲|吊带|上衣|下装|服饰|运动鞋|球鞋|板鞋|高跟鞋|皮鞋|靴子|乐福鞋|凉鞋|镂空凉鞋|拖鞋|围巾|轻纱围巾|薄纱围巾|薄荷绿围巾|淡绿围巾|浅绿围巾|绿色围巾|丝巾|披肩|堆堆袜|袜子|手袋|皮包|小包|背包|手提包|单肩包|斜挎包|草帽|遮阳帽|帽子|贝雷帽|手链|手串|手镯|手圈|戒指|项链|锁骨链|吊坠|耳环|耳饰|耳钉|发饰|发簪|发带|头巾|海星发夹)`), ""},
	{regexp.MustCompile(`(?:^|[，。；;\s])(?:裙|衫|裤|鞋|袜|帽|包|链|饰|装|上衣|下装)[，、。；;\s]*`), " "},
	{regexp.MustCompile(`(?:身着|身穿|穿着|穿搭|搭配|服饰|服装)[：:\s]*[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:手腕露|露腕|微挽衣袖|锁骨线条清晰|身材修长|体态优雅)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:呈现)?(?:原生相机直出质感与)?(?:真实)?(?:皮肤次表面散射|次表面散射皮肤|次表面散射|真实皮肤毛孔|微观皮肤肌理|细微毛孔与微小瑕疵|真实皮肤毛孔与微小瑕疵|微透光血色|皮肤纹理|面部细微毛孔|保留毛孔呼吸感|皮肤质感|白皙透光肤质|红润气色)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`[0-9]+mm\s*(?:f\/[0-9.]+)?\s*(?:商业)?\s*(?:35mm\s*RAW)?\s*(?:真实街景全景构图|全景构图)[。，]*`), "真实自然空间透视构图。"},
	{regexp.MustCompile(`(?:85mm|100mm|50mm)?\s*(?:人像特写|人像镜头|特写人像|专业人像|人像摄影|微距视角|特写摄影|人像微距)[^，。；;\n]*`), "真实生活空间环境"},
	{regexp.MustCompile(`(?:大光圈|超浅景深|浅景深|焦外|背景)?\s*(?:高斯散景|奶油般散景|光斑虚化|大面积虚化|柔和虚化|虚化模糊|虚化背景|背景为虚化|虚化)[^，。；;\n]*`), "真实建筑硬装与空间自然透视，真实物理材质微瑕肌理"},
	{regexp.MustCompile(`(?:端坐在|坐在|站立在|奔跑在|漫步在|行走在|倚靠在|停留于|穿梭于|伫立在|迎面走来|走来|走向)`), ""},
	{regexp.MustCompile(`背景(?:是|为|可见|包含|处有)?\s*`), ""},
	{regexp.MustCompile(`边缘光自然自然`), "边缘光自然通透"},
	{regexp.MustCompile(`[，、\s]+([。；;])`), "$1"},
	{regexp.MustCompile(`^[，、；;\s。]+`), ""},
	{regexp.MustCompile(`[，、；;\s]+$`), ""},
	{regexp.MustCompile(`，\s*，+`), "，"},
	{regexp.MustCompile(`、\s*、+`), "、"},
	{regexp.MustCompile(`；\s*；+`), "；"},
	{regexp.MustCompile(`。\s*。+`), "。"},
}

var sceneMotionPattern = regexp.MustCompile(`(?:在)?(?:树影斑驳|绿意盎然|阳光洒满|静谧|开阔)?(?:的)?(?:草坪|石阶|街道|木栈道|茶园|回廊|室内|窗前)?(?:上|前|畔|中|里)?(?:迎面走来|迎面走向|缓缓走来|走来|走向|走去|踱步|转身|回头|凝望|注视|端坐|盘坐|站立|侧立|侧身|托腮|抚发|遮阳|比心|微笑|露齿笑|露齿甜笑|大笑|奔跑|漫步|跳跃|伫立|倚靠|前倾)[^，。；;\n]*`)
var sceneMotionPlace = regexp.MustCompile(`(?:树影斑驳|绿意盎然|阳光洒满|静谧|开阔)?(?:的)?(?:草坪|石阶|街道|木栈道|茶园|回廊|室内|窗前)`)

func sanitizeScenePrompt(raw string) string {
	if raw == "" {
		return ""
	}
	text := raw
	for index, rule := range scenePromptRules {
		if index == 3 {
			text = sceneMotionPattern.ReplaceAllStringFunc(text, func(match string) string {
				if place := sceneMotionPlace.FindString(match); place != "" {
					return place
				}
				return ""
			})
		}
		text = rule.pattern.ReplaceAllString(text, rule.replace)
	}
	text = strings.TrimSpace(text)
	if len([]rune(text)) == 0 {
		return "真实生活美学置景空间，建筑硬装与植物环境质感扎实细腻，自然漫反射采光与扎实物理接触阴影，真实空间透视。"
	}
	return text
}

type sceneShotTemplate struct {
	title, action, camera, angle, shotType string
}

func harmonizedSceneShots(sceneID, title, description string) []sceneShotTemplate {
	sceneText := strings.TrimSpace(title + "，" + description)
	anatomy := jewelryAnatomy(sceneText)
	base := sceneText
	if base == "" || base == "真实买家秀生活场景" || base == "真实生活场景" {
		base = "通透干净的高颜值生活美学空间，自然采光"
	}
	if carPattern.MatchString(strings.ToLower(sceneText)) {
		return carSceneShots(base, anatomy)
	}
	return livedSceneShots(base, anatomy)
}

func jewelryAnatomy(text string) string {
	lower := strings.ToLower(text)
	switch {
	case anatomyHairpin.MatchString(lower):
		return "hairpin"
	case anatomyEarring.MatchString(lower):
		return "earring"
	case anatomyNecklace.MatchString(lower):
		return "necklace"
	case anatomyBracelet.MatchString(lower):
		return "bracelet"
	case anatomyRing.MatchString(lower):
		return "ring"
	case anatomyBrooch.MatchString(lower):
		return "brooch"
	case anatomyBag.MatchString(lower):
		return "bag"
	case anatomyShoes.MatchString(lower):
		return "shoes"
	case anatomyEyewear.MatchString(lower):
		return "eyewear"
	case anatomyHat.MatchString(lower):
		return "hat"
	case anatomyScarf.MatchString(lower):
		return "scarf"
	case anatomyApparel.MatchString(lower):
		return "apparel"
	case anatomyPlaced.MatchString(lower):
		return "placed"
	case anatomyHeld.MatchString(lower):
		return "held"
	default:
		return "general_acc"
	}
}

func carSceneShots(base, anatomy string) []sceneShotTemplate {
	action1 := "单手自然轻搭在随身手袋或车内扶手，手腕饰品随性入镜，神态松弛自然"
	action2 := "单手手腕自然轻搭在安全带或包袋拉链上，手机贴近特写拍摄，首饰细节清晰锐利"
	angle2 := "手腕/手指佩戴细节特写（真实手部与皮肤纹理）"
	action3 := "双手整理随身手袋或手账本，手部饰品随性自然入镜"
	action4 := "手轻搭在安全带或随身包袋望向窗外，手腕饰品在柔和自然光下若隐若现"
	switch anatomy {
	case "earring":
		action1 = "副驾侧头看窗外天光，微风吹拂发丝，自然展露耳垂佩戴的小巧 @图片1 耳饰，手腕光洁"
		action2 = "微侧头，发丝挽于耳后，手机贴近对焦耳垂上的 @图片1 所示小巧耳饰，大光圈浅景深（严禁手腕手镯）"
		angle2 = "耳际局部微距特写（对焦耳垂小巧耳饰）"
		action3 = "单手轻抚侧脸发丝，自然展露耳际小巧耳钉与灵动侧颜，手腕无额外饰品"
	case "necklace":
		action1 = "微侧身面朝车窗自然天光，正面45°平视捕捉端庄领口与颈间项链，神态松弛真实"
		action2 = "半身近景清晰对焦颈间项链吊坠，清晰锁定金属光泽与细节，背景自然柔和虚化"
		angle2 = "颈间半身特写（正面平视）"
		action3 = "双手整理大衣或外套领口，自然展露颈间锁骨链，神态轻松舒适"
		action4 = "侧头望向窗外，微风吹拂发丝，光影勾勒出侧颜与胸前项链微光"
	}
	if anatomy == "earring" {
		action4 = "侧头望向窗外，微风吹拂耳际碎发，光影勾勒出侧颜与耳垂小巧耳饰微光（手腕光洁无手镯）"
	}
	return []sceneShotTemplate{
		{"车内随行抓拍", action1, "iPhone 35mm 生活抓拍视角", "副驾平视中近景（45° 侧颜自然抓拍）", "medium_shot"},
		{"车内佩戴细节特写", action2, "iPhone 85mm 细节特写镜头", angle2, "detail_shot"},
		{"车内生活互动随拍", action3, "iPhone 50mm 标准生活镜头", "中景生活互动抓拍", "medium_shot"},
		{"车内侧颜与饰品光影特写", action4, "iPhone 50mm 侧颜光影特写", "侧面45°生活抓拍特写", "close_up"},
	}
}

func livedSceneShots(base, anatomy string) []sceneShotTemplate {
	shot1Title := "正面高颜值半身自拍肖像"
	shot1Angle := "正面半身/胸部以上自拍肖像"
	shot1Action := "在场景中随性走动或漫步回眸，双手自然轻搭身前，展露佩戴首饰与整体时髦私服"
	shot2Title := "45°侧颜微风光影抓拍"
	shot2Angle := "45° 侧颜半身抓拍"
	shot2Action := "在场景中舒适倚靠或看风景，微风吹拂发丝，神态松弛自然"
	shot3Title := "佩戴部位超清微距特写"
	shot3Action := "大光圈浅景深超清对焦佩戴的 @图片1 细节，背景自然柔和虚化"
	shot3Angle := "局部超清微距大特写"
	shot4Action := "侧身望向窗外或身侧光影，微风吹拂发丝，饰品在自然光下呈现细腻质感"
	switch anatomy {
	case "hairpin":
		shot1Title = "45°侧颜发髻微风半身抓拍"
		shot1Angle = "45° 侧颜半身特写"
		shot1Action = "45度侧颜微风半身抓拍：自然侧身看窗外天光，发丝盘起整洁雅致，斜射阳光清晰展现发髻上插戴的 @图片1 所示发簪/步摇与灵动侧颜，手腕光洁无手镯"
		shot2Title = "侧后方45°回眸发髻抓拍"
		shot2Angle = "侧后方 45° 微回眸抓拍"
		shot2Action = "侧后方45度回眸微风抓拍：侧后方微回眸机位，镜头清晰对焦发髻上的 @图片1 簪饰，自然垂坠的流苏步摇在光影下摇曳生姿，下颌线优美"
		shot3Title = "发髻发簪超清微距特写"
		shot3Action = "发髻局部超清微距特写：极近距离大光圈浅景深超清对焦发髻上插戴的 @图片1 发簪雕花工艺、玉石/金属微观质感与流苏微光，商品占据画面视觉中心，清晰锐利，背景自然柔和虚化"
		shot3Angle = "发髻发簪部位超清微距特写"
		shot4Action = "生活氛围感半身随拍：优雅端坐或茶台窗边倚靠，单手自然将耳际碎发轻挽于耳后或轻触发髻，神态温润恬淡，自然展露发间 @图片1 簪饰"
	case "earring":
		shot1Action = "正面半身肖像：平视视角，双手自然轻搭在身前桌沿，自然展露双耳耳垂佩戴的 @图片1 所示小巧耳饰与优雅气质，手腕光洁无手镯"
		shot2Action = "45度侧颜微风半身抓拍：侧头看窗外天光，微风吹拂高颅顶蓬松长发，斜射阳光勾勒侧颜下颌线条与耳垂佩戴的 @图片1 所示小巧耳饰"
		shot3Title = "耳际局部超清微距特写"
		shot3Action = "耳际局部超清特写：微侧头，单手自然将碎发挽于耳后，大光圈浅景深超清对焦双耳耳垂佩戴的 @图片1 所示耳饰（小巧精致贴耳比例，严禁画手腕，严禁手腕出现手镯手链，严禁项链），锐利清晰展现宝石/金属光泽"
		shot3Angle = "耳际侧颜局部超清微距特写"
		shot4Action = "生活氛围感半身随拍：桌前舒适倚靠或露天街角回眸，神态甜美松弛，展露耳垂小巧精致耳钉与灵动侧颜，手腕光洁无任何手镯"
	case "necklace":
		shot1Action = "正面半身肖像：平视视角，单手大拇指与食指捏起颈间正中佩戴的 @图片1 所示项链吊坠向镜头展示，端庄领口清晰展露项链细节，半身构图"
		shot2Action = "45度侧颜微风半身抓拍：微侧头看窗外天光，微风吹拂发丝，斜射阳光洒在颈间，勾勒侧颜与颈间项链微光"
		shot3Title = "颈间项链半身近景特写"
		shot3Action = "颈间项链半身近景：平视聚焦端庄领口与颈间吊坠，大光圈浅景深清晰对焦自然垂坠的 @图片1 所示项链，展现细腻金属/宝石光泽与锐利微观细节（严禁项链画在手腕上，严禁手腕出现手镯，严禁后背悬空，严禁低胸与大面积裸露）"
		shot3Angle = "颈间项链半身近景"
		shot4Action = "生活氛围感半身随拍：生活空间舒适倚靠或车内副驾，手部轻扶包带或自然搭在身侧，神态甜美松弛，展露颈间项链，半身构图"
	case "bracelet":
		shot1Action = "正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身包袋，单侧手腕佩戴的 @图片1 所示手链/手镯自然入镜，眼神灵动含笑直视镜头"
		shot2Action = "侧身微风半身抓拍：侧身倚靠看风景，高颅顶蓬松发丝随风微动，斜射阳光洒落在身侧，单手自然下垂或轻搭桌沿，手腕饰品随性入镜"
		shot3Title = "手腕局部超清微距特写"
		shot3Action = "手腕局部超清微距：手部自然平放于木质台面或搭在扶手（手部有真实物理支撑），大光圈浅景深聚焦单侧手腕佩戴的 @图片1 真实细腻的物理微光与锐利微观细节（严禁戴在耳朵或脖子上，脖子光洁无项链）"
		shot3Angle = "手腕首饰超清微距特写"
		shot4Action = "生活氛围感半身随拍：生活空间桌前慵懒倚靠或车内副驾，双手捧水杯或单手搭椅背，手腕首饰与灵动侧颜自然同框，半身构图"
	case "ring":
		shot1Action = "正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身物品上，手指佩戴的 @图片1 所示戒指自然入镜，眼神明媚甜笑"
		shot2Action = "45度侧颜半身抓拍：自然侧身看窗外天光，微风吹拂发丝，斜射阳光洒落在面容与身侧，神态恬淡放松"
		shot3Title = "手指戒指超清微距特写"
		shot3Action = "手指局部微距特写：单手自然轻搭在台面或手袋边缘（手部有真实物理支撑），大光圈浅景深超清聚焦手指佩戴的 @图片1 戒指细节与金属质感，边缘锐利分明（严禁画在手腕或耳垂上）"
		shot3Angle = "手指戒指部位超清微距特写"
		shot4Action = "生活氛围感半身随拍：生活空间舒适倚靠或户外街头，单手轻扶包带或搭在身侧，手指戒指与甜美面容自然同框，半身构图"
	case "bag":
		shot1Action = "正面半身抓拍：单肩背着或手提 @图片1 所示包袋，神态自然从容，展现包袋版型与私服搭配"
		shot2Action = "45度侧身漫步抓拍：侧身漫步走动，手轻扶 @图片1 所示包袋肩带，展现包袋皮质与整体氛围"
		shot3Title = "包袋材质与五金超清特写"
		shot3Action = "包袋局部超清特写：近距离大光圈浅景深聚焦 @图片1 包袋的细腻皮质纹理、精致走线与五金搭扣光泽"
		shot3Angle = "包袋五金与皮质微距特写"
		shot4Action = "生活氛围随拍：手提包袋置于身侧桌边或椅背，人与包袋自然互动，展现生活温度"
	}
	_ = base
	return []sceneShotTemplate{
		{shot1Title, shot1Action, "iPhone 35mm 人文广角镜头", shot1Angle, "medium_shot"},
		{shot2Title, shot2Action, "iPhone 50mm 生活镜头", shot2Angle, "medium_shot"},
		{shot3Title, shot3Action, "iPhone 85mm 细节特写镜头", shot3Angle, "detail_shot"},
		{"生活氛围感半身随拍", shot4Action, "iPhone 50mm 侧颜光影镜头", "生活氛围半身交互随拍", "close_up"},
	}
}

var (
	carPattern      = regexp.MustCompile(`车|副驾|驾驶|方向盘|车窗|扶手箱|后座|车内`)
	anatomyHairpin  = regexp.MustCompile(`发簪|簪子|步摇|发饰|发夹|抓夹|发卡|发圈|发带|发绳|发冠|头饰|头花|抹额|hairpin|hair\s*stick|hair\s*clip|hair\s*accessory`)
	anatomyEarring  = regexp.MustCompile(`耳环|耳钉|耳圈|耳坠|耳饰|earring|earrings|ear\s*stud`)
	anatomyNecklace = regexp.MustCompile(`项链|锁骨链|吊坠|项圈|颈链|颈圈|necklace|pendant|choker`)
	anatomyBracelet = regexp.MustCompile(`手镯|手链|手串|镯子|手绳|手排|手环|腕表|手表|bracelet|bangle|wrist\s*watch`)
	anatomyRing     = regexp.MustCompile(`戒指|指环|对戒|钻戒|ring`)
	anatomyBrooch   = regexp.MustCompile(`胸针|领针|brooch`)
	anatomyBag      = regexp.MustCompile(`包|女包|斜挎包|单肩包|手提包|手拿包|托特包|双肩包|小方包|水桶包|皮包|bag|handbag|crossbody`)
	anatomyShoes    = regexp.MustCompile(`鞋|高跟鞋|单鞋|凉鞋|运动鞋|短靴|长靴|马丁靴|靴子|平底鞋|乐福鞋|shoes|boots|heels`)
	anatomyEyewear  = regexp.MustCompile(`眼镜|墨镜|太阳镜|防蓝光眼镜|镜框|glasses|sunglasses|eyewear`)
	anatomyHat      = regexp.MustCompile(`帽子|草帽|渔夫帽|贝雷帽|鸭舌帽|棒球帽|针织帽|宽檐帽|hat|cap|beret`)
	anatomyScarf    = regexp.MustCompile(`围巾|丝巾|披肩|领巾|方巾|scarf|shawl`)
	anatomyApparel  = regexp.MustCompile(`服饰|服装|上衣|衬衫|衬衣|外套|大衣|风衣|卫衣|毛衣|针织|裙|裤|牛仔|t\s*恤|apparel|dress`)
	anatomyPlaced   = regexp.MustCompile(`静物|摆件|陈设|placed`)
	anatomyHeld     = regexp.MustCompile(`手机|水杯|保温杯|数码|held`)
)
