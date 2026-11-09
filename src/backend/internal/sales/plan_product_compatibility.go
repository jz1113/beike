package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"net/http"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
)

var salesGeneratedFactTail = regexp.MustCompile(`(?im)(?:^|\n)[ \t#>*-]*(?:最终卖点文案|最终文案|口播文案|推荐文案|营销文案|finalCopy)[ \t]*[:：]`)

// Older clients appended generated advertising to facts. That draft cannot
// establish the product claims used to validate its own replacement.
func cleanSalesProductFacts(facts string) string {
	if location := salesGeneratedFactTail.FindStringIndex(facts); location != nil {
		facts = facts[:location[0]]
	}
	return strings.TrimSpace(facts)
}

func salesProductEvidence(productName, facts string) string {
	return strings.TrimSpace(productName + "\n" + cleanSalesProductFacts(facts))
}

var salesPartClauses = regexp.MustCompile(`[。！？!?；;，,\n]|但是|但|而是|而`)
var salesPartNegation = regexp.MustCompile(`(?:无|没有|不带|不含|不包含|未含|未配|不配|不提供|不包括|不附带|不具备|不自带|不设|未提供)(?:的|任何|独立|可拆卸|加厚|摇粒绒|保暖|单独|一个|一层)*$|(?:未确认|未核实|无法确认|尚未确认|待核对|待确认|待核实|需确认|需核实|未知|不详|缺少|不支持)[^。；;，,\n]{0,6}$|(?:并非|不是|不属于|非)(?:的|独立|可拆卸|加厚|摇粒绒|保暖)*$`)
var salesPartUncertaintyAfter = regexp.MustCompile(`(?i)^(?:的)?(?:信息|配置|结构)?[ ：:=＝为是]*(?:无|没有|否|false|none|null|空|不存在|缺失|不含|不带|不配|未配|未知|不详|尚未确认|未确认|未核实|未提供|待|需(?:要)?核对|需确认|需核实|是否|以.*为准|详见|咨询|请|不支持)`)
var salesPartUnconfirmed = regexp.MustCompile(`参考|原片|原款|旧款|原视频|示例|其他商品|不得|不要|禁止|未知|未确认|未核实|无法确认|不能确认|未见|不确定|待确认|待核实|是否|可选|选配|可搭配|可加配|可加购|另购|另售|另外购买|需单独购买`)
var salesPartNotRequested = regexp.MustCompile(`(?:无|没有|不带|不含)(?:的|任何|独立|可拆卸|加厚|摇粒绒|保暖|单独|一个|一层)*$|(?:不|不要|不得|不能|不许|勿|禁止|不允许)(?:生成|补造|补出|添加|新增|出现|展示|显示|拍摄|揉捏|触碰|拆卸|拆下|取下)(?:任何|新的|额外的|该|商品的|一个|一层|这层|的|独立|加厚|摇粒绒|保暖|单独|可拆卸)*$|(?:不把|不将|不要把|不要将|不得把|不得将|禁止把|禁止将)(?:内搭|衣摆|外壳|衣服|内衬)(?:当作|当成|作为|变成|当)(?:商品的|的|独立)*$`)
var salesProhibitionContinuation = regexp.MustCompile(`^(?:或|以及|和)(?:新增|添加|补造|生成|展示)?$`)
var salesPartPositiveBefore = regexp.MustCompile(`(?:带|含|配有|配备|有|采用|搭载|附带|内置|附送|绒|网布|聚酯|涤纶|棉|固定|不可拆卸|不可拆|可拆卸|可脱卸|可拆|独立)[^。；;，,\n]{0,6}$`)
var salesPartPositiveAfter = regexp.MustCompile(`^(?:的)?[ \t]*(?:是|为|采用|材质|颜色|成分|面料|固定|可拆|能拆|支持拆卸|不可拆|连接|厚度|摇粒绒|网布|涤纶|聚酯)`)
var salesSingleShell = regexp.MustCompile(`单冲|单壳|单外壳|单层外壳|单层冲锋衣|仅(?:有|含|为|售)?(?:外壳|单外套)`)
var salesLiner = regexp.MustCompile(`内胆`)
var salesLining = regexp.MustCompile(`内衬|衬里|里布|里料`)
var salesDetachable = regexp.MustCompile(`可拆卸|可脱卸|可拆|能拆|支持拆卸|可以拆卸|可取下|可拆下|可分离|可独立拆|可单独拆|拆卸式|脱卸式`)
var salesDetachDenial = regexp.MustCompile(`不可拆(?:卸|下)?|不能拆(?:卸|下)?|不可以拆(?:卸|下)?|不支持拆(?:卸|下)?|无法拆(?:卸|下)?|不可脱卸|不能脱卸|固定内胆|一体内胆|不可分离|不能分离`)
var salesDetachAction = regexp.MustCompile(`(?:拆下|拆卸|拆开|拆掉|拆出|拆|取下|卸下|脱卸|分离|可拆)(?:当前|商品|这层|的|外套的|衣服的|里面的|固定|独立|加厚|摇粒绒|抓绒|保暖)*(?:内胆|内衬|衬里|里布|里料)|(?:内胆|内衬|衬里|里布|里料)(?:从衣身上|从外壳上|从外套上|单独|轻轻|可以|能够|为|是|支持|[ ：:]|可|能|后|再|并|向外|向下|自然|将其|把它)*(?:拆下|拆卸|拆开|拆掉|拆出|取下|卸下|脱卸|分离|拆)`)
var salesDetachNegatingPrefix = regexp.MustCompile(`(?:不|不要|不得|不能|勿|禁止|不允许|不许|不必|无需|不需要)[^。；;，,\n]{0,4}$`)
var salesAnyNamedPart = regexp.MustCompile(`内胆|内衬|衬里|里布|里料|帽子|衣帽|袖口|领口|口袋|衣襟|门襟|前襟|拉链|衣身|下摆|衣摆`)
var salesGenericInsidePart = regexp.MustCompile(`商品内部配件|内部配件|内部组件|内置配件`)
var salesGenericPart = regexp.MustCompile(`该部位|商品细节部位`)
var salesGenericDetailDisplay = regexp.MustCompile(`^(?:(?:并且|并|同时|继续|自然)(?:地)?)*(?:展示|展现|呈现)(?:出)?\s*(?:\{\{\s*)?商品细节部位(?:\s*\}\})?(?:的(?:外观|纹理|质感|轮廓|状态|细节))?\s*$`)

