package system

import (
	"embed"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
)

//go:embed petdata/builtin
var builtinPetFiles embed.FS

var builtinPetOrder = []string{
	"q-ban-da-fei-yu",
	"pet-6ac83c93535081918861d5c78bb9a8fc",
	"pet-6ac97d6e82208191a38e047be23e1293",
	"the-real-tronald-dump",
}

var workspacePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)
var petInstallLocks sync.Map

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
