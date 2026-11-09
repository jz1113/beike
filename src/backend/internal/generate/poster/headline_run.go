package poster

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func runHeadlineTitle(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gpt-6-luna"
	}
	base, key := headlineCredentials(cfg, r, payload, model)
	images, message := headlineImages(cfg, r, generate.StringListField(payload, "imageUrls"))
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品图片读取失败，未调用标题模型"})
		return
	}
	content := []any{map[string]any{"type": "text", "text": headlineTitlePrompt(generate.StringField(payload, "originalTitle"), generate.StringField(payload, "productName"))}}
	for _, image := range images {
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	text, usageData, status, err := gateway.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.35, 90*time.Second)
	if err != nil || status >= 300 {
		writeHeadlineFailure(w, headlineFailure(err, status), headlineErrorText(err, status, "标题改写模型 "+model+" 返回 HTTP "+generate.Itoa(status)), usageData, err)
		return
	}
	parsed := gateway.DecodeObject(text)
	title := ""
	if parsed != nil {
		title, _ = parsed["title"].(string)
	}
	title = normalizeHeadline(title)
	if !regexp.MustCompile(`^[\x{3400}-\x{9fff}]{4,18}$`).MatchString(title) {
		writeHeadlineFailure(w, http.StatusBadGateway, "标题改写模型未返回 4–18 字的有效主标题，未截断或提交后续任务", usageData, nil)
		return
	}
	body := map[string]any{"success": true, "data": map[string]any{"title": title}, "model": model}
	if usage := gateway.NormalizeUsage(usageData); usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func runHeadlineDesign(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gpt-6-luna"
	}
	original := strings.TrimSpace(generate.StringField(payload, "originalTitle"))
	if original == "" {
		original = strings.TrimSpace(generate.StringField(payload, "productTitle"))
	}
	cover := strings.TrimSpace(generate.StringField(payload, "coverTitle"))
	if cover == "" {
		cover = strings.TrimSpace(generate.StringField(payload, "productTitle"))
	}
	base, key := headlineCredentials(cfg, r, payload, model)
	images, message := headlineImages(cfg, r, generate.StringListField(payload, "imageUrls"))
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品图片读取失败，未调用设计或生图模型"})
		return
	}
	ratio := generate.StringField(payload, "aspectRatio")
	if ratio != "1:1" {
		ratio = "3:4"
	}
	memory, memoryErr := designMemoryForRequest(r, cfg, payload)
	if memoryErr != nil {
		code := http.StatusInternalServerError
		if errors.Is(memoryErr, ErrCoverSampleNotAdopted) {
			code = http.StatusBadRequest
		}
		httpx.WriteJSON(w, code, map[string]any{"success": false, "error": memoryErr.Error()})
		return
	}
	content := []any{map[string]any{"type": "text", "text": coverDirectorPrompt(original, cover, ratio, generate.StringField(payload, "productName"), generate.StringField(payload, "previousDesign"), memory.Lines, generate.StringField(payload, "supplementaryRequirements"))}}
	for _, image := range images {
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	text, usageData, status, err := gateway.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.65, 90*time.Second)
	if err != nil || status >= 300 || strings.TrimSpace(text) == "" {
		code := headlineFailure(err, status)
		if strings.TrimSpace(text) == "" && err == nil && status < 300 {
			code = http.StatusBadGateway
		}
		writeHeadlineFailure(w, code, headlineErrorText(err, status, "设计模型 "+model+" 没有返回有效内容"), usageData, err)
		return
	}
	parsed := gateway.DecodeObject(text)
	if parsed == nil {
		writeHeadlineFailure(w, http.StatusBadGateway, "设计模型没有返回合法 JSON", usageData, nil)
		return
	}
	design, message := validateCoverDesign(parsed, cover, generate.StringField(payload, "productName"))
	if message != "" {
		writeHeadlineFailure(w, http.StatusBadGateway, message, usageData, nil)
		return
	}
	usageID, auditErr := recordDesignMemory(r, cfg, payload, memory, design)
	body := map[string]any{"success": true, "data": design, "model": model, "promptVersion": "reference-cover-v6", "memorySampleId": memory.SampleID, "memoryEntryIds": memory.IDs, "memoryUsageId": usageID, "memoryRevisionId": memory.RevisionID}
	if auditErr != nil {
		body["memoryWarning"] = "设计已完成，但引用记录未保存；请保留本次设计，勿重复付费设计"
	}
	if usage := gateway.NormalizeUsage(usageData); usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func headlineCredentials(cfg config.Config, r *http.Request, payload map[string]any, model string) (string, string) {
	if strings.HasPrefix(model, "deepseek-official:") {
		return "https://api.deepseek.com", strings.TrimSpace(generate.StringField(payload, "customApiKey"))
	}
	clientBase := strings.TrimSpace(generate.StringField(payload, "customBaseUrl"))
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := generate.ImageDefaultBase()
	if clientBase != "" {
		base = gateway.NormalizeGatewayBaseURL(clientBase)
	}
	return base, generate.HeadlineAPIKey(cfg, r, payload, clientBase)
}

