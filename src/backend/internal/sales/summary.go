package sales

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

type summaryImage struct {
	Index int    `json:"index"`
	URL   string `json:"url"`
	Text  string `json:"text,omitempty"`
}

type summaryTextSource struct {
	Index int    `json:"index"`
	Text  string `json:"text"`
}

type summaryInput struct {
	ProductFacts string              `json:"productFacts,omitempty"`
	TextSources  []summaryTextSource `json:"textSources"`
	// Legacy requests may still contain these fields; only OCR index/text is used.
	ProductName     string         `json:"productName,omitempty"`
	Brand           string         `json:"brand,omitempty"`
	Facts           string         `json:"facts,omitempty"`
	ReferenceImages []summaryImage `json:"referenceImages,omitempty"`
	TextImages      []summaryImage `json:"textImages,omitempty"`
}

func summaryOCRTextSources(input summaryInput) []summaryTextSource {
	if input.TextSources != nil {
		return input.TextSources
	}
	sources := make([]summaryTextSource, len(input.TextImages))
	for i, image := range input.TextImages {
		sources[i] = summaryTextSource{Index: image.Index, Text: image.Text}
	}
	return sources
}

type summaryRequest struct {
	summaryInput
	Model             string `json:"model"`
	CustomBaseURL     string `json:"customBaseUrl"`
	CustomAPIKey      string `json:"customApiKey"`
	TextProtocol      string `json:"textProtocol"`
	APIFormat         string `json:"apiFormat"`
	AllowInsecureHTTP bool   `json:"allowInsecureHttp"`
}

type summaryCompleter func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error)
type summaryImageReader func(context.Context, string, string) ([]byte, error)

const summaryTextOnlyBoundary = `

## 本次应用输入边界
本次仅有 confirmedTextSources 中当前 OCR 文字及其手动修订；绝无图片、图片地址、商品名称、品牌、采集属性或补充商品文字。仅依据提供的文字提炼，不看图、不访问地址、不搜索或补齐资料，不要求原图核对。文字不足时列出具体疑点。来源只能使用当前提供的 ocr-N，禁止使用 image-N 或 product-meta。此输入边界适用于当前请求，上文涉及图片或其他资料的通用说明在本次没有对应输入。`

func Summary(cfg config.Config) http.HandlerFunc {
	return summaryHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if responses {
			return gateway.CompleteResponses(ctx, req)
		}
		return gateway.CompleteText(ctx, req)
	}, nil)
}

func summaryHandler(cfg config.Config, complete summaryCompleter, read summaryImageReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body summaryRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
		if decoder.Decode(&body) != nil {
			fail(400, "商品整理请求格式错误或资料过长")
			return
		}
		if decoder.Decode(new(any)) != io.EOF {
			fail(400, "请求体必须是单个 JSON 对象")
			return
		}
		body.summaryInput = summaryInput{TextSources: summaryOCRTextSources(body.summaryInput)}
		if message := validateSummaryInput(body); message != "" {
			fail(400, message)
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, map[string]any{"textProtocol": body.TextProtocol})
		if !ok {
			return
		}
		base, key, model, credentialErr := summaryCredentials(cfg, r, body)
		if credentialErr != "" {
			fail(400, credentialErr)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 180*time.Second)
		defer cancel()
		prompt, promptErr := loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "summary")
		if promptErr != nil {
			promptStorageFailure(w, promptErr)
			return
		}
		content, err := summaryContent(ctx, body.summaryInput, httpx.WorkspaceFrom(r), read)
		if err != nil {
			fail(504, "卖点提炼已取消或超时，请稍后重试")
			return
		}
		boundary := summaryTextOnlyBoundary
		if body.ProductFacts != "" {
			boundary = "\n\n本次提供 product-meta 商品文字和 confirmedTextSources 内实际存在的 ocr-N。两者分别保留来源；发生冲突写入 conflicts，未经核实的说法不得用于成稿。未附图片或原视频，不补造任何视觉或实测结论。"
		}
		payload := map[string]any{"model": model, "max_tokens": 5000, "response_format": map[string]any{"type": "json_object"},
			"messages": []any{map[string]any{"role": "system", "content": []any{map[string]any{"type": "text", "text": prompt.Prompt + boundary}}}, map[string]any{"role": "user", "content": content}}}
		protocol := gateway.TextProtocolForBase(ctx, model, base)
		host := ""
		if endpoint, parseErr := url.Parse(base); parseErr == nil {
			host = endpoint.Hostname()
		}
		requestID := httpx.RequestID()
		log.Printf("[sales-summary] request=%s stage=model model=%q protocol=%q host=%q text_sources=%d skill=%s", requestID, model, protocol, host, len(body.TextSources), prompt.Version)
		status, data, err := complete(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol,
			Payload: payload, Client: gateway.ModelHTTP(), Timeout: 180 * time.Second}, body.APIFormat == "openai-responses")
		if err != nil || status < 200 || status >= 300 {
			failure := classifySummaryFailure(ctx, status, err, key)
			log.Printf("[sales-summary] request=%s stage=%s code=%s upstream_status=%d detail=%q", requestID, failure.Stage, failure.Code, status, failure.Detail)
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": failure.Stage, "upstreamStatus": status, "requestId": requestID})
			return
		}
		result, err := parseSummaryCompletion(data, body.summaryInput)
		if err != nil {
			log.Printf("[sales-summary] request=%s stage=validation upstream_status=%d detail=%q", requestID, status, err.Error())
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "模型整理未通过检查：" + err.Error() + "；未保存本次文案，原始资料已保留", "code": "summary_validation", "stage": "validation", "requestId": requestID})
			return
		}
		log.Printf("[sales-summary] request=%s stage=complete points=%d", requestID, len(result.Points))
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "result": result, "model": model, "skillVersion": prompt.Version})
	}
}