// Names of ordinary garment parts only resolve an existing pronoun. They do
// not impose a new factual gate on a visible pocket, placket or garment back.
var salesNamedParts = []*regexp.Regexp{
	salesLiner, salesLining, regexp.MustCompile(`袖口`), regexp.MustCompile(`领口`),
	regexp.MustCompile(`衣襟|门襟|前襟`), regexp.MustCompile(`下摆|衣摆`),
	regexp.MustCompile(`口袋`), regexp.MustCompile(`衣帽|帽子|帽檐`),
	regexp.MustCompile(`衣身`), regexp.MustCompile(`肩部|肩线`), regexp.MustCompile(`背部|后背`),
}

func salesPartEvidence(evidence string, part *regexp.Regexp) (present, denied bool) {
	for _, clause := range salesPartClauses.Split(evidence, -1) {
		for _, location := range part.FindAllStringIndex(clause, -1) {
			before, after := strings.TrimSuffix(clause[:location[0]], "有无"), strings.TrimSpace(clause[location[1]:])
			if salesPartNegation.MatchString(before) || salesPartUncertaintyAfter.MatchString(after) || salesPartUnconfirmed.MatchString(clause) {
				denied = true
			} else {
				propertyValue := strings.IndexAny(after, ":：=＝") == 0 && strings.TrimSpace(strings.TrimLeft(after, ":：=＝")) != ""
				if part != salesLiner && part != salesLining || propertyValue || salesPartPositiveBefore.MatchString(before) || salesPartPositiveAfter.MatchString(after) {
					present = true
				}
			}
		}
	}
	return
}

