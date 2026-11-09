package system

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"golang.org/x/image/webp"
)

const (
	maxPetZipBytes   = 12 << 20
	maxPetEntryBytes = 8 << 20
	maxPetEntries    = 8
)

//go:embed petdata/builtin
var builtinPetFiles embed.FS

var builtinPetOrder = []string{
	"q-ban-da-fei-yu",
	"pet-6ac83c93535081918861d5c78bb9a8fc",
	"pet-6ac97d6e82208191a38e047be23e1293",
	"the-real-tronald-dump",
}

var petCommandPattern = regexp.MustCompile(`^npx\s+codex-pets\s+add\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*$`)
var petIDPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var workspacePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)
var petInstallLocks sync.Map

func Pets(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pets, err := newPetStore(cfg).List(httpx.WorkspaceFrom(r))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "无法读取桌宠"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "pets": pets})
	})
}

func ImportPets(cfg config.Config) http.Handler {
	store := newPetStore(cfg)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<10+1))
		if err != nil || len(body) > 16<<10 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "导入命令过长"})
			return
		}
		var request struct {
			Commands string `json:"commands"`
		}
		if json.Unmarshal(body, &request) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "导入命令无效"})
			return
		}
		commands, err := parsePetCommands(request.Commands)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		results := importPetCommands(r, store, commands)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "results": results})
	})
}

func PetSpritesheet(cfg config.Config) http.Handler {
	store := newPetStore(cfg)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, err := store.Sprite(httpx.WorkspaceFrom(r), r.PathValue("id"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "没有找到桌宠"})
			return
		}
		w.Header().Set("Content-Type", "image/webp")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})
}

type petImportResult struct {
	Input string   `json:"input"`
	ID    string   `json:"id,omitempty"`
	OK    bool     `json:"ok"`
	Error string   `json:"error,omitempty"`
	Pet   *petView `json:"pet,omitempty"`
}

func importPetCommands(r *http.Request, store petStore, commands []parsedPetCommand) []petImportResult {
	source := openPetSource()
	workspace := httpx.WorkspaceFrom(r)
	done := map[string]petView{}
	results := make([]petImportResult, 0, len(commands))
	for _, command := range commands {
		if command.err != "" {
			results = append(results, petImportResult{Input: command.input, Error: command.err})
			continue
		}
		if pet, ok := done[command.id]; ok {
			copied := pet
			results = append(results, petImportResult{Input: command.input, ID: command.id, OK: true, Pet: &copied})
			continue
		}
		downloaded, err := source.download(r.Context(), command.id)
		if err != nil {
			results = append(results, petImportResult{Input: command.input, ID: command.id, Error: petError(err)})
			continue
		}
		view, err := store.Install(workspace, downloaded)
		if err != nil {
			results = append(results, petImportResult{Input: command.input, ID: command.id, Error: "无法保存桌宠"})
			continue
		}
		done[command.id] = view
		results = append(results, petImportResult{Input: command.input, ID: command.id, OK: true, Pet: &view})
	}
	return results
}

func petError(err error) string {
	if err == nil {
		return "无法导入桌宠"
	}
	text := err.Error()
	if text == "" {
		return "无法导入桌宠"
	}
	return text
}

type parsedPetCommand struct {
	input string
	id    string
	err   string
}

func parsePetCommands(text string) ([]parsedPetCommand, error) {
	lines := strings.Split(text, "\n")
	parsed := make([]parsedPetCommand, 0, len(lines))
	for _, line := range lines {
		input := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if input == "" {
			continue
		}
		parsed = append(parsed, parsePetCommand(input))
		if len(parsed) > 20 {
			return nil, errors.New("一次最多导入 20 条命令")
		}
	}
	if len(parsed) == 0 {
		return nil, errors.New("请粘贴 npx codex-pets add 命令")
	}
	return parsed, nil
}

func parsePetCommand(input string) parsedPetCommand {
	if strings.ContainsAny(input, "|&;`$<>(){}\\") {
		return parsedPetCommand{input: input, err: "只接受 npx codex-pets add 宠物标识"}
	}
	match := petCommandPattern.FindStringSubmatch(input)
	if match == nil {
		return parsedPetCommand{input: input, err: "只接受 npx codex-pets add 宠物标识"}
	}
	return parsedPetCommand{input: input, id: match[1]}
}

func validPetID(id string) bool {
	return petIDPattern.MatchString(id) && len(id) <= 80
}

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

type petView struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	Description    string `json:"description"`
	SpriteVersion  int    `json:"spriteVersion"`
	Origin         string `json:"origin"`
	Author         string `json:"author,omitempty"`
	SourceURL      string `json:"sourceUrl,omitempty"`
	Revision       string `json:"revision,omitempty"`
	SpritesheetURL string `json:"spritesheetUrl"`
}

type petStore struct{ root string }

func newPetStore(cfg config.Config) petStore {
	base := cfg.DataDir()
	if base == "" {
		base = filepath.Join(cfg.Root, ".local")
	}
	return petStore{root: filepath.Join(base, "pets")}
}

func (s petStore) List(workspace string) ([]petView, error) {
	views := make([]petView, 0, len(builtinPetOrder))
	seen := map[string]int{}
	for _, id := range builtinPetOrder {
		view, _, err := builtinPet(id)
		if err != nil {
			return nil, err
		}
		seen[id] = len(views)
		views = append(views, view)
	}
	imported, err := s.imported(workspace)
	if err != nil {
		return nil, err
	}
	for _, view := range imported {
		if index, ok := seen[view.ID]; ok {
			views[index] = view
			continue
		}
		seen[view.ID] = len(views)
		views = append(views, view)
	}
	return views, nil
}