func summaryContent(ctx context.Context, input summaryInput, _ string, _ summaryImageReader) ([]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	textSources := []any{}
	for _, source := range summaryOCRTextSources(input) {
		textSources = append(textSources, map[string]any{"id": fmt.Sprintf("ocr-%d", source.Index+1), "text": source.Text})
	}
	materials := map[string]any{"confirmedTextSources": textSources}
	if input.ProductFacts != "" {
		materials["productFacts"] = map[string]any{"id": "product-meta", "text": input.ProductFacts}
	}
	data, _ := json.Marshal(materials)
	return []any{map[string]any{"type": "text", "text": string(data)}}, nil
}

//go:embed product-selling-points.md
var summaryInstruction string

func summarySkillVersion() string {
	digest := sha256.Sum256([]byte(summaryInstruction + "|ocr-text-v2"))
	return "product-selling-points:" + hex.EncodeToString(digest[:6])
}

func summaryCredentials(cfg config.Config, r *http.Request, body summaryRequest) (base, key, model, message string) {
	model = strings.TrimSpace(body.Model)
	clientBase := strings.TrimSpace(body.CustomBaseURL)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	key = strings.TrimSpace(body.CustomAPIKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	defaults := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL"))
	if defaults == "" {
		defaults = "https://ai.comfly.org"
	}
	base = defaults
	if clientBase != "" {
		if !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) && !(body.APIFormat == "openai-responses" && body.AllowInsecureHTTP && system.PublicHTTPGateway(clientBase)) {
			return "", "", "", "当前模型接口地址不可用，请检查渠道配置"
		}
		base = clientBase
	}
	base = gateway.NormalizeGatewayBaseURL(base)
	thirdParty := clientBase != "" && base != gateway.NormalizeGatewayBaseURL(defaults)
	if strings.HasPrefix(model, "deepseek-official:") {
		if model != "deepseek-official:deepseek-flash" && model != "deepseek-official:deepseek-v4-pro" {
			return "", "", "", "请选择可用的文字模型"
		}
		if clientBase != "" && base != "https://api.deepseek.com" {
			return "", "", "", "DeepSeek 官方模型只能使用官方接口地址"
		}
		base, thirdParty = "https://api.deepseek.com", true
		model = strings.TrimPrefix(model, "deepseek-official:")
	}
	model = strings.TrimPrefix(model, "openai-responses:")
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	if key == "" {
		return "", "", "", "请先在设置中配置所选文字模型的 API Key"
	}
	return base, key, model, ""
}

type summaryFailure struct {
	Code    string `json:"code"`
	Stage   string `json:"stage"`
	Message string `json:"error"`
	Detail  string `json:"detail,omitempty"`
}