func salesPartRequested(text string, part *regexp.Regexp) bool {
	for _, clause := range salesPartClauses.Split(text, -1) {
		for _, location := range part.FindAllStringIndex(clause, -1) {
			if salesPartNotRequested.MatchString(clause[:location[0]]) {
				continue
			}
			first := salesAnyNamedPart.FindStringIndex(clause)
			if first != nil && first[1] <= location[0] && salesPartNotRequested.MatchString(clause[:first[0]]) && salesProhibitionContinuation.MatchString(clause[first[1]:location[0]]) {
				continue
			}
			return true
		}
	}
	return false
}

func salesPartDetachRequested(text string, part *regexp.Regexp) bool {
	for _, clause := range salesPartClauses.Split(text, -1) {
		for _, location := range salesDetachAction.FindAllStringIndex(clause, -1) {
			match := clause[location[0]:location[1]]
			if part.MatchString(match) && salesPartRequested(match, part) && !salesDetachNegatingPrefix.MatchString(clause[:location[0]]) {
				return true
			}
		}
	}
	return false
}

func salesPartDetachableEvidence(evidence string, part *regexp.Regexp) (present, denied bool) {
	name := "(?:" + part.String() + ")"
	qualifier := `(?:的|为|是|支持|连接方式|结构|配置|设计|独立|加厚|摇粒绒|绒|网布|保暖|[ ：:=＝])*`
	positive := regexp.MustCompile("(?:" + salesDetachable.String() + ")" + qualifier + name + "|" + name + qualifier + "(?:" + salesDetachable.String() + ")")
	negative := regexp.MustCompile("(?:" + salesDetachDenial.String() + "|固定|一体)" + qualifier + name + "|" + name + qualifier + "(?:" + salesDetachDenial.String() + "|固定|一体)")
	for _, clause := range salesPartClauses.Split(evidence, -1) {
		if negative.MatchString(clause) || (!salesAnyNamedPart.MatchString(clause) && salesDetachDenial.MatchString(clause)) {
			denied = true
		}
		if positive.MatchString(clause) && !salesPartUnconfirmed.MatchString(clause) {
			present = true
		}
	}
	return
}

func validateSalesProductPart(index int, text, evidence, assignedView, imageLabel string) error {
	return validateSalesProductStructure(index, text, evidence, assignedView, imageLabel, true)
}

// Speech review has no image payload. It still must reject unsupported inner
// components; the production preflight separately checks the actual binding.
func validateSalesProductPartFacts(index int, text, evidence string) error {
	return validateSalesProductStructure(index, text, evidence, "", "", false)
}

type salesProductPartAmbiguity struct {
	index       int
	term, field string
}

func (e *salesProductPartAmbiguity) Error() string {
	location := "的"
	if e.field != "" {
		location += e.field + "中"
	}
	return fmt.Sprintf("动作段 %d %s「%s」指向不明确，请绑定一个具体商品部位后重试；原动作保持不变", e.index+1, location, e.term)
}

func locateSalesProductPartError(err error, fields [4]string) error {
	ambiguous, ok := err.(*salesProductPartAmbiguity)
	if !ok {
		return err
	}
	labels := [4]string{"主体", "画面动作", "表情", "衔接"}
	var locations []string
	for i, text := range fields {
		if strings.Contains(text, ambiguous.term) {
			locations = append(locations, labels[i])
		}
	}
	ambiguous.field = strings.Join(locations, "、")
	return ambiguous
}

