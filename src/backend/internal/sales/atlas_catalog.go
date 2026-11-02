package sales

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

type atlasI18nText struct {
	Zh string `json:"zh"`
	En string `json:"en"`
	Ja string `json:"ja"`
}

type atlasPoseAngleMeta struct {
	Key   string        `json:"key"`
	Names atlasI18nText `json:"names"`
}

type atlasPoseSeriesMeta struct {
	Key        string        `json:"key"`
	Names      atlasI18nText `json:"names"`
	Short      atlasI18nText `json:"short"`
	PoseCount  int           `json:"poseCount"`
	ImageCount int           `json:"imageCount"`
}

type atlasPoseCategoryMeta struct {
	Key   string        `json:"key"`
	Names atlasI18nText `json:"names"`
}

type atlasPoseVariantRaw struct {
	Angle string `json:"angle"`
	Thumb string `json:"thumb"`
	Full  string `json:"full"`
}

type atlasPoseItemRaw struct {
	ID       string                `json:"id"`
	Series   string                `json:"series"`
	Category string                `json:"category"`
	No       string                `json:"no"`
	Names    atlasI18nText         `json:"names"`
	Variants []atlasPoseVariantRaw `json:"variants"`
}

type atlasPosesFile struct {
	Angles             []atlasPoseAngleMeta    `json:"angles"`
	Series             []atlasPoseSeriesMeta   `json:"series"`
	Categories         []atlasPoseCategoryMeta `json:"categories"`
	CategoriesBySeries map[string][]string     `json:"categoriesBySeries"`
	Poses              []atlasPoseItemRaw      `json:"poses"`
}

type atlasFaceSectionMeta struct {
	Key   string        `json:"key"`
	Names atlasI18nText `json:"names"`
	Note  atlasI18nText `json:"note"`
	Count int           `json:"count"`
}

type atlasFaceHairMeta struct {
	Key   string        `json:"key"`
	Names atlasI18nText `json:"names"`
	Count int           `json:"count"`
}

type atlasFaceItemRaw struct {
	ID          string `json:"id"`
	Sec         string `json:"sec"`
	Hair        string `json:"hair"`
	Style       string `json:"style"`
	W           int    `json:"w"`
	H           int    `json:"h"`
	Thumb       string `json:"thumb"`
	Full        string `json:"full"`
	ThumbRemote string `json:"thumb_remote"`
	FullRemote  string `json:"full_remote"`
}

type atlasFacesFile struct {
	Sections []atlasFaceSectionMeta `json:"sections"`
	Hairs    []atlasFaceHairMeta    `json:"hairs"`
	Images   []atlasFaceItemRaw     `json:"images"`
}

type atlasPoseVariantDTO struct {
	Angle    string `json:"angle"`
	ThumbURL string `json:"thumbUrl"`
	FullURL  string `json:"fullUrl"`
}

type atlasPoseItemDTO struct {
	ID       string                `json:"id"`
	Series   string                `json:"series"`
	Category string                `json:"category"`
	No       string                `json:"no"`
	Names    atlasI18nText         `json:"names"`
	Variants []atlasPoseVariantDTO `json:"variants"`
}

type atlasFaceItemDTO struct {
	ID            string `json:"id"`
	Section       string `json:"section"`
	Hair          string `json:"hair"`
	Style         string `json:"style"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	ThumbURL      string `json:"thumbUrl"`
	FullURL       string `json:"fullUrl"`
	RemoteFullURL string `json:"remoteFullUrl"`
}

func loadAtlasPosesFile(dir string) (*atlasPosesFile, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "poses.json"))
	if err != nil {
		return nil, err
	}
	var parsed atlasPosesFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}

func loadAtlasFacesFile(dir string) (*atlasFacesFile, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "faces.json"))
	if err != nil {
		return nil, err
	}
	var parsed atlasFacesFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}

func atlasMediaURL(rel string) string {
	clean := strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(rel)), "/")
	if clean == "" {
		return ""
	}
	return "/api/sales/atlas/media?path=" + url.QueryEscape(clean)
}

// AtlasCatalog 返回本机已同步的 RuiC-PoseAtlas 姿态图鉴与人像图鉴目录清单。
func AtlasCatalog(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dir := cfg.AtlasCatalogDir()
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		if kind == "" {
			kind = "all"
		}
		posesFile, posesErr := loadAtlasPosesFile(dir)
		facesFile, facesErr := loadAtlasFacesFile(dir)
		if posesErr != nil && facesErr != nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"success":      true,
				"synced":       false,
				"setupCommand": "pnpm setup:atlas",
				"poses":        nil,
				"faces":        nil,
			})
			return
		}

		var posesPayload any
		if posesFile != nil && (kind == "all" || kind == "pose") {
			items := make([]atlasPoseItemDTO, 0, len(posesFile.Poses))
			for _, item := range posesFile.Poses {
				variants := make([]atlasPoseVariantDTO, 0, len(item.Variants))
				for _, v := range item.Variants {
					variants = append(variants, atlasPoseVariantDTO{
						Angle:    v.Angle,
						ThumbURL: atlasMediaURL(v.Thumb),
						FullURL:  atlasMediaURL(v.Full),
					})
				}
				items = append(items, atlasPoseItemDTO{
					ID: item.ID, Series: item.Series, Category: item.Category,
					No: item.No, Names: item.Names, Variants: variants,
				})
			}
			posesPayload = map[string]any{
				"angles":             posesFile.Angles,
				"series":             posesFile.Series,
				"categories":         posesFile.Categories,
				"categoriesBySeries": posesFile.CategoriesBySeries,
				"items":              items,
			}
		}

		var facesPayload any
		if facesFile != nil && (kind == "all" || kind == "face") {
			items := make([]atlasFaceItemDTO, 0, len(facesFile.Images))
			for _, item := range facesFile.Images {
				thumbURL := atlasMediaURL(item.Thumb)
				fullURL := thumbURL
				if item.Full != "" {
					if safe := storage.SafeWithin(dir, item.Full); safe != "" {
						if info, err := os.Stat(safe); err == nil && info.Mode().IsRegular() {
							fullURL = atlasMediaURL(item.Full)
						}
					}
				}
				items = append(items, atlasFaceItemDTO{
					ID: item.ID, Section: item.Sec, Hair: item.Hair, Style: item.Style,
					Width: item.W, Height: item.H, ThumbURL: thumbURL, FullURL: fullURL,
					RemoteFullURL: item.FullRemote,
				})
			}
			facesPayload = map[string]any{
				"sections": facesFile.Sections,
				"hairs":    facesFile.Hairs,
				"items":    items,
			}
		}

		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"synced":       true,
			"setupCommand": "pnpm setup:atlas",
			"poses":        posesPayload,
			"faces":        facesPayload,
		})
	}
}

// AtlasMedia 安全只读托管本机图鉴目录内的缩略图与线稿原图。
func AtlasMedia(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		rel := strings.TrimSpace(r.URL.Query().Get("path"))
		if rel == "" {
			rel = strings.TrimSpace(r.PathValue("path"))
		}
		ext := strings.ToLower(filepath.Ext(rel))
		contentType := ""
		switch ext {
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".png":
			contentType = "image/png"
		case ".webp":
			contentType = "image/webp"
		default:
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		safe := storage.SafeWithin(cfg.AtlasCatalogDir(), rel)
		if safe == "" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		file, err := os.Open(safe)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		_, _ = io.Copy(w, file)
	}
}