var summaryErrorURL = regexp.MustCompile(`(?i)https?://[^\s<>"']+`)
var summaryErrorData = regexp.MustCompile(`(?i)data:[^\s"']+`)
var summaryErrorCredential = regexp.MustCompile(`(?i)(?:bearer\s+|(?:api[_-]?key|authorization|token)["'\s:=]+)[^\s,"'<>]+`)

// Upstream errors may echo credentials or image data. Neither belongs in the UI or logs.
func summarySafeDetail(err error, key string) string {
	if err == nil {
		return ""
	}
	text := err.Error()
	if key != "" {
		text = strings.ReplaceAll(text, key, "[密钥已隐藏]")
	}
	text = summaryErrorData.ReplaceAllString(text, "[图片数据已隐藏]")
	text = summaryErrorURL.ReplaceAllString(text, "[接口地址]")
	text = summaryErrorCredential.ReplaceAllString(text, "[凭证已隐藏]")
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > 350 {
		text = string(runes[:350]) + "…"
	}
	return text
}

func classifySummaryFailure(ctx context.Context, status int, err error, key string) summaryFailure {
	failure := summaryFailure{Code: "model_request", Stage: "model", Message: "模型调用失败", Detail: summarySafeDetail(err, key)}
	var imageError *gateway.TextImageError
	var indexed *gateway.IndexedImageError
	switch {
	case ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded):
		failure.Code, failure.Message = "model_timeout", "模型调用已取消或超时，请稍后重试"
	case errors.As(err, &imageError) || errors.As(err, &indexed):
		failure.Code, failure.Stage, failure.Message = "image_prepare", "images", "商品图片转换失败，请检查原图格式和尺寸"
	case status == http.StatusForbidden && strings.Contains(strings.ToLower(failure.Detail), "verify your account"):
		failure.Code, failure.Stage, failure.Message = "model_account_verification", "channel", "当前模型渠道要求验证上游账号，请在渠道侧完成验证或切换可用渠道"
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		failure.Code, failure.Message = "model_auth", "模型渠道鉴权失败，请检查所选渠道密钥或权限"
	case status == http.StatusTooManyRequests:
		failure.Code, failure.Message = "model_quota", "模型渠道限流或余额不足"
	case status == http.StatusNotFound:
		failure.Code, failure.Message = "model_route", "渠道未找到所选模型或协议接口，请检查模型 ID 与渠道协议"
	case status == http.StatusBadRequest || status == http.StatusUnprocessableEntity:
		failure.Code, failure.Message = "model_parameters", "模型渠道拒绝了请求参数"
	case status >= 500:
		failure.Code, failure.Message = "model_unavailable", "模型渠道服务异常，请稍后重试"
	case errors.Is(err, gateway.ErrInvalidTextJSON):
		failure.Code, failure.Stage, failure.Message = "model_json", "response", "模型未返回有效 JSON，未保存不完整文案"
	case status >= 200 && status < 300:
		failure.Code, failure.Stage, failure.Message = "model_response", "response", "渠道已响应，但返回内容无法解析"
	}
	if status != 0 {
		failure.Message += fmt.Sprintf("（上游 HTTP %d）", status)
	}
	if failure.Detail != "" {
		failure.Message += "：" + failure.Detail
	}
	return failure
}

type summaryPoint struct {
	Feature    string   `json:"feature"`
	Benefit    string   `json:"benefit"`
	Expression string   `json:"expression"`
	Sources    []string `json:"sources"`
}
type summaryResult struct {
	Summary          string         `json:"summary"`
	Points           []summaryPoint `json:"points"`
	Copy             string         `json:"copy"`
	Conflicts        []string       `json:"conflicts"`
	Questions        []string       `json:"questions"`
	Cautions         []string       `json:"cautions"`
	CopyPointIndexes []int          `json:"copyPointIndexes"`
}

func boundedText(value string, max int, required bool) bool {
	return utf8.RuneCountInString(value) <= max && (!required || strings.TrimSpace(value) != "")
}

