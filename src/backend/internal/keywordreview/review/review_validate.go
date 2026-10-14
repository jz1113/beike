package review

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

type checkedRows struct {
	results []map[string]any
	failed  []string
}

func validateResults(value any, rows []Row, mode string) (checkedRows, error) {
	object, ok := value.(map[string]any)
	items, itemsOK := []any(nil), false
	if ok {
		items, itemsOK = object["results"].([]any)
	}
	if !ok || !itemsOK {
		return checkedRows{}, fmt.Errorf("模型未返回 results 数组")
	}
	expected := map[string]struct{}{}
	for _, row := range rows {
		expected[row.ID] = struct{}{}
	}
	seen := map[string]struct{}{}
	byID := map[string]map[string]any{}
	failed := map[string]struct{}{}
	for _, item := range items {
		candidate, _ := item.(map[string]any)
		id := fmt.Sprint(candidate["id"])
		if candidate["id"] == nil {
			id = ""
		}
		if _, ok := expected[id]; !ok {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		repaired, err := repairRow(candidate, id, mode)
		if err != nil {
			failed[id] = struct{}{}
			continue
		}
		byID[id] = repaired
	}
	ordered := []map[string]any{}
	missing := []string{}
	for _, row := range rows {
		if item, ok := byID[row.ID]; ok {
			ordered = append(ordered, item)
		}
		if _, ok := seen[row.ID]; !ok {
			failed[row.ID] = struct{}{}
		}
		if _, bad := failed[row.ID]; bad {
			missing = append(missing, row.ID)
		}
	}
	if ordered == nil {
		ordered = []map[string]any{}
	}
	if missing == nil {
		missing = []string{}
	}
	return checkedRows{results: ordered, failed: missing}, nil
}

func repairRow(candidate map[string]any, id, mode string) (map[string]any, error) {
	category, ok := canonicalCategory(textValue(candidate["category"]), categoriesFor(mode))
	if !ok {
		return nil, fmt.Errorf("非法垂类")
	}
	producible := textValue(candidate["producible"])
	if producible != "制作" && producible != "不制作" {
		return nil, fmt.Errorf("非法制作结论")
	}
	if mode == "video" {
		lowValue := textValue(candidate["lowValue"])
		if lowValue != "是" && lowValue != "否" {
			return nil, fmt.Errorf("缺少低价值标记")
		}
		if lowValue == "是" && producible != "不制作" {
			return nil, fmt.Errorf("低价值不能制作")
		}
	}
	reasonText := strings.TrimSpace(textValue(candidate["categoryReason"]))
	if reasonText == "" {
		reasonText = category + "相关内容"
	}
	reason, err := normalizeCategoryReason(reasonText)
	if err != nil {
		return nil, err
	}
	reject, err := normalizeRejectReason(producible, candidate["rejectReason"])
	if err != nil {
		return nil, err
	}
	result := map[string]any{"id": id, "category": category, "producible": producible, "categoryReason": reason, "rejectReason": reject}
	if mode == "video" {
		result["lowValue"] = candidate["lowValue"]
	}
	return result, nil
}

func canonicalCategory(raw string, allowed []string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	compact := strings.ReplaceAll(regexp.MustCompile(`\s+`).ReplaceAllString(trimmed, ""), "／", "/")
	for _, name := range allowed {
		if name == trimmed || strings.ReplaceAll(name, " ", "") == compact {
			return name, true
		}
	}
	return "", false
}

func normalizeCategoryReason(value string) (string, error) {
	text := clipText(strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")), reasonMax)
	if text == "" {
		return "", fmt.Errorf("模型未返回垂类依据")
	}
	return text, nil
}

func normalizeRejectReason(producible string, value any) (string, error) {
	text := ""
	if value != nil {
		text = strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(fmt.Sprint(value), " "))
	}
	if producible == "制作" {
		return "", nil
	}
	prefix := ""
	for _, item := range rejectPrefixes {
		if strings.Contains(text, item) {
			prefix = item
			break
		}
	}
	if prefix == "" {
		return "", fmt.Errorf("不制作依据缺少合法否决类型")
	}
	at := strings.Index(text, prefix)
	after := regexp.MustCompile(`^[：:\s，,。；;]+`).ReplaceAllString(text[at+len(prefix):], "")
	before := regexp.MustCompile(`[：:\s，,。；;]+$`).ReplaceAllString(text[:at], "")
	detailSource := after
	if detailSource == "" {
		detailSource = before
	}
	detail := clipText(detailSource, rejectMax-utf8.RuneCountInString(prefix)-1)
	if detail == "" {
		return "", fmt.Errorf("不制作依据缺少命中点")
	}
	return clipText(prefix+"："+detail, rejectMax), nil
}
