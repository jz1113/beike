package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

const scriptVideoUploadLimit = 64 << 20

var scriptVideoMIME = map[string]string{".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}

// Only uploaded workspace videos are read; browser blobs and arbitrary paths are rejected.
func localScriptVideoFile(source, workspace string) (string, error) {
	path := strings.SplitN(strings.SplitN(strings.TrimSpace(source), "?", 2)[0], "#", 2)[0]
	if !strings.HasPrefix(path, "/storage/") {
		return "", errors.New("只接受已上传到当前工作区的参考视频")
	}
	rel := strings.TrimPrefix(path, "/storage/")
	if !storage.WorkspaceRel(rel, workspace, true) {
		return "", errors.New("参考视频不属于当前工作区")
	}
	file := storage.StoredFile(rel)
	if file == "" {
		return "", errors.New("参考视频不在工作区存储中，请重新上传")
	}
	if scriptVideoMIME[strings.ToLower(filepath.Ext(file))] == "" {
		return "", errors.New("参考视频支持 MP4、MOV 和 WebM")
	}
	return file, nil
}

func scriptAspectRatio(width, height int) string {
	if width <= 0 || height <= 0 {
		return "9:16"
	}
	ratio := float64(width) / float64(height)
	best, diff := "9:16", 10.0
	for name, value := range map[string]float64{"9:16": 9.0 / 16, "16:9": 16.0 / 9, "3:4": 3.0 / 4, "1:1": 1} {
		if d := ratio - value; d*d < diff {
			best, diff = name, d*d
		}
	}
	return best
}

func fileHash(path string) string {
	handle, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer handle.Close()
	digest := sha256.New()
	if _, err := io.Copy(digest, handle); err != nil {
		return ""
	}
	return hex.EncodeToString(digest.Sum(nil)[:16])
}

// ScriptVideoUpload keeps reference videos available for script analysis and linked depth conversion.
func ScriptVideoUpload(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		r.Body = http.MaxBytesReader(w, r.Body, scriptVideoUploadLimit+1<<20)
		if _, params, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || params["boundary"] == "" {
			fail(400, "请选择要上传的参考视频")
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			fail(400, "参考视频超过 64 MB 或上传中断，请压缩后重试")
			return
		}
		defer file.Close()
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if scriptVideoMIME[ext] == "" {
			fail(400, "参考视频支持 MP4、MOV 和 WebM")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/refs/sales-script/%s/%s%s", time.Now().Format("200601"), httpx.RequestID(), ext), workspace)
		absolute := storage.SafeWithin(storage.ResolveRoot(), rel)
		if absolute == "" || os.MkdirAll(filepath.Dir(absolute), 0o755) != nil {
			fail(500, "参考视频保存失败")
			return
		}
		if err := saveScriptUpload(file, absolute); err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, absolute)
		if err != nil || probe.Width <= 0 || probe.Height <= 0 || probe.Duration <= 0 {
			_ = os.Remove(absolute)
			fail(400, "无法读取视频画面，请确认文件未损坏")
			return
		}
		info, _ := os.Stat(absolute)
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "videoUrl": "/storage/" + rel, "videoHash": fileHash(absolute),
			"durationSec": roundTenth(probe.Duration), "aspectRatio": scriptAspectRatio(probe.Width, probe.Height), "hasAudio": probe.HasAudio, "sizeBytes": info.Size()})
	}
}