func validateSummaryInput(body summaryRequest) string {
	if !boundedText(body.Model, 200, true) {
		return "请选择卖点提炼模型"
	}
	if len(body.CustomBaseURL) > 8192 || len(body.CustomAPIKey) > 8192 || (body.APIFormat != "" && body.APIFormat != "openai-responses") {
		return "模型渠道配置无效"
	}
	sources := summaryOCRTextSources(body.summaryInput)
	if !boundedText(body.ProductFacts, 20000, false) {
		return "商品资料超过 20000 字"
	}
	if len(sources) == 0 && strings.TrimSpace(body.ProductFacts) == "" {
		return "请先识别图片文字，再提炼卖点"
	}
	total := 0
	seen := map[int]bool{}
	for _, source := range sources {
		if source.Index < 0 || source.Index > 99_999 || seen[source.Index] {
			return "OCR 文字来源编号无效或重复"
		}
		seen[source.Index] = true
		if !boundedText(source.Text, 40_000, true) {
			return "单份 OCR 文字需在 40000 字以内且不能为空"
		}
		total += utf8.RuneCountInString(source.Text)
	}
	if total > 60_000 {
		return "OCR 文字合计超过 60000 字，请精简文字后重试"
	}
	return ""
}

func parseSummaryCompletion(data map[string]any, input summaryInput) (summaryResult, error) {
	fail := errors.New("返回结构不完整、来源无效或文案缺失")
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return summaryResult{}, fail
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	finish, _ := choice["finish_reason"].(string)
	text, _ := message["content"].(string)
	if finish == "length" {
		return summaryResult{}, errors.New("模型输出达到长度上限，未接收被截断的文案")
	}
	if finish == "content_filter" {
		return summaryResult{}, errors.New("模型返回内容被渠道安全策略拦截")
	}
	if finish != "stop" || message["refusal"] != nil && message["refusal"] != "" {
		return summaryResult{}, fail
	}
	object := gateway.DecodeObject(text)
	if object == nil {
		return summaryResult{}, errors.New("模型返回的正文不是合法 JSON")
	}
	raw, _ := json.Marshal(object)
	var result summaryResult
	if object == nil || json.Unmarshal(raw, &result) != nil {
		return result, fail
	}
	if !boundedText(result.Summary, 1000, true) || !boundedText(result.Copy, 4000, len(result.Points) > 0) || len(result.Points) > 6 || len(result.Conflicts) > 6 || len(result.Questions) > 3 || len(result.Cautions) > 6 {
		return result, fail
	}
	if len(result.Points) == 0 && len(result.Questions) == 0 {
		return result, fail
	}
	if err := validateSummaryCopyPoints(result); err != nil {
		return result, err
	}
	sources := map[string]bool{"product-meta": strings.TrimSpace(input.ProductFacts) != ""}
	for _, source := range summaryOCRTextSources(input) {
		sources[fmt.Sprintf("ocr-%d", source.Index+1)] = true
	}
	for _, point := range result.Points {
		if !boundedText(point.Feature, 1000, true) || !boundedText(point.Benefit, 1000, true) || !boundedText(point.Expression, 1000, true) || len(point.Sources) == 0 || len(point.Sources) > 16 {
			return result, fail
		}
		for _, source := range point.Sources {
			if !sources[source] {
				return result, fail
			}
		}
	}
	for _, items := range [][]string{result.Conflicts, result.Questions, result.Cautions} {
		for _, item := range items {
			if !boundedText(item, 1000, true) {
				return result, fail
			}
		}
	}
	if result.Points == nil {
		result.Points = []summaryPoint{}
	}
	if result.Conflicts == nil {
		result.Conflicts = []string{}
	}
	if result.Questions == nil {
		result.Questions = []string{}
	}
	if result.Cautions == nil {
		result.Cautions = []string{}
	}
	if result.CopyPointIndexes == nil {
		result.CopyPointIndexes = []int{}
	}
	if err := reviewSummaryResult(&result, input); err != nil {
		return result, err
	}
	return result, nil
}