func validateSalesProductStructure(index int, text, evidence, assignedView, imageLabel string, requireDetail bool) error {
	if salesPartRequested(text, salesGenericInsidePart) {
		return fmt.Errorf("动作段 %d 的内部配件尚未绑定具体部件，请核实当前商品结构并明确部件名称；原动作保持不变", index+1)
	}
	if salesPartRequested(text, salesGenericPart) {
		parts := 0
		for _, part := range salesNamedParts {
			if part.MatchString(text) {
				parts++
			}
		}
		if parts != 1 {
			for _, clause := range salesPartClauses.Split(text, -1) {
				// A standalone visual display does not specify a contact point.
				// Other clauses still need an unambiguous object for their actions.
				if salesGenericDetailDisplay.MatchString(strings.TrimSpace(clause)) {
					continue
				}
				for _, term := range salesGenericPart.FindAllString(clause, -1) {
					if salesPartRequested(clause, regexp.MustCompile(term)) {
						return &salesProductPartAmbiguity{index: index, term: term}
					}
				}
			}
		}
	}
	for _, part := range []struct {
		name    string
		pattern *regexp.Regexp
	}{{"内胆", salesLiner}, {"内衬", salesLining}} {
		if !salesPartRequested(text, part.pattern) {
			continue
		}
		present, denied := salesPartEvidence(evidence, part.pattern)
		if part.name == "内胆" {
			single, _ := salesPartEvidence(evidence, salesSingleShell)
			denied = denied || single
		}
		if denied {
			return fmt.Errorf("动作段 %d 需要展示%s，但当前商品原始资料明确否定或尚未确认该结构，请先核对资料或选择兼容脚本；不会自动修改原动作", index+1, part.name)
		}
		if !present {
			return fmt.Errorf("动作段 %d 需要展示%s，但当前商品名称和原始事实中没有该部件证据，请先核实结构；内搭、内衬与内胆不能互相替代", index+1, part.name)
		}
		if requireDetail && (strings.TrimSpace(assignedView) != "detail" || strings.TrimSpace(imageLabel) == "") {
			return fmt.Errorf("动作段 %d 缺少%s结构细节参考，请补充该部件的细节图并重新绑定本段；上身主图不能替代内部结构参考", index+1, part.name)
		}
		if salesPartDetachRequested(text, part.pattern) {
			detachable, deniedDetach := salesPartDetachableEvidence(evidence, part.pattern)
			if deniedDetach || !detachable {
				return fmt.Errorf("动作段 %d 要拆卸%s，但当前商品原始事实没有明确支持可拆卸，请核实拆卸结构后重试；不会自动改成其他动作", index+1, part.name)
			}
		}
	}
	return nil
}

func validatePlanProductInput(body planAdaptRequest) error {
	evidence := salesProductEvidence(body.ProductName, body.Facts)
	for i, beat := range body.Beats {
		fields := [4]string{beat.Subject, beat.RefAction, beat.Expression, beat.Transition}
		text := strings.Join(fields[:], "\n")
		if err := validateSalesProductPart(i, text, evidence, beat.AssignedView, beat.ImageLabel); err != nil {
			return locateSalesProductPartError(err, fields)
		}
	}
	return nil
}

func validatePlanProductOutput(beats []adaptedBeatOutput, body planAdaptRequest) error {
	evidence := salesProductEvidence(body.ProductName, body.Facts)
	for i, beat := range beats {
		fields := [4]string{beat.Subject, beat.Action, beat.Expression, beat.Transition}
		text := strings.Join(fields[:], "\n")
		if err := validateSalesProductPart(i, text, evidence, body.Beats[i].AssignedView, body.Beats[i].ImageLabel); err != nil {
			return locateSalesProductPartError(err, fields)
		}
	}
	return nil
}