func saveScriptUpload(file multipart.File, absolute string) error {
	out, err := os.Create(absolute)
	if err != nil {
		return errors.New("参考视频保存失败")
	}
	written, copyErr := io.Copy(out, io.LimitReader(file, scriptVideoUploadLimit+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || written == 0 || written > scriptVideoUploadLimit {
		_ = os.Remove(absolute)
		if written > scriptVideoUploadLimit {
			return errors.New("参考视频超过 64 MB，请压缩或截取后再上传")
		}
		return errors.New("参考视频保存失败")
	}
	return nil
}

func roundTenth(value float64) float64 {
	return float64(int(value*10+0.5)) / 10
}

func discardSourcePreviewLinks(script map[string]any) {
	shots, _ := script["shots"].([]any)
	for _, rawShot := range shots {
		shot, _ := rawShot.(map[string]any)
		beats, _ := shot["beats"].([]any)
		for _, rawBeat := range beats {
			beat, _ := rawBeat.(map[string]any)
			delete(beat, "previewFrameUrl")
		}
	}
}

// enrichScriptMedia replaces model guesses with measured duration/audio/ratio.
func enrichScriptMedia(ctx context.Context, root, workspace, videoURL string, script map[string]any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	discardSourcePreviewLinks(script)
	path, err := localScriptVideoFile(videoURL, workspace)
	if err != nil || script == nil {
		return nil
	}
	probe, err := system.ProbeLocalVideo(ctx, root, path)
	if err != nil {
		return nil
	}
	if probe.Duration > 0 {
		script["durationSec"] = roundTenth(probe.Duration)
	}
	script["audioAvailable"] = probe.HasAudio
	visual, _ := script["visualSpec"].(map[string]any)
	if visual == nil {
		visual = map[string]any{}
	}
	visual["aspectRatio"] = scriptAspectRatio(probe.Width, probe.Height)
	script["visualSpec"] = visual
	if !probe.HasAudio {
		script["voiceMode"] = "none"
	}
	// Measured metadata may invalidate an otherwise self-consistent model timeline.
	// Reject it before saving an unusable draft.
	if _, err := validateScriptObject(script); err != nil {
		return fmt.Errorf("分镜时间轴与参考视频实测时长不符：%w", err)
	}
	return ctx.Err()
}

// Some models put the complete timed action directly on a shot instead of
// nesting it under beats. Reuse the recorded interval; never invent sub-timings.
func groupFlatShotActions(script map[string]any) {
	shots, _ := script["shots"].([]any)
	// With exactly one shot, a top-level beats array has one unambiguous
	// owner. Its timestamps still go through the normal timeline validation.
	rootBeats, _ := script["beats"].([]any)
	for _, raw := range shots {
		shot, _ := raw.(map[string]any)
		if existing := shot["beats"]; existing != nil {
			if beats, ok := existing.([]any); !ok || len(beats) != 0 {
				continue
			}
		}
		if len(rootBeats) > 0 {
			if len(shots) == 1 && shot != nil {
				shot["beats"] = rootBeats
				delete(script, "beats")
			}
			continue
		}
		_, startOK := shot["start"].(float64)
		_, endOK := shot["end"].(float64)
		if !startOK || !endOK {
			continue
		}
		beat := map[string]any{}
		for _, key := range []string{"start", "end", "estimated", "purpose", "shotSize", "camera", "subject", "action", "actionTemplate", "referenceActionRaw", "productVisible", "expression", "scene", "transition", "requiredView", "voice", "subtitle", "shows", "cameraLabel", "sectionLabel", "inferred"} {
			if value, ok := shot[key]; ok {
				beat[key] = value
			}
		}
		action, _ := beat["action"].(string)
		template, _ := beat["actionTemplate"].(string)
		if strings.TrimSpace(action) == "" && strings.TrimSpace(template) == "" {
			// A plain summary may just be a shot title. Only reuse a prompt
			// explicitly identified by the brief's "start–end seconds | text" form.
			summary, _ := shot["summary"].(string)
			match := timedShotPrompt.FindStringSubmatch(strings.TrimSpace(summary))
			if len(match) == 0 || strings.TrimSpace(match[1]) == "" || beat["action"] != nil {
				continue
			}
			beat["action"] = strings.TrimSpace(match[1])
		}
		shot["beats"] = []any{beat}
	}
}

var timedShotPrompt = regexp.MustCompile(`(?s)^\d+(?:\.\d+)?\s*(?:秒|s)?\s*[-–—~至]\s*\d+(?:\.\d+)?\s*(?:秒|s)?\s*[|｜]\s*(.+)$`)

func linkValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func validateScriptLinks(ctx context.Context, db *sql.DB, workspace, video, depthVideo, task, operation string) error {
	for _, raw := range []string{video, depthVideo} {
		if raw == "" {
			continue
		}
		parsed, err := url.Parse(raw)
		if err == nil && raw == depthVideo && parsed.Scheme == "https" && len(raw) <= 8192 && trustedDepthVideoURL(ctx, db, workspace, raw) {
			continue
		}
		if err != nil || len(raw) > 8192 || parsed.IsAbs() || parsed.Host != "" || !strings.HasPrefix(parsed.Path, "/storage/") || path.Clean(parsed.Path) != parsed.Path || strings.Contains(parsed.Path, "\\") {
			return errors.New("关联视频必须来自当前工作区的素材存储")
		}
		rel := strings.TrimPrefix(parsed.Path, "/storage/")
		owned := storage.WorkspaceRel(rel, workspace, false) || (workspace == "local" && strings.HasPrefix(rel, "azhuo/"))
		if !owned || scriptVideoMIME[strings.ToLower(path.Ext(parsed.Path))] == "" {
			return errors.New("关联视频不属于当前工作区或格式不支持")
		}
	}
	if len(task) > 256 || len(operation) > 256 {
		return errors.New("深度视频任务标识过长")
	}
	if task != "" {
		var owned int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId"=? AND "id"=? AND "mediaType"='depth-video'`, workspace, task).Scan(&owned); err != nil || owned == 0 {
			return errors.New("深度视频任务不属于当前工作区")
		}
	}
	return nil
}

func trustedDepthVideoURL(ctx context.Context, db *sql.DB, workspace, raw string) bool {
	var owned int
	if db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ActionAsset" WHERE "workspaceId"=? AND "mediaType"='depth-video' AND "mediaUrl"=?`, workspace, raw).Scan(&owned) == nil && owned > 0 {
		return true
	}
	return db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId"=? AND "mediaType"='depth-video' AND "status"='SUCCESS' AND "resultUrl"=?`, workspace, raw).Scan(&owned) == nil && owned > 0
}