var summaryPromises = regexp.MustCompile(`保证[^。；\n]{0,12}(版型|稳定|耐用|安全)|不(易|容易)[^。；\n]{0,8}(松垮|变形|走形|起球|褪色)|(拉长|修饰)[^。；\n]{0,6}(颈部|身形|身材|腿部)|显瘦|亲测|我用过|回购无数`)
var summaryClothing = regexp.MustCompile(`针织|毛衣|衬衫|上衣|外套|裙|裤|服装|绵羊毛|罗纹`)
var summaryClothingFeel = regexp.MustCompile(`轻盈|不闷|亲肤|不扎|保暖|不厚重|轻便`)
var summaryCareTemperature = regexp.MustCompile(`手洗[^。；;]{0,12}(?:不高于|≤)(\d{1,3})(?:℃|°C|°c)`)
var summaryIronTemperature = regexp.MustCompile(`(?:熨斗|熨烫)[^。；;]{0,10}(?:不高于|≤)(\d{1,3})(?:℃|°C|°c)`)
var summaryConflictDecision = regexp.MustCompile(`(已|优先)(采用|采信|选择)`)

func validateSummaryCopyPoints(result summaryResult) error {
	if len(result.Points) == 0 && strings.TrimSpace(result.Copy) != "" {
		return errors.New("没有有效买点时不能生成通用推荐文案")
	}
	if len(result.Points) > 0 && len(result.CopyPointIndexes) == 0 {
		return errors.New("推荐文案缺少所依据的买点，请按已提炼买点生成")
	}
	if len(result.CopyPointIndexes) > 3 {
		return errors.New("推荐文案应围绕最多3个核心买点展开")
	}
	seen := map[int]bool{}
	for _, index := range result.CopyPointIndexes {
		if index < 1 || index > len(result.Points) || seen[index] {
			return errors.New("推荐文案引用了不存在或重复的买点")
		}
		seen[index] = true
	}
	return nil
}

func summarySourceText(input summaryInput) string {
	parts := []string{input.ProductFacts}
	for _, source := range summaryOCRTextSources(input) {
		parts = append(parts, source.Text)
	}
	return strings.Join(parts, "\n")
}

// Keep explicit label restrictions independently of the model's marketing copy.
func summaryLabelCautions(input summaryInput) []string {
	flat := strings.Join(strings.Fields(summarySourceText(input)), "")
	flat = strings.ReplaceAll(flat, "℃℃", "℃")
	cautions := []string{}
	seen := map[string]bool{}
	for _, match := range summaryCareTemperature.FindAllStringSubmatch(flat, -1) {
		note := "按标签手洗，水温不高于" + match[1] + "℃"
		if !seen[note] {
			cautions = append(cautions, note)
			seen[note] = true
		}
	}
	for _, label := range []string{"不可干洗", "不可翻转干燥", "不可漂白", "在阴凉处平摊晾干"} {
		if strings.Contains(flat, label) {
			cautions = append(cautions, label)
		}
	}
	for _, match := range summaryIronTemperature.FindAllStringSubmatch(flat, -1) {
		note := "熨斗底板温度不高于" + match[1] + "℃"
		if !seen[note] {
			cautions = append(cautions, note)
			seen[note] = true
		}
	}
	if len(cautions) > 6 {
		cautions = cautions[:6]
	}
	return cautions
}

func reviewSummaryResult(result *summaryResult, input summaryInput) error {
	text := []string{result.Summary, result.Copy}
	for _, point := range result.Points {
		text = append(text, point.Feature, point.Benefit, point.Expression)
	}
	output := strings.Join(text, "\n")
	if summaryPromises.MatchString(output) {
		return errors.New("成稿包含未经证明的效果、耐用性或身体修饰承诺")
	}
	sources := summarySourceText(input)
	if summaryClothing.MatchString(sources) {
		for _, claim := range summaryClothingFeel.FindAllString(output, -1) {
			if !strings.Contains(sources, claim) {
				return errors.New("成稿把服装成分或外观推成了未提供的触感、重量或保暖效果")
			}
		}
	}
	if strings.Contains(output, "弹力") && !strings.Contains(sources, "弹力") {
		return errors.New("成稿把可见罗纹推成了未提供的弹力性能")
	}
	for _, conflict := range result.Conflicts {
		if summaryConflictDecision.MatchString(conflict) {
			return errors.New("模型自行裁决了资料冲突，相关事实需要人工确认")
		}
	}
	notes := summaryLabelCautions(input)
	for _, note := range result.Cautions {
		found := false
		for _, existing := range notes {
			if existing == note {
				found = true
				break
			}
		}
		if !found && len(notes) < 6 {
			notes = append(notes, note)
		}
	}
	result.Cautions = notes
	return nil
}
