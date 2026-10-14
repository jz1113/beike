package database

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func UniqueIDs(ids []string) []string {
	seen := map[string]struct{}{}
	unique := []string{}
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique
}

func CategoryJSON(values []string) string {
	if values == nil {
		values = []string{}
	}
	body, _ := json.Marshal(values)
	return string(body)
}

type ErrText string

func (err ErrText) Error() string { return string(err) }

func StringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func CategoryIDList(raw string) []string {
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range parsed {
		text, ok := item.(string)
		if !ok || text == "" {
			continue
		}
		if _, ok := seen[text]; ok {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids
}

func BuiltinSubcategory(value string) bool {
	switch value {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return false
	}
}

func BuiltinFolderID(value string) string {
	return PromptSubcategoryPrefix + "digital_3c:" + value
}

const PromptSubcategoryPrefix = "prompt_subcategory:"

func RandomHex() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func NullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func QuestionMarks(count int) string {
	marks := make([]string, count)
	for i := range marks {
		marks[i] = "?"
	}
	return strings.Join(marks, ",")
}

func WriteMediaReviews(root, workspace string, urls, ids []string) error {
	dir := filepath.Join(root, workspace)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, item := range urls {
		if _, ok := seen[item]; ok || strings.HasPrefix(item, "data:") || strings.HasPrefix(item, "blob:") {
			continue
		}
		seen[item] = struct{}{}
		sum := sha256.Sum256([]byte(item))
		body, err := json.Marshal(map[string]any{
			"url":      item,
			"source":   map[string]any{"assetType": "imageTask", "ids": ids},
			"state":    "retained-reference-check-required",
			"queuedAt": time.Now().UTC().Format(time.RFC3339Nano),
		})
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, hex.EncodeToString(sum[:])+".json"), body, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func StringsToAny(values []string) []any {
	items := make([]any, len(values))
	for i, value := range values {
		items[i] = value
	}
	return items
}

func EscapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}
