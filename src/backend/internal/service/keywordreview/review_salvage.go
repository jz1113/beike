package keywordreview

import (
	"encoding/json"
	"strings"
)

func salvagePartialResults(raw string) (any, bool) {
	clean := fenceTailPattern.ReplaceAllString(fencePattern.ReplaceAllString(strings.TrimSpace(raw), ""), "")
	index := strings.Index(clean, `"results"`)
	if index < 0 {
		return nil, false
	}
	bracket := strings.Index(clean[index:], "[")
	if bracket < 0 {
		return nil, false
	}
	elements := completeJSONElements(clean, index+bracket)
	if len(elements) == 0 {
		return nil, false
	}
	var parsed any
	if json.Unmarshal([]byte(`{"results":[`+strings.Join(elements, ",")+`]}`), &parsed) != nil {
		return nil, false
	}
	return parsed, true
}

func completeJSONElements(raw string, arrayStart int) []string {
	elements := []string{}
	inString := false
	escape := false
	depth := 0
	start := -1
	for index := arrayStart + 1; index < len(raw); index++ {
		char := raw[index]
		if inString {
			if escape {
				escape = false
				continue
			}
			if char == '\\' {
				escape = true
				continue
			}
			if char == '"' {
				inString = false
			}
			continue
		}
		switch char {
		case '"':
			inString = true
		case '[', '{':
			if depth == 0 {
				start = index
			}
			depth++
		case ']', '}':
			if depth == 0 && char == ']' {
				return elements
			}
			if depth == 0 {
				continue
			}
			depth--
			if depth == 0 && start >= 0 {
				elements = append(elements, raw[start:index+1])
				start = -1
			}
		}
	}
	return elements
}
