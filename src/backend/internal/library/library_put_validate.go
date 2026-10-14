package library

import (
	"encoding/json"
	"strings"
)

type editSpec struct {
	kind   string
	nullOK bool
}

func validateLibraryEdit(assetType string, keys []string, data map[string]any) string {
	fields := libraryEditFields(assetType)
	if fields == nil {
		return "不支持的资产类型"
	}
	if len(keys) == 0 {
		return "没有可更新字段"
	}
	if assetType == "full_prompt" {
		if value, ok := data["productSubcategory"]; ok && value != nil && !validPromptSubcategory(value) {
			return "商品二级类目无效"
		}
	}
	if assetType == "persona" || assetType == "outfit" {
		if value, ok := data["dimensions"]; ok && value != nil {
			if message := validateAudienceDimensions(assetType == "outfit", value); message != "" {
				return message
			}
		}
	}
	for _, key := range keys {
		spec, ok := fields[key]
		if !ok {
			return "不允许更新字段: " + key
		}
		value := data[key]
		if value == nil {
			if spec.nullOK {
				continue
			}
			return "字段类型不正确: " + key
		}
		switch spec.kind {
		case "string":
			if _, ok := value.(string); !ok {
				return "字段类型不正确: " + key
			}
		case "bool":
			if _, ok := value.(bool); !ok {
				return "字段类型不正确: " + key
			}
		case "number":
			number, ok := value.(json.Number)
			if !ok {
				return "字段类型不正确: " + key
			}
			if _, ok := libraryInteger(number); !ok {
				return "字段数值不正确: " + key
			}
		}
	}
	return ""
}

func validPromptSubcategory(value any) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	switch text {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return strings.HasPrefix(text, "prompt_subcategory:")
	}
}

func validateAudienceDimensions(outfit bool, value any) string {
	text, ok := value.(string)
	if !ok {
		text = jsString(value)
	}
	var parsed any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return "资产维度格式无效"
	}
	object, ok := parsed.(map[string]any)
	if !ok {
		return "资产维度必须为对象"
	}
	audience, exists := object["audience"]
	if !exists {
		return ""
	}
	name, ok := audience.(string)
	if !ok || !audienceAllowed(outfit, name) {
		return "人群二级分类无效"
	}
	return ""
}

func jsString(value any) string {
	switch typed := value.(type) {
	case json.Number:
		return typed.String()
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return "[object Object]"
	}
}

func audienceAllowed(outfit bool, name string) bool {
	switch name {
	case "adult_male", "adult_female", "senior_male", "senior_female", "child_male", "child_female", "unknown":
		return true
	case "adult_unisex", "senior_unisex", "child_unisex":
		return outfit
	default:
		return false
	}
}

func libraryEditFields(assetType string) map[string]editSpec {
	switch assetType {
	case "scene":
		return sceneEditFields
	case "outfit":
		return outfitEditFields
	case "action":
		return actionEditFields
	case "persona":
		return personaEditFields
	case "full_prompt":
		return fullPromptEditFields
	default:
		return nil
	}
}

func spec(kind string, nullOK bool) editSpec { return editSpec{kind: kind, nullOK: nullOK} }

var (
	sceneEditFields = map[string]editSpec{
		"title": spec("string", false), "description": spec("string", false), "lighting": spec("string", false),
		"category": spec("string", false), "spatialType": spec("string", false), "suitableCategories": spec("string", false),
		"tags": spec("string", false), "coverUrl": spec("string", true), "sourceImages": spec("string", true),
		"reversePrompt": spec("string", true), "dimensions": spec("string", true), "sourceImageIndex": spec("number", true),
		"imageType": spec("string", true), "provenance": spec("string", false), "usageCount": spec("number", false),
		"isFavorite": spec("bool", false),
	}
	outfitEditFields = map[string]editSpec{
		"dimensions": spec("string", true), "title": spec("string", false), "top": spec("string", false),
		"bottom": spec("string", false), "shoes": spec("string", true), "colorPalette": spec("string", true),
		"category": spec("string", false), "suitableCategories": spec("string", false), "tags": spec("string", false),
		"sourceImages": spec("string", true), "provenance": spec("string", false), "usageCount": spec("number", false),
		"isFavorite": spec("bool", false),
	}
	actionEditFields = map[string]editSpec{
		"title": spec("string", false), "action": spec("string", false), "shotType": spec("string", false),
		"spatialType": spec("string", false), "camera": spec("string", true), "suitableAnatomy": spec("string", false),
		"tags": spec("string", false), "sourceImages": spec("string", true), "provenance": spec("string", false),
		"sceneId": spec("string", true), "shotOrder": spec("number", false), "usageCount": spec("number", false),
		"isFavorite": spec("bool", false),
	}
	personaEditFields = map[string]editSpec{
		"dimensions": spec("string", true), "name": spec("string", false), "description": spec("string", false),
		"tags": spec("string", false), "sourceImages": spec("string", true), "provenance": spec("string", false),
		"usageCount": spec("number", false), "isFavorite": spec("bool", false), "albumId": spec("string", true),
		"productCategoryIds": spec("string", false), "isUniversal": spec("bool", false),
	}
	fullPromptEditFields = map[string]editSpec{
		"title": spec("string", false), "albumName": spec("string", true), "reversePromptZh": spec("string", false),
		"reversePromptEn": spec("string", true), "dimensions": spec("string", true), "imageType": spec("string", true),
		"sourceImageIndex": spec("number", true), "coverUrl": spec("string", true), "sourceImages": spec("string", true),
		"hasHuman": spec("bool", false), "shotFraming": spec("string", true), "productFrameRatio": spec("number", true),
		"sceneSummary": spec("string", true), "outfitSummary": spec("string", true), "actionSummary": spec("string", true),
		"personaSummary": spec("string", true), "tags": spec("string", false), "category": spec("string", false),
		"productSubcategory": spec("string", true), "provenance": spec("string", false), "usageCount": spec("number", false),
		"isFavorite": spec("bool", false), "albumId": spec("string", true), "productCategoryIds": spec("string", false),
		"isUniversal": spec("bool", false),
	}
)
