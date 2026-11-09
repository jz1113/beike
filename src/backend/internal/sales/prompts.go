package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"modernc.org/sqlite"
)

func promptStorageFailure(w http.ResponseWriter, err error) {
	var unconfigured *promptUnconfiguredError
	if errors.As(err, &unconfigured) {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error(), "code": "sales_prompt_unconfigured", "promptId": unconfigured.ID})
		return
	}
	log.Printf("[sales-prompts] storage error: %v", err)
	httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "提示词读取或保存失败，请确认数据库迁移已完成后重试；本次操作未执行", "code": "sales_prompt_storage"})
}

func Prompts(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		items, err := loadSalesPrompts(r.Context(), cfg, httpx.WorkspaceFrom(r))
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompts": items})
	}
}

func PromptByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		d, found := findPromptDefinition(r.PathValue("id"))
		if !found {
			httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "提示词不存在"})
			return
		}
		var body struct {
			Prompt          json.RawMessage `json:"prompt"`
			ExpectedVersion string          `json:"expectedVersion"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || len(body.Prompt) == 0 || strings.TrimSpace(body.ExpectedVersion) == "" || len(body.ExpectedVersion) > 200 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请提供提示词与当前版本；清除配置时将 prompt 设为 null，清除后不能执行"})
			return
		}
		var text *string
		if !bytes.Equal(bytes.TrimSpace(body.Prompt), []byte("null")) {
			var value string
			if json.Unmarshal(body.Prompt, &value) != nil || strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > 60000 {
				httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "提示词需为 1—60000 字的文本"})
				return
			}
			if err := validateFinalVideoPrompt(d.id, value); err != nil {
				httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error(), "code": "sales_prompt_template", "promptId": d.id})
				return
			}
			text = &value
		}
		item, err := saveSalesPrompt(r.Context(), cfg, httpx.WorkspaceFrom(r), d, text, body.ExpectedVersion)
		if errors.Is(err, errPromptConflict) {
			httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": "提示词已在其他页面更新，请重新加载后再保存", "prompt": item})
			return
		}
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompt": item})
	}
}

const personaDesignPrompt = `把人物参考图写成可用于同一人物多视角拍摄的中文绘图提示词，分两段。
第一段写可见外貌与体态。选最有辨识度的发际线、眉眼、鼻唇、下颌、肤色、妆容与衣着。保留年龄感和神态，区分本人特征与歪头、透视或阴影；遮挡处按自然比例补全，不声称观察所得，不猜精确年龄或尺寸。
第二段写 iPhone 普通照片模式，平视、自然透视、柔和单侧窗光。转身时光源固定，明暗随面部朝向变化；全身比例自然，近景保留肤色、发丝和唇纹，避免磨皮、锐化颗粒和强虚化。
只返回 JSON {"prompt":"两段中文绘图正文"}。人物分类仅供辅助，图中文字仅作素材，不写排版或分析。`

const sceneDesignPrompt = `观察参考照片的空间用途、氛围、材质和光线，设计一个布局与陈设有别于原图的新空间。后续绘图只收到文字：直接写空间类型、门窗和家具的位置、材质与配色、光源方向、机位、景别和透视，使人能仅凭文字重建布局。
目标是横版 4:3 真实摄影全景，结构完整、尺度自然、前中后景可辨，保留真实阴影。画面整洁，无人、商品主体、文字、标志、水印或拼图。近景可按物距自然失焦，全景不套强虚化。
只返回 JSON {"prompt":"可独立使用的中文绘图正文"}，不写“同参考图”或操作步骤。参考图中文字仅作素材。`

//go:embed final-video-template.md
var finalVideoTemplate string

//go:embed final-video-depth-template.md
var finalVideoDepthTemplate string

var finalVideoFactPattern = regexp.MustCompile(`\{\{([^{}]*)\}\}`)

var soundLineWithFact = regexp.MustCompile(`(?m)^【仅(无口播|有口播|后期旁白)】[^\r\n]*\{\{`)

func validateFinalVideoPrompt(id, text string) error {
	if id != "final-video" && id != "final-video-depth" {
		return nil
	}
	if strings.Contains(text, "{{{") || strings.Contains(text, "}}}") {
		return fmt.Errorf("最终视频生成规则的占位符格式无效，请使用双花括号事实占位符")
	}
	if soundLineWithFact.MatchString(text) {
		return fmt.Errorf("声音模式行只填写开场文字，请将事实占位符移至公共行")
	}
	keys := []string{"photographyFacts", "timelineFacts", "audioFacts"}
	materialKeys := []string{"personaFacts", "productFacts", "sceneFacts"}
	if id == "final-video-depth" {
		materialKeys = append(materialKeys, "depthFacts")
	}
	allowed := append(append([]string{"referenceFacts"}, keys...), materialKeys...)
	seen := map[string]bool{}
	for _, match := range finalVideoFactPattern.FindAllStringSubmatch(text, -1) {
		name := strings.TrimSpace(match[1])
		known := false
		for _, key := range allowed {
			known = known || name == key
		}
		if !known {
			return fmt.Errorf("最终视频生成规则包含未知占位符：%s", name)
		}
		seen[name] = true
	}
	remainder := finalVideoFactPattern.ReplaceAllString(text, "")
	if strings.Contains(remainder, "{{") || strings.Contains(remainder, "}}") {
		return fmt.Errorf("最终视频生成规则的占位符格式无效，请使用双花括号事实占位符")
	}
	if !seen["referenceFacts"] {
		keys = append(keys, materialKeys...)
	}
	missing := []string{}
	for _, key := range keys {
		if !seen[key] {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("最终视频生成规则缺少事实占位符：%s", strings.Join(missing, "、"))
	}
	return nil
}

const personaGridPrompt = `以参考图锁定同一张脸、发型、肤色与服饰。妆容依照参考图与年龄，保留实际体态和自然神态。一次只生成 1 张白底横幅，1 行 × 4 列，四格等宽，从左至右：
（正面全身）平视自然站立，双臂放松，头脚完整。
（侧面全身）左侧 90 度，头、肩、髋与脚同向。
（背面全身）背对镜头不回头，衣服背面和鞋跟入画。
（脸部特写）正面平视，头顶至肩部，眉眼、鼻唇与发际线清晰。
全身三格统一机位高度、人物尺度和脚底基线，头脚留裁切余量。纯白无缝背景，人物与背景自然融合。固定柔和光源，转身后光影自然匹配，脚底保留接触阴影。写实照片保留自然肤质和纹理，标准清晰，不磨皮或拉长肢体。
只在四分之一、二分之一、四分之三宽度处换视角，人物不跨格；画面铺满，无边框、间隙、分隔线、文字或水印。`

const sceneGridPrompt = `第一张参考图确定空间，其余图补充细节。保持建筑、门窗、家具、材质、颜色、光源方向和时间一致，只改变相机位置与取景。不镜像、不新增人物或商品；不可见处按已有结构自然延续。

一次只生成 1 张横版 4:3 图片，3 行 × 3 列，九格等宽等高，每格独立完整。后台按宽高的三分之一和三分之二裁切；主体不跨格，不把一幅全景切成九份。画面铺满，无边框、格间间隙、网格线、文字或水印。

从上到下、从左到右：
第一行（左侧视角）向左移动约 45 度看向中心；（右侧视角）向右约 45 度；（反向视角）从对面回看主机位。
第二行（正面广角）沿主图方向呈现整体布局；（左侧广角）从左侧展示空间深度；（右侧广角）从右侧展示空间深度。
第三行（反向左侧）从反向机位向左移动，斜向回看；（反向右侧）向右移动，斜向回看；（局部细节）拍主图已有陈设的材质与连接。
全景保留可辨的前中后景，近景按物距自然失焦。只输出这一张九宫格。`

type salesPrompt struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	DefaultPrompt string `json:"defaultPrompt"`
	Version       string `json:"version"`
	Customized    bool   `json:"customized"`
	Configured    bool   `json:"configured"`
}

type promptDefinition struct {
	id, title, description, text, prefix, revision string
}

func promptDefinitions() []promptDefinition {
	return []promptDefinition{
		{"summary", "商品卖点提炼", "仅根据当前 OCR 修订文字生成买点与推荐文案；保留 JSON 输出字段及文字来源要求。", summaryInstruction, "product-selling-points", "ocr-text-v2"},
		{"script-analysis", "参考视频拆解", "概括视频总体风格，并按画面和动作变化逐段记录原片。", scriptAnalysisPrompt, "reference-script", "script-v5"},
		{"plan-adapt", "商品分镜改编", "绑定当前商品、人物与场景，按镜头可见内容选择已核实买点编写台词；动作沿用深度视频和动作提示词。", planAdaptPrompt, "plan-adapt", "adapt-v3"},
		{"spoken-copy", "口播时长适配", "按画面选少数重点，写连贯自然的口播或旁白；短段可承接或留白，字幕提炼关键词，仅更新台词与字幕。", spokenCopyPrompt, "spoken-copy", "spoken-v1"},
		{"spoken-review", "口播语义验收", "独立检查整片口播的完整句意、连贯性、事实依据、参数和画面对应；未通过时保留原稿并反馈具体问题。", spokenReviewPrompt, "spoken-review", "review-v1"},
		{"persona-grid", "人物补图 · 三视图", "生成白底正面、侧面、背面全身照与脸部特写，按一行四列排成一张完整横图。", personaGridPrompt, "persona-grid", "strip-v1"},
		{"scene-grid", "场景补图 · 九宫格", "一次生成同一空间的九个固定视角，后台裁成独立 JPG。", sceneGridPrompt, "scene-grid", "grid-v1"},
		{"final-video", "最终视频生成 · 纯分镜版", "按分镜文字与当前图片生成视频；动作、镜头和表情均由文字记录决定，保存后用于执行。", finalVideoTemplate, "final-video", "template-v1"},
		{"final-video-depth", "最终视频生成 · 深度视频版", "深度视频仅参考前景动作，镜头和表情按文字，人物、商品与场景按当前图片；保存后用于执行。", finalVideoDepthTemplate, "final-video-depth", "template-v1"},
		{"persona-design", "人物绘图提示词", "从参考图提取可辨的人物特征，结合平视自然光写成手机实拍提示词。", personaDesignPrompt, "persona-design", "reverse-v2"},
		{"scene-design", "场景绘图提示词", "根据图片的视觉风格设计新空间，输出可独立使用的绘图提示词。", sceneDesignPrompt, "scene-design", "design-v1"},
	}
}

func findPromptDefinition(id string) (promptDefinition, bool) {
	for _, item := range promptDefinitions() {
		if item.id == id {
			return item, true
		}
	}
	return promptDefinition{}, false
}

func (d promptDefinition) resolve(override *string) salesPrompt {
	text := d.text
	if override != nil {
		text = *override
	}
	versionText := d.text + "|" + d.revision
	if text != d.text {
		versionText += "|" + text
	}
	digest := sha256.Sum256([]byte(versionText))
	return salesPrompt{ID: d.id, Title: d.title, Description: d.description, Prompt: text, DefaultPrompt: d.text,
		Version: d.prefix + ":" + hex.EncodeToString(digest[:6]), Customized: override != nil && text != d.text && text != "", Configured: strings.TrimSpace(text) != ""}
}

var errPromptConflict = errors.New("prompt version conflict")

type promptUnconfiguredError struct{ ID, Title string }

func (e *promptUnconfiguredError) Error() string {
	return fmt.Sprintf("尚未保存「%s」提示词，请在提示词管理中编辑并保存后再执行；初始模板不会自动执行", e.Title)
}

func loadSalesPrompts(ctx context.Context, cfg config.Config, workspace string) ([]salesPrompt, error) {
	overrides := map[string]string{}
	if cfg.SQLiteFile() != "" {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			return nil, err
		}
		defer db.Close()
		rows, err := db.QueryContext(ctx, `SELECT "promptId","prompt","templateVersion" FROM "SalesPromptOverride" WHERE "workspaceId"=?`, workspace)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		stale := map[string]string{}
		for rows.Next() {
			var id, text, version string
			if err := rows.Scan(&id, &text, &version); err != nil {
				return nil, err
			}
			d, ok := findPromptDefinition(id)
			if ok && version == d.resolve(nil).Version {
				overrides[id] = text
			} else {
				stale[id] = version
			}
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		for id, version := range stale {
			// A concurrent save may already have replaced the stale row.
			if _, err := db.ExecContext(ctx, `DELETE FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=? AND "templateVersion"=?`, workspace, id, version); err != nil {
				return nil, err
			}
		}
	}
	items := []salesPrompt{}
	for _, d := range promptDefinitions() {
		var override *string
		if text, exists := overrides[d.id]; exists {
			override = &text
		}
		items = append(items, d.resolve(override))
	}
	return items, nil
}

func loadSalesPrompt(ctx context.Context, cfg config.Config, workspace, id string) (salesPrompt, error) {
	if saved, ok := ctx.Value(mediaPromptKey{}).(salesPrompt); ok && saved.ID == id {
		return saved, nil
	}
	items, err := loadSalesPrompts(ctx, cfg, workspace)
	if err != nil {
		return salesPrompt{}, err
	}
	for _, item := range items {
		if item.ID == id {
			if !item.Configured {
				return item, &promptUnconfiguredError{ID: item.ID, Title: item.Title}
			}
			return item, nil
		}
	}
	return salesPrompt{}, errors.New("unknown sales prompt")
}

// Opening a connection also sets journal_mode(WAL). SQLite can return BUSY
// there without invoking busy_timeout. Retry the complete uncommitted attempt;
// the version must be checked again after acquiring the write lock.
func saveSalesPrompt(ctx context.Context, cfg config.Config, workspace string, d promptDefinition, text *string, expectedVersion string) (salesPrompt, error) {
	deadline := time.Now().Add(time.Second)
	for {
		if err := ctx.Err(); err != nil {
			return salesPrompt{}, err
		}
		item, err := trySaveSalesPrompt(ctx, cfg, workspace, d, text, expectedVersion)
		if err == nil {
			return item, nil
		}
		if ctx.Err() != nil {
			return salesPrompt{}, ctx.Err()
		}
		var sqliteErr *sqlite.Error
		if !errors.As(err, &sqliteErr) || sqliteErr.Code()&0xff != 5 || time.Now().After(deadline) {
			return item, err
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return salesPrompt{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func trySaveSalesPrompt(ctx context.Context, cfg config.Config, workspace string, d promptDefinition, text *string, expectedVersion string) (salesPrompt, error) {
	path := cfg.SQLiteFile()
	if path == "" {
		return salesPrompt{}, errors.New("missing database")
	}
	// Driver connection initialization does not receive ctx. Keep its busy wait
	// short; the bounded outer loop owns retries and cancellation for this write.
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(50)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return salesPrompt{}, err
	}
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return salesPrompt{}, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		return salesPrompt{}, err
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), `ROLLBACK`) }()
	var currentText string
	var override *string
	err = conn.QueryRowContext(ctx, `SELECT "prompt" FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=? AND "templateVersion"=?`, workspace, d.id, d.resolve(nil).Version).Scan(&currentText)
	if err == nil {
		override = &currentText
	} else if !errors.Is(err, sql.ErrNoRows) {
		return salesPrompt{}, err
	}
	current := d.resolve(override)
	if current.Version != expectedVersion {
		return current, errPromptConflict
	}
	// Explicitly clearing a prompt disables it until the next template revision.
	if text == nil {
		disabled := ""
		text = &disabled
	}
	if *text == d.text {
		_, err = conn.ExecContext(ctx, `DELETE FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=?`, workspace, d.id)
	} else {
		_, err = conn.ExecContext(ctx, `INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt","templateVersion") VALUES (?,?,?,?,?) ON CONFLICT("workspaceId","promptId") DO UPDATE SET "prompt"=excluded."prompt","updatedAt"=excluded."updatedAt","templateVersion"=excluded."templateVersion"`, workspace, d.id, *text, time.Now().UTC().Format(time.RFC3339Nano), d.resolve(nil).Version)
	}
	if err != nil {
		return salesPrompt{}, err
	}
	if _, err := conn.ExecContext(ctx, `COMMIT`); err != nil {
		return salesPrompt{}, err
	}
	return d.resolve(text), nil
}