func headlineTitlePrompt(original, product string) string {
	return "你是小红书封面的标题编辑。只返回 JSON：{\"title\":\"4-18个纯中文字符\"}。原标题：" + original + "。商品名：" + product + "。标题必须是 4 到 18 个纯中文字，优先两行，每行4—9字，短标题可一行。保持原意，不把外观当成效果证据。读起来像一条笔记封面：结论或使用场景放在前面，品类名能省则省。每个字都带信息，从对象、变化、感受、对比里留下两样。事实只来自原标题和商品图，没有依据就不写参数、价格、功效或品牌背书。出现必入、神器、绝绝子、yyds、真的绝了、实拍体验时整句重写。例如「洗衣效果很到位」写成「洗完衣服不发灰」。"
}

func designMemoryForRequest(r *http.Request, cfg config.Config, payload map[string]any) (coverDesignMemory, error) {
	requested := strings.TrimSpace(generate.StringField(payload, "memorySampleId"))
	db, ok := openCoverDB(cfg)
	if !ok {
		if cfg.SQLiteFile() != "" || requested != "" && requested != "auto" && requested != "corrections" || generate.StringField(payload, "memoryUsageId") != "" {
			return coverDesignMemory{}, errors.New("封面记忆数据库不可用")
		}
		return coverDesignMemory{SampleID: "corrections", IDs: []string{}}, nil
	}
	defer db.Close()
	return readDesignMemory(r.Context(), db, httpx.WorkspaceFrom(r), requested, generate.StringField(payload, "productName")+" "+generate.StringField(payload, "originalTitle"), generate.StringField(payload, "memoryUsageId"), generate.StringField(payload, "batchId"), generate.StringField(payload, "itemId"))
}