// Updating an asynchronous conversion receipt never writes a stale copy of the
// script, taxonomy or review state that the user may be editing concurrently.
func patchScriptLinks(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string, body patchScriptBody) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(r.Context(), `UPDATE "SalesReferenceScript" SET "videoHash"=CASE WHEN COALESCE(?,"videoUrl")!="videoUrl" THEN '' ELSE "videoHash" END,"videoUrl"=COALESCE(?,"videoUrl"),"depthVideoUrl"=COALESCE(?,"depthVideoUrl"),"depthTaskId"=COALESCE(?,"depthTaskId"),"depthOperationId"=COALESCE(?,"depthOperationId"),"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, body.VideoURL, body.VideoURL, body.DepthVideoURL, body.DepthTaskID, body.DepthOperationID, now, workspace, id)
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存关联视频失败，请保留结果并重试"})
		return
	}
	writePatchedScript(w, r, db, workspace, id)
}

type scriptBeatCheck struct {
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Action     string  `json:"action"`
	Expression string  `json:"expression"`
	Transition string  `json:"transition"`
}
type scriptShotCheck struct {
	Start float64           `json:"start"`
	End   float64           `json:"end"`
	Beats []scriptBeatCheck `json:"beats"`
}
type scriptCheck struct {
	Title       string            `json:"title"`
	DurationSec float64           `json:"durationSec"`
	Format      string            `json:"format"`
	VoiceMode   string            `json:"voiceMode"`
	Shots       []scriptShotCheck `json:"shots"`
}

func validateScriptObject(object map[string]any) (scriptCheck, error) {
	if object == nil {
		return scriptCheck{}, errors.New("正文不是合法 JSON")
	}
	if err := validateScriptVisualFields(object); err != nil {
		return scriptCheck{}, err
	}
	raw, err := json.Marshal(object)
	if err != nil {
		return scriptCheck{}, errors.New("脚本 JSON 序列化失败")
	}
	var check scriptCheck
	if json.Unmarshal(raw, &check) != nil {
		return scriptCheck{}, errors.New("时间轴或表情衔接字段类型错误")
	}
	if err := validateScriptTimeline(check); err != nil {
		return scriptCheck{}, err
	}
	return check, nil
}

// Reject malformed performance fields before client normalization can erase them.
func parseScriptCompletion(data map[string]any) (map[string]any, error) {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, errors.New("模型没有返回内容")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	finish, _ := choice["finish_reason"].(string)
	text, _ := message["content"].(string)
	switch finish {
	case "length":
		return nil, errors.New("输出达到长度上限，请截取更短的参考视频")
	case "content_filter":
		return nil, errors.New("返回内容被渠道安全策略拦截")
	case "stop":
	default:
		return nil, errors.New("模型返回未完成")
	}
	object := gateway.DecodeObject(text)
	groupFlatShotActions(object)
	if _, err := validateScriptObject(object); err != nil {
		return nil, err
	}
	return object, nil
}

func validateScriptTimeline(script scriptCheck) error {
	if script.DurationSec <= 0 || script.DurationSec > 600 || math.IsNaN(script.DurationSec) {
		return errors.New("视频时长无效或超过 10 分钟")
	}
	if len(script.Shots) == 0 || len(script.Shots) > 40 {
		return errors.New("镜头数量应为 1—40 个")
	}
	limit := script.DurationSec + 0.5
	previous := 0.0
	for i, shot := range script.Shots {
		if shot.Start < 0 || shot.End <= shot.Start || shot.End > limit || shot.Start < previous-0.25 {
			return fmt.Errorf("镜头 %d 的时间无效或与前一镜重叠", i+1)
		}
		if len(shot.Beats) == 0 {
			return fmt.Errorf("镜头 %d 未返回可用动作段（beats），请补充该镜头的动作和起止秒数", i+1)
		}
		if len(shot.Beats) > 24 {
			return fmt.Errorf("镜头 %d 返回了 %d 个动作段，单镜最多支持 24 段", i+1, len(shot.Beats))
		}
		beatPrevious := shot.Start
		for j, beat := range shot.Beats {
			if len([]rune(beat.Expression)) > 600 || len([]rune(beat.Transition)) > 400 {
				return fmt.Errorf("镜头 %d 的动作段 %d 的表情或衔接描述过长，请分别控制在 600 和 400 字以内", i+1, j+1)
			}
			if beat.Start < shot.Start-0.25 || beat.End > shot.End+0.25 || beat.End <= beat.Start || beat.Start < beatPrevious-0.25 {
				return fmt.Errorf("镜头 %d 的动作段 %d 超出镜头范围或重叠", i+1, j+1)
			}
			beatPrevious = beat.End
		}
		previous = shot.End
	}
	return nil
}

// Only files created by ScriptVideoUpload are disposable inputs. Depth clips,
// generated media and user files have different paths and ownership.
var scriptUploadKey = regexp.MustCompile(`^([^/]+)/azhuo/refs/sales-script/[0-9]{6}/([a-f0-9]{32}|request)\.(mp4|mov|webm)$`)
var legacyScriptFrameKey = regexp.MustCompile(`^[^/]+/azhuo/refs/sales-script/frames/[a-f0-9]{32}/beat-[0-9]{2}-[0-9]+\.jpg$`)
var uploadsMu sync.Mutex
var inUse = map[string]int{}

func managedScriptSource(workspace, url string) string {
	url, _, _ = strings.Cut(url, "?")
	url, _, _ = strings.Cut(url, "#")
	key := strings.TrimPrefix(url, "/storage/")
	m := scriptUploadKey.FindStringSubmatch(key)
	if key == url || m == nil || m[1] != workspace || strings.Contains(key, "..") {
		return ""
	}
	return key
}
func savedSource(workspace, url string) string {
	if managedScriptSource(workspace, url) != "" {
		return ""
	}
	return url
}

func holdScriptSource(workspace, url string) func() {
	key := managedScriptSource(workspace, url)
	if key == "" {
		return func() {}
	}
	uploadsMu.Lock()
	inUse[key]++
	uploadsMu.Unlock()
	return func() {
		uploadsMu.Lock()
		defer uploadsMu.Unlock()
		inUse[key]--
		if inUse[key] == 0 {
			delete(inUse, key)
			root, err := os.OpenRoot(storage.ResolveRoot())
			if err == nil {
				err = root.Remove(key)
				root.Close()
			}
			if err != nil && !os.IsNotExist(err) {
				log.Printf("[参考视频] 清理失败: %v", err)
			}
		}
	}
}

// Sweep only the reference upload namespace, including uploads abandoned before
// analysis. Call before serving on startup; running jobs hold their inputs.
func SweepScriptSources(cfg config.Config, before time.Time) (int, error) {
	uploadsMu.Lock()
	defer uploadsMu.Unlock()
	root, err := os.OpenRoot(storage.ResolveRoot())
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer root.Close()
	// Previous versions kept a JPEG from the source for each beat. Depth playback
	// replaces those previews. Only remove files matching the old writer's path.
	frames, err := fs.Glob(root.FS(), "*/azhuo/refs/sales-script/frames/*/beat-*.jpg")
	if err != nil {
		return 0, err
	}
	for _, frame := range frames {
		if legacyScriptFrameKey.MatchString(frame) {
			if err := root.Remove(frame); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return 0, err
			}
		}
	}
	keys, err := fs.Glob(root.FS(), "*/azhuo/refs/sales-script/??????/*")
	if err != nil {
		return 0, err
	}
	count := 0
	for _, key := range keys {
		if !scriptUploadKey.MatchString(key) || inUse[key] > 0 {
			continue
		}
		info, err := root.Lstat(key)
		if err != nil {
			return count, err
		}
		if !info.Mode().IsRegular() || info.ModTime().After(before) {
			continue
		}
		if err = root.Remove(key); err != nil {
			return count, err
		}
		count++
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return count, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT workspaceId,videoUrl FROM SalesReferenceScript WHERE videoUrl LIKE '%/refs/sales-script/%' GROUP BY workspaceId,videoUrl`)
	if err != nil {
		return count, err
	}
	var stale [][2]string
	for rows.Next() {
		var w, u string
		if err = rows.Scan(&w, &u); err != nil {
			rows.Close()
			return count, err
		}
		if key := managedScriptSource(w, u); key != "" {
			if _, err := root.Stat(key); os.IsNotExist(err) {
				stale = append(stale, [2]string{w, u})
			}
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return count, err
	}
	for _, row := range stale {
		if _, err = db.Exec(`UPDATE SalesReferenceScript SET videoUrl='' WHERE workspaceId=? AND videoUrl=?`, row[0], row[1]); err != nil {
			return count, err
		}
	}
	return count, nil
}
