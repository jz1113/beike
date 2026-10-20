package system

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/network"
)

type remotePet struct {
	Manifest petManifest
	Sprite   []byte
	Meta     petMeta
}

type petSource struct {
	Base   string
	Client *http.Client
}

func productionPetSource() petSource {
	safe := network.SafeClient()
	source := petSource{Base: "https://codex-pets.net"}
	source.Client = &http.Client{Timeout: 45 * time.Second, Transport: safe.Transport, CheckRedirect: source.redirect}
	return source
}

var openPetSource = productionPetSource

func (s petSource) redirect(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("宠物下载重定向过多")
	}
	if _, err := trustedPetURL(s.Base, request.URL.String()); err != nil {
		return err
	}
	return nil
}

func (s petSource) download(ctx context.Context, id string) (remotePet, error) {
	shareURL, err := trustedPetURL(s.Base, s.Base+"/api/pets/"+url.PathEscape(id)+"/share-data")
	if err != nil {
		return remotePet{}, err
	}
	payload, err := s.getJSON(ctx, shareURL)
	if err != nil {
		return remotePet{}, err
	}
	var share struct {
		Pet struct {
			ID          string `json:"id"`
			DownloadURL string `json:"downloadUrl"`
			OwnerHandle string `json:"ownerHandle"`
			UploadedAt  string `json:"uploadedAt"`
		} `json:"pet"`
	}
	if json.Unmarshal(payload, &share) != nil || share.Pet.ID != id || share.Pet.DownloadURL == "" {
		return remotePet{}, errors.New("宠物源返回的清单无效")
	}
	downloadURL, err := trustedPetURL(s.Base, share.Pet.DownloadURL)
	if err != nil {
		return remotePet{}, err
	}
	archive, err := s.getBytes(ctx, downloadURL, maxPetZipBytes)
	if err != nil {
		return remotePet{}, err
	}
	manifest, sprite, err := extractPetPackage(archive, id)
	if err != nil {
		return remotePet{}, err
	}
	return remotePet{Manifest: manifest, Sprite: sprite, Meta: petMeta{
		Author:    clip(share.Pet.OwnerHandle, 80),
		SourceURL: "https://codex-pets.net/pets/" + id,
		Revision:  clip(firstText(downloadURL.Query().Get("v"), share.Pet.UploadedAt), 80),
	}}, nil
}

func (s petSource) getJSON(ctx context.Context, target *url.URL) ([]byte, error) {
	body, err := s.getBytes(ctx, target, 1<<20)
	if err != nil {
		return nil, err
	}
	if !json.Valid(body) {
		return nil, errors.New("宠物源返回的清单无效")
	}
	return body, nil
}

func (s petSource) getBytes(ctx context.Context, target *url.URL, limit int64) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "beike-pets")
	response, err := s.Client.Do(request)
	if err != nil {
		return nil, errors.New("无法连接宠物源")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("宠物源没有找到该桌宠")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, errors.New("宠物下载中断")
	}
	if int64(len(body)) > limit {
		return nil, errors.New("宠物包过大")
	}
	return body, nil
}

func trustedPetURL(base, raw string) (*url.URL, error) {
	baseURL, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || baseURL.Hostname() == "" {
		return nil, errors.New("宠物源无效")
	}
	resolved, err := url.Parse(raw)
	if err != nil {
		return nil, errors.New("宠物下载地址不受信任")
	}
	if !resolved.IsAbs() {
		resolved = baseURL.ResolveReference(resolved)
	}
	if !strings.EqualFold(resolved.Hostname(), baseURL.Hostname()) {
		return nil, errors.New("宠物下载地址不受信任")
	}
	if baseURL.Scheme == "https" && resolved.Scheme != "https" {
		return nil, errors.New("宠物下载地址不受信任")
	}
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return nil, errors.New("宠物下载地址不受信任")
	}
	return resolved, nil
}

func extractPetPackage(data []byte, expectedID string) (petManifest, []byte, error) {
	if len(data) == 0 || len(data) > maxPetZipBytes {
		return petManifest{}, nil, errors.New("宠物包过大")
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return petManifest{}, nil, errors.New("宠物包无法解压")
	}
	if len(reader.File) == 0 || len(reader.File) > maxPetEntries {
		return petManifest{}, nil, errors.New("宠物包内容无效")
	}
	var manifestBytes, sprite []byte
	total := 0
	for _, file := range reader.File {
		if strings.HasSuffix(file.Name, "/") {
			continue
		}
		if unsafeZipName(file.Name) {
			return petManifest{}, nil, errors.New("宠物包包含不安全路径")
		}
		body, readErr := readZipEntry(file)
		if readErr != nil {
			return petManifest{}, nil, readErr
		}
		total += len(body)
		if total > maxPetZipBytes {
			return petManifest{}, nil, errors.New("宠物包过大")
		}
		switch file.Name {
		case "pet.json":
			manifestBytes = body
		case "spritesheet.webp":
			sprite = body
		}
	}
	manifest, err := validatePetManifest(manifestBytes, expectedID)
	if err != nil {
		return petManifest{}, nil, err
	}
	if err := inspectPetSprite(sprite, manifest.SpriteVersionNumber); err != nil {
		return petManifest{}, nil, err
	}
	return manifest, sprite, nil
}

func unsafeZipName(name string) bool {
	return name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, `\`) || strings.Contains(name, "..") || strings.Contains(name, "/")
}

func readZipEntry(file *zip.File) ([]byte, error) {
	if file.UncompressedSize64 > maxPetEntryBytes {
		return nil, errors.New("宠物包过大")
	}
	reader, err := file.Open()
	if err != nil {
		return nil, errors.New("宠物包无法解压")
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, maxPetEntryBytes+1))
	if err != nil || int64(len(body)) > maxPetEntryBytes {
		return nil, errors.New("宠物包过大")
	}
	return body, nil
}

func clip(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func firstText(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