func recordDesignMemory(r *http.Request, cfg config.Config, payload map[string]any, memory coverDesignMemory, design map[string]any) (string, error) {
	db, ok := openCoverDB(cfg)
	if !ok {
		return "", errors.New("封面记忆数据库不可用")
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	return saveDesignMemory(ctx, db, httpx.WorkspaceFrom(r), generate.StringField(payload, "batchId"), generate.StringField(payload, "itemId"), generate.StringField(payload, "itemTitle"), memory, design)
}

func normalizeHeadline(value string) string {
	replacer := strings.NewReplacer("“", "", "”", "", "'", "", "‘", "", "’", "", "【", "", "】", "", "[", "", "]", "", "（", "", "）", "", "(", "", ")", "", "，", "", "。", "", "！", "", "？", "", "、", "", "；", "", "：", "", " ", "", "\n", "", "\t", "")
	return strings.TrimSpace(replacer.Replace(value))
}

func headlineFailure(err error, status int) int {
	if status == 0 {
		return http.StatusBadGateway
	}
	if status >= 500 {
		return http.StatusBadGateway
	}
	if err != nil && status >= 400 {
		return http.StatusBadGateway
	}
	return http.StatusInternalServerError
}

func headlineErrorText(err error, status int, fallback string) string {
	if err != nil && err.Error() != "" && status >= 200 {
		return fallback
	}
	if status >= 400 {
		return fallback
	}
	if err != nil {
		return fallback
	}
	return fallback
}

func writeHeadlineFailure(w http.ResponseWriter, status int, message string, data map[string]any, err error) {
	var invalidJSON *gateway.TextJSONError
	if data == nil && errors.As(err, &invalidJSON) {
		data = invalidJSON.Response
	}
	body := map[string]any{"success": false, "error": message}
	if usage := gateway.NormalizeUsage(data); usage != nil {
		body["usage"] = usage
	}
	if data["submissionUnknown"] == true {
		body["submissionUnknown"] = true
	}
	httpx.WriteJSON(w, status, body)
}

var errCoverRequestMismatch = errors.New("投喂标识已用于其他图片或模型，请重新添加样张")

type coverFeedOperation struct {
	ID     string
	Model  string
	Status string
	Error  string
}

func beginCoverFeed(ctx context.Context, db *sql.DB, workspace, key, title, model, hash string, images []string) (coverFeedOperation, bool, error) {
	id := coverID("sample")
	raw, _ := json.Marshal(images)
	now := coverNow()
	result, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CoverMemorySample"
  ("id","workspaceId","title","imageUrls","model","deconstruction","status","error","createdAt","updatedAt","requestKey","inputHash")
  VALUES (?,?,?,?,?,'','running','',?,?,?,?)`, id, workspace, title, string(raw), model, now, now, key, hash)
	if err != nil {
		return coverFeedOperation{}, false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return coverFeedOperation{}, false, err
	}
	if count == 1 {
		return coverFeedOperation{ID: id, Model: model, Status: "running"}, true, nil
	}
	var operation coverFeedOperation
	var storedHash string
	err = db.QueryRowContext(ctx, `SELECT "id","model","status","error","inputHash" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "requestKey"=?`, workspace, key).Scan(&operation.ID, &operation.Model, &operation.Status, &operation.Error, &storedHash)
	if err == nil && hash != storedHash {
		err = errCoverRequestMismatch
	}
	return operation, false, err
}

func replayCoverFeed(w http.ResponseWriter, operation coverFeedOperation) {
	if operation.Status == "completed" {
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "sampleId": operation.ID, "model": operation.Model, "replayed": true})
		return
	}
	message := "原样张仍在反推，请先刷新核对，不要重复投喂"
	if operation.Status == "failed" {
		message = operation.Error + "；请核对后使用重试"
	}
	httpx.WriteJSON(w, 409, map[string]any{"success": false, "sampleId": operation.ID, "error": message, "uncertain": operation.Status == "running"})
}

func coverFeedHash(images []string, model, title, effort, protocol, base string) string {
	raw, _ := json.Marshal([]any{images, model, title, effort, protocol, base})
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}

// A process crash cannot leave a sample looking active forever. No model call is retried here.
func recoverStaleCoverFeeds(ctx context.Context, db *sql.DB, workspace string) error {
	cutoff := time.Now().UTC().Add(-5 * time.Minute).Format(time.RFC3339Nano)
	_, err := db.ExecContext(ctx, `UPDATE "CoverMemorySample" SET "status"='failed',"error"='反推执行已中断，请核对后手动重试',"updatedAt"=? WHERE "workspaceId"=? AND "status"='running' AND "updatedAt"<?`, coverNow(), workspace, cutoff)
	return err
}

func coverRequestKey(payload map[string]any) (string, bool) {
	value, exists := payload["requestKey"]
	if !exists {
		return "", true
	}
	text, ok := value.(string)
	text = strings.TrimSpace(text)
	return text, ok && len(text) >= 8 && len(text) <= 128
}

func headlineImages(cfg config.Config, r *http.Request, urls []string) ([]string, string) {
	root := storage.ResolveRoot()
	if os.Getenv("AZHUO_CACHE_DIR") == "" && cfg.DataDir() != "" {
		root = filepath.Join(cfg.DataDir(), "storage")
	}
	out := make([]string, 0, len(urls))
	for _, item := range urls {
		item = strings.TrimSpace(item)
		if strings.HasPrefix(item, "data:image/") {
			out = append(out, item)
			continue
		}
		parsed, err := url.Parse(item)
		if err != nil || parsed.User != nil {
			return nil, "unread"
		}
		// The UI and API use different development ports. Only a relative
		// storage path or this application's host can resolve a local file.
		local := parsed.Host == "" && parsed.Scheme == "" && strings.HasPrefix(item, "/storage/")
		if (parsed.Scheme == "http" || parsed.Scheme == "https") && strings.HasPrefix(parsed.Path, "/storage/") {
			requestURL := &url.URL{Host: r.Host}
			local = strings.EqualFold(parsed.Hostname(), requestURL.Hostname()) || loopbackHost(parsed.Hostname()) && loopbackHost(requestURL.Hostname())
		}
		if local {
			rel := strings.TrimPrefix(parsed.Path, "/storage/")
			if !storage.WorkspaceRel(rel, httpx.WorkspaceFrom(r), !cfg.Production()) {
				return nil, "unread"
			}
			image, err := media.VisionImageURL(root, "/storage/"+rel)
			if err != nil {
				return nil, "unread"
			}
			out = append(out, image)
			continue
		}
		status, raw, err := gateway.PostModelHeaders(r.Context(), http.MethodGet, item, "", nil, 20*time.Second, media.RemoteImageHeaders(item))
		if err != nil || status < 200 || status >= 300 || len(raw) == 0 {
			return nil, "unread"
		}
		out = append(out, item)
	}
	return out, ""
}

func loopbackHost(host string) bool {
	return strings.EqualFold(host, "localhost") || net.ParseIP(host).IsLoopback()
}
