package library

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func libraryPutHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20+1))
		if err != nil || len(body) > 32<<20 {
			writeLibraryPutFailure(w, "请求数据格式异常")
			return
		}
		assetType, id, data, keys, shape := parseLibraryPut(body)
		switch shape {
		case "invalid":
			writeLibraryPutFailure(w, "请求数据格式异常")
			return
		case "missing":
			writeLibraryPutMissing(w)
			return
		case "not-object":
			if libraryEditFields(assetType) == nil {
				writeLibraryPutClient(w, "不支持的资产类型")
				return
			}
			writeLibraryPutClient(w, "资产数据必须为对象")
			return
		}
		if message := validateLibraryEdit(assetType, keys, data); message != "" {
			writeLibraryPutClient(w, message)
			return
		}
		storeLibraryNumbers(data)
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeLibraryPutFailure(w, "操作失败，请稍后重试")
			return
		}
		defer db.Close()
		item, err := dblibrary.UpdateLibraryAsset(r.Context(), db, httpx.WorkspaceFrom(r), assetType, id, data)
		if err != nil {
			writeLibraryUpdateError(w, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, struct {
			Success bool            `json:"success"`
			Item    json.RawMessage `json:"item"`
		}{true, item})
	}
}

func parseLibraryPut(body []byte) (string, string, map[string]any, []string, string) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	token, err := decoder.Token()
	if err != nil {
		return "", "", nil, nil, "invalid"
	}
	if token == json.Delim('[') {
		return "", "", nil, nil, "missing"
	}
	if token != json.Delim('{') {
		return "", "", nil, nil, "invalid"
	}
	object := map[string]any{}
	var data map[string]any
	var keys []string
	dataShape := "absent"
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return "", "", nil, nil, "invalid"
		}
		key, _ := keyToken.(string)
		if key == "data" {
			data, keys, dataShape, err = readLibraryData(decoder)
			if err != nil {
				return "", "", nil, nil, "invalid"
			}
			continue
		}
		var value any
		if err := decoder.Decode(&value); err != nil {
			return "", "", nil, nil, "invalid"
		}
		object[key] = value
	}
	closing, err := decoder.Token()
	if err != nil || closing != json.Delim('}') {
		return "", "", nil, nil, "invalid"
	}
	if !jsonTruthy(object["assetType"]) || !jsonTruthy(object["id"]) || dataShape == "absent" || dataShape == "missing" {
		return "", "", nil, nil, "missing"
	}
	assetType, assetOK := object["assetType"].(string)
	id, idOK := object["id"].(string)
	if !assetOK {
		assetType = "\x00"
	}
	if !idOK {
		id = "\x00"
	}
	if dataShape == "not-object" {
		return assetType, id, nil, nil, "not-object"
	}
	return assetType, id, data, keys, ""
}

func readLibraryData(decoder *json.Decoder) (map[string]any, []string, string, error) {
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, nil, "", err
	}
	trimmed := bytes.TrimSpace(raw)
	if bytes.Equal(trimmed, []byte("null")) {
		return nil, nil, "missing", nil
	}
	nested := json.NewDecoder(bytes.NewReader(trimmed))
	nested.UseNumber()
	token, err := nested.Token()
	if err != nil {
		return nil, nil, "", err
	}
	switch typed := token.(type) {
	case json.Delim:
		if typed != '{' {
			return nil, nil, "not-object", nil
		}
	case string:
		if typed == "" {
			return nil, nil, "missing", nil
		}
		return nil, nil, "not-object", nil
	case bool:
		if !typed {
			return nil, nil, "missing", nil
		}
		return nil, nil, "not-object", nil
	case json.Number:
		if typed.String() == "0" {
			return nil, nil, "missing", nil
		}
		return nil, nil, "not-object", nil
	default:
		return nil, nil, "not-object", nil
	}
	values := map[string]any{}
	keys := []string{}
	for nested.More() {
		keyToken, err := nested.Token()
		if err != nil {
			return nil, nil, "", err
		}
		key, _ := keyToken.(string)
		var value any
		if err := nested.Decode(&value); err != nil {
			return nil, nil, "", err
		}
		if _, exists := values[key]; !exists {
			keys = append(keys, key)
		}
		values[key] = value
	}
	return values, keys, "object", nil
}

func jsonTruthy(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case string:
		return typed != ""
	case bool:
		return typed
	case json.Number:
		return typed.String() != "0"
	default:
		return true
	}
}

func writeLibraryUpdateError(w http.ResponseWriter, err error) {
	var client dblibrary.LibraryUpdateError
	if errors.As(err, &client) {
		writeLibraryPutClient(w, client.Message)
		return
	}
	if errors.Is(err, dblibrary.ErrLibraryRecordMissing) {
		writeLibraryPutFailure(w, "请求的资源不存在")
		return
	}
	writeLibraryPutFailure(w, "操作失败，请稍后重试")
}

func writeLibraryPutMissing(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, struct {
		Error string `json:"error"`
	}{"缺少 assetType、id 或 data"})
}

func writeLibraryPutClient(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusBadRequest, struct {
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}{false, message})
}

func writeLibraryPutFailure(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusInternalServerError, struct {
		Error string `json:"error"`
	}{message})
}

func storeLibraryNumbers(data map[string]any) {
	for key, value := range data {
		number, ok := value.(json.Number)
		if !ok {
			continue
		}
		parsed, _ := libraryInteger(number)
		data[key] = parsed
	}
}

func libraryInteger(number json.Number) (int64, bool) {
	text := number.String()
	if strings.ContainsAny(text, ".eE") {
		parsed, err := number.Float64()
		if err != nil || parsed != math.Trunc(parsed) || parsed < 0 || parsed > 9007199254740991 {
			return 0, false
		}
		return int64(parsed), true
	}
	parsed, err := strconv.ParseInt(text, 10, 64)
	if err != nil || parsed < 0 {
		return 0, false
	}
	return parsed, true
}

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
		"tags": spec("string", false), "coverUrl": spec("string", true), "mediaType": spec("string", false),
		"mediaUrl": spec("string", true), "sourceUrl": spec("string", true), "dimensions": spec("string", true),
		"sourceImages": spec("string", true), "provenance": spec("string", false),
		"sceneId": spec("string", true), "shotOrder": spec("number", false), "usageCount": spec("number", false),
		"isFavorite": spec("bool", false), "productCategoryIds": spec("string", false),
	}
	personaEditFields = map[string]editSpec{
		"avatarUrl":  spec("string", true),
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
