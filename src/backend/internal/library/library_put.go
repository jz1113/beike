package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
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
		db, err := httpx.OpenDB(cfg)
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