// Only a script-only adaptation can replace an incompatible source performance. Deep
// motion and manually edited beats keep their hard preflight check.
func planAdaptPerformance(body planAdaptRequest) ([]planAdaptBeatInput, map[int]string) {
	if !body.AllowProductReframe || body.ImitationMode != "script_only" {
		return body.Beats, nil
	}
	beats := append([]planAdaptBeatInput(nil), body.Beats...)
	changes := map[int]string{}
	evidence := salesProductEvidence(body.ProductName, body.Facts)
	for i, b := range beats {
		if b.PreservePerformance {
			continue
		}
		if err := validateSalesProductPart(i, strings.Join([]string{b.Subject, b.RefAction, b.Expression, b.Transition}, "\n"), evidence, b.AssignedView, b.ImageLabel); err != nil {
			changes[i] = err.Error()
			beats[i].Subject, beats[i].RefAction, beats[i].Expression, beats[i].Transition = "", "", "", ""
		}
	}
	return beats, changes
}

type planPersonaVisualProfile struct {
	ImageURL    string `json:"imageUrl"`
	Presence    string `json:"presence"`
	Temperament string `json:"temperament"`
	Gaze        string `json:"gaze"`
	Expression  string `json:"expression"`
	Posture     string `json:"posture"`
	Limitations string `json:"limitations"`
}

func validatePlanPersonaInput(body *planAdaptRequest) error {
	body.PersonaReferenceImageURL = strings.TrimSpace(body.PersonaReferenceImageURL)
	if body.PersonaReferenceImageURL == "" {
		return nil
	}
	if !boundedText(body.PersonaReferenceImageURL, 8192, true) {
		return errors.New("人物原图地址无效")
	}
	switch body.PersonaPresence {
	case "full_presenter", "silent_model", "hands_only":
		return nil
	default:
		return errors.New("请明确人物原图的出镜范围后重试")
	}
}

// Use the same guarded image reader as asset creation. Local references stay
// workspace scoped; remote images cannot access private network resources.
func planPersonaContent(ctx context.Context, workspace string, body planAdaptRequest, text string) (any, error) {
	if body.PersonaReferenceImageURL == "" {
		return text, nil
	}
	data, err := readAssetGrid(ctx, body.PersonaReferenceImageURL, workspace)
	if err != nil {
		return nil, errors.New("人物原图读取失败，请核对所选人物或重新上传后再改写")
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 || int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return nil, errors.New("人物原图无效或超过 4000 万像素，请更换后重试")
	}
	url := "data:" + http.DetectContentType(data) + ";base64," + base64.StdEncoding.EncodeToString(data)
	return []any{map[string]any{"type": "text", "text": text},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": url}}}, nil
}

func parsePlanPersonaVisual(data map[string]any, body planAdaptRequest) (*planPersonaVisualProfile, error) {
	if body.PersonaReferenceImageURL == "" {
		return nil, nil
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return nil, errors.New("模型未返回人物原图视觉分析")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	object := gateway.DecodeObject(text)
	raw, _ := json.Marshal(object["personaVisualProfile"])
	var profile *planPersonaVisualProfile
	if json.Unmarshal(raw, &profile) != nil || profile == nil {
		return nil, errors.New("人物原图视觉分析缺失或格式无效，请使用支持图片理解的改写模型重试")
	}
	fields := []*string{&profile.Temperament, &profile.Gaze, &profile.Expression, &profile.Posture, &profile.Limitations}
	for _, field := range fields {
		*field = strings.TrimSpace(*field)
		if !boundedText(*field, 600, false) {
			return nil, errors.New("人物原图视觉分析过长，请重试")
		}
	}
	if body.PersonaPresence == "hands_only" {
		profile.Gaze, profile.Expression = "", ""
	}
	if strings.TrimSpace(profile.Temperament+profile.Gaze+profile.Expression+profile.Posture) == "" {
		return nil, errors.New("人物原图未提取到可见神态或姿态，请更换清晰图片重试")
	}
	// The server binds the observations to the submitted source. A model may
	// describe an image, but cannot choose its identity or scope.
	profile.ImageURL, profile.Presence = body.PersonaReferenceImageURL, body.PersonaPresence
	return profile, nil
}