func (s petStore) Sprite(workspace, id string) ([]byte, error) {
	path, err := s.petPath(workspace, id)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(path, "spritesheet.webp"))
	if err == nil {
		return data, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	_, data, err = builtinPet(id)
	return data, err
}

func (s petStore) Install(workspace string, pet remotePet) (petView, error) {
	dir, err := s.petPath(workspace, pet.Manifest.ID)
	if err != nil {
		return petView{}, err
	}
	lock := petLock(dir)
	lock.Lock()
	defer lock.Unlock()
	if err := writePetDir(dir, pet); err != nil {
		return petView{}, err
	}
	return viewFrom(pet.Manifest, pet.Meta, "imported"), nil
}

func (s petStore) imported(workspace string) ([]petView, error) {
	root, err := s.workspacePath(workspace)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	views := make([]petView, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || !validPetID(entry.Name()) {
			continue
		}
		view, ok := readInstalledPet(filepath.Join(root, entry.Name()))
		if ok {
			views = append(views, view)
		}
	}
	return views, nil
}

func (s petStore) workspacePath(workspace string) (string, error) {
	if !workspacePattern.MatchString(workspace) {
		return "", errors.New("工作区无效")
	}
	return filepath.Join(s.root, workspace), nil
}

func (s petStore) petPath(workspace, id string) (string, error) {
	if !validPetID(id) {
		return "", errors.New("宠物标识无效")
	}
	root, err := s.workspacePath(workspace)
	if err != nil {
		return "", err
	}
	return filepath.Join(root, id), nil
}

func writePetDir(dir string, pet remotePet) error {
	staging := dir + ".next"
	backup := dir + ".bak"
	if err := os.RemoveAll(staging); err != nil {
		return err
	}
	if err := os.MkdirAll(staging, 0o700); err != nil {
		return err
	}
	manifest, err := json.Marshal(pet.Manifest)
	if err != nil {
		return err
	}
	meta, err := json.Marshal(pet.Meta)
	if err != nil {
		return err
	}
	if err := writePrivate(filepath.Join(staging, "pet.json"), manifest); err != nil {
		return err
	}
	if err := writePrivate(filepath.Join(staging, "meta.json"), meta); err != nil {
		return err
	}
	if err := writePrivate(filepath.Join(staging, "spritesheet.webp"), pet.Sprite); err != nil {
		return err
	}
	if err := os.RemoveAll(backup); err != nil {
		return err
	}
	if _, statErr := os.Stat(dir); statErr == nil {
		if err := os.Rename(dir, backup); err != nil {
			return err
		}
	}
	if err := os.Rename(staging, dir); err != nil {
		_ = os.Rename(backup, dir)
		return err
	}
	return os.RemoveAll(backup)
}

func writePrivate(path string, body []byte) error {
	return os.WriteFile(path, body, 0o600)
}

func readInstalledPet(dir string) (petView, bool) {
	raw, err := os.ReadFile(filepath.Join(dir, "pet.json"))
	if err != nil {
		return petView{}, false
	}
	manifest, err := validatePetManifest(raw, filepath.Base(dir))
	if err != nil {
		return petView{}, false
	}
	if _, err := os.Stat(filepath.Join(dir, "spritesheet.webp")); err != nil {
		return petView{}, false
	}
	var meta petMeta
	if metaBytes, readErr := os.ReadFile(filepath.Join(dir, "meta.json")); readErr == nil {
		_ = json.Unmarshal(metaBytes, &meta)
	}
	return viewFrom(manifest, meta, "imported"), true
}

func builtinPet(id string) (petView, []byte, error) {
	base := "petdata/builtin/" + id
	raw, err := builtinPetFiles.ReadFile(base + "/pet.json")
	if err != nil {
		return petView{}, nil, errors.New("预置桌宠缺失")
	}
	manifest, err := validatePetManifest(raw, id)
	if err != nil {
		return petView{}, nil, err
	}
	sprite, err := builtinPetFiles.ReadFile(base + "/spritesheet.webp")
	if err != nil {
		return petView{}, nil, errors.New("预置桌宠缺失")
	}
	if err := validatePetSprite(sprite, manifest.SpriteVersionNumber); err != nil {
		return petView{}, nil, err
	}
	var meta petMeta
	if metaBytes, readErr := builtinPetFiles.ReadFile(base + "/meta.json"); readErr == nil {
		_ = json.Unmarshal(metaBytes, &meta)
	}
	return viewFrom(manifest, meta, "builtin"), sprite, nil
}

func viewFrom(manifest petManifest, meta petMeta, origin string) petView {
	return petView{
		ID: manifest.ID, DisplayName: manifest.DisplayName, Description: manifest.Description,
		SpriteVersion: manifest.SpriteVersionNumber, Origin: origin, Author: meta.Author,
		SourceURL: meta.SourceURL, Revision: meta.Revision, SpritesheetURL: "/api/pets/" + manifest.ID + "/spritesheet",
	}
}

func petLock(key string) *sync.Mutex {
	value, _ := petInstallLocks.LoadOrStore(key, &sync.Mutex{})
	return value.(*sync.Mutex)
}
