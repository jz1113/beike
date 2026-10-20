package system

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	"strings"
	"unicode/utf8"

	"golang.org/x/image/webp"
)

const (
	maxPetZipBytes   = 12 << 20
	maxPetEntryBytes = 8 << 20
	maxPetEntries    = 8
)

type petManifest struct {
	ID                  string `json:"id"`
	DisplayName         string `json:"displayName"`
	Description         string `json:"description"`
	SpritesheetPath     string `json:"spritesheetPath"`
	SpriteVersionNumber int    `json:"spriteVersionNumber"`
}

type petMeta struct {
	Author    string `json:"author,omitempty"`
	SourceURL string `json:"sourceUrl,omitempty"`
	Revision  string `json:"revision,omitempty"`
}

func validatePetManifest(raw []byte, expectedID string) (petManifest, error) {
	if len(raw) > 8192 {
		return petManifest{}, errors.New("宠物清单过大")
	}
	var manifest petManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return petManifest{}, errors.New("宠物清单无效")
	}
	manifest.DisplayName = strings.TrimSpace(manifest.DisplayName)
	manifest.Description = strings.TrimSpace(manifest.Description)
	if manifest.ID != expectedID || !validPetID(manifest.ID) {
		return petManifest{}, errors.New("下载的宠物标识与命令不一致")
	}
	if manifest.SpritesheetPath != "spritesheet.webp" {
		return petManifest{}, errors.New("宠物清单缺少精灵图")
	}
	if manifest.SpriteVersionNumber != 1 && manifest.SpriteVersionNumber != 2 {
		return petManifest{}, errors.New("只支持 v1 或 v2 桌宠")
	}
	if manifest.DisplayName == "" || utf8.RuneCountInString(manifest.DisplayName) > 80 {
		return petManifest{}, errors.New("宠物名称无效")
	}
	if utf8.RuneCountInString(manifest.Description) > 500 {
		return petManifest{}, errors.New("宠物简介过长")
	}
	return manifest, nil
}

func validatePetSprite(data []byte, version int) error {
	if len(data) < 12 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return errors.New("精灵图不是 WebP")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return errors.New("精灵图无法读取")
	}
	height := 1872
	if version == 2 {
		height = 2288
	}
	if config.Width != 1536 || config.Height != height {
		return errors.New("精灵图尺寸不符合 Codex 桌宠图集")
	}
	return nil
}

func init() {
	image.RegisterFormat("webp", "RIFF????WEBP", webp.Decode, webp.DecodeConfig)
}

var inspectPetSprite = validatePetSprite
