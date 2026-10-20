package system

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestParsePetCommandsRejectsShellAndLimitsBatch(t *testing.T) {
	parsed, err := parsePetCommands("\n npx codex-pets add tiny-dino \r\nnpx codex-pets add-collection cats\n")
	if err != nil || len(parsed) != 2 || parsed[0].id != "tiny-dino" || parsed[1].err == "" {
		t.Fatalf("parsed %#v %v", parsed, err)
	}
	lines := make([]string, 21)
	for index := range lines {
		lines[index] = "npx codex-pets add tiny-dino"
	}
	if _, err := parsePetCommands(strings.Join(lines, "\n")); err == nil {
		t.Fatal("expected a batch limit")
	}
	if _, err := parsePetCommands("   "); err == nil {
		t.Fatal("expected an empty command error")
	}
}

func TestPetPackageRejectsTraversalAndWrongIdentity(t *testing.T) {
	if _, _, err := extractPetPackage(petArchive(t, map[string]string{"../pet.json": "{}"}), "tiny-dino"); err == nil {
		t.Fatal("expected traversal to fail")
	}
	manifest := `{"id":"other-pet","displayName":"Other","description":"","spritesheetPath":"spritesheet.webp","spriteVersionNumber":2}`
	if _, _, err := extractPetPackage(petArchive(t, map[string]string{"pet.json": manifest, "spritesheet.webp": "sprite-v2"}), "tiny-dino"); err == nil {
		t.Fatal("expected an id mismatch")
	}
	if err := validatePetSprite([]byte("not-a-webp"), 2); err == nil {
		t.Fatal("expected an invalid sprite")
	}
}

func TestTrustedPetURLStaysOnSource(t *testing.T) {
	if _, err := trustedPetURL("https://codex-pets.net", "https://evil.example/pet.zip"); err == nil {
		t.Fatal("expected a foreign host to fail")
	}
	if _, err := trustedPetURL("https://codex-pets.net", "http://codex-pets.net/pet.zip"); err == nil {
		t.Fatal("expected a downgrade to fail")
	}
	resolved, err := trustedPetURL("https://codex-pets.net", "/api/pets/tiny-dino/download")
	if err != nil || resolved.String() != "https://codex-pets.net/api/pets/tiny-dino/download" {
		t.Fatalf("resolved %v %v", resolved, err)
	}
}

func TestBuiltinPetsAreCompleteAtlases(t *testing.T) {
	for _, id := range builtinPetOrder {
		view, sprite, err := builtinPet(id)
		if err != nil {
			t.Fatal(err)
		}
		if view.Origin != "builtin" || view.SpriteVersion != 2 || view.Author == "" || view.SourceURL == "" || len(sprite) < 1000 {
			t.Fatalf("builtin %#v (%d bytes)", view, len(sprite))
		}
	}
}

func TestImportPetsKeepsPartialResultsAndWorkspaces(t *testing.T) {
	previous := inspectPetSprite
	inspectPetSprite = func(data []byte, version int) error {
		if string(data) == "sprite-v2" && version == 2 {
			return nil
		}
		return os.ErrInvalid
	}
	t.Cleanup(func() { inspectPetSprite = previous })
	var description string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/pets/tiny-dino/share-data":
			_ = json.NewEncoder(w).Encode(map[string]any{"pet": map[string]any{
				"id": "tiny-dino", "downloadUrl": "http://" + r.Host + "/api/pets/tiny-dino/download?v=9", "ownerHandle": "ada",
			}})
		case "/api/pets/tiny-dino/download":
			w.Write(petArchive(t, map[string]string{
				"pet.json":         `{"id":"tiny-dino","displayName":"Tiny","description":"` + description + `","spritesheetPath":"spritesheet.webp","spriteVersionNumber":2,"kind":"creature"}`,
				"spritesheet.webp": "sprite-v2",
				"poster.webp":      "ignored",
			}))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	previousSource := openPetSource
	openPetSource = func() petSource {
		source := petSource{Base: server.URL, Client: server.Client()}
		source.Client.CheckRedirect = source.redirect
		return source
	}
	t.Cleanup(func() { openPetSource = previousSource })
	description = "first"
	cfg := config.Config{Root: t.TempDir()}
	commands := "npx codex-pets add tiny-dino\nnpx codex-pets add missing-pet\nnpx codex-pets add tiny-dino && rm -rf /\nnpx codex-pets add tiny-dino"
	alpha := importWithWorkspace(t, cfg, "alpha", commands)
	if len(alpha) != 4 || !alpha[0].OK || alpha[0].Pet.Origin != "imported" || alpha[1].OK || alpha[2].OK || !alpha[3].OK {
		t.Fatalf("results %#v", alpha)
	}
	if alpha[0].Pet.Description != "first" || alpha[3].Pet.Description != "first" {
		t.Fatalf("duplicate import changed the pet: %#v", alpha)
	}
	description = "second"
	again := importWithWorkspace(t, cfg, "alpha", "npx codex-pets add tiny-dino")
	if len(again) != 1 || again[0].Pet.Description != "second" {
		t.Fatalf("reimport %#v", again)
	}
	beta := listWithWorkspace(t, cfg, "beta")
	for _, pet := range beta {
		if pet.Origin == "imported" {
			t.Fatalf("workspace leak %#v", pet)
		}
	}
	alphaPets := listWithWorkspace(t, cfg, "alpha")
	found := false
	for _, pet := range alphaPets {
		if pet.ID == "tiny-dino" && pet.Origin == "imported" && pet.Author == "ada" && pet.Revision == "9" {
			found = true
		}
	}
	if !found {
		t.Fatalf("imported pet missing %#v", alphaPets)
	}
	sheet := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/pets/tiny-dino/spritesheet", nil)
	request = request.WithContext(httpx.WithWorkspace(request.Context(), "alpha"))
	request.SetPathValue("id", "tiny-dino")
	PetSpritesheet(cfg).ServeHTTP(sheet, request)
	if sheet.Code != http.StatusOK || sheet.Body.String() != "sprite-v2" || sheet.Header().Get("Content-Type") != "image/webp" {
		t.Fatalf("sheet %d %s", sheet.Code, sheet.Body.String())
	}
	if _, err := os.Stat(filepath.Join(cfg.Root, ".local", "pets", "beta", "tiny-dino")); !os.IsNotExist(err) {
		t.Fatal("beta workspace should not contain the imported pet")
	}
}

func importWithWorkspace(t *testing.T, cfg config.Config, workspace, commands string) []petImportResult {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/pets/import", strings.NewReader(`{"commands":`+jsonString(commands)+`}`))
	request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
	ImportPets(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("import status %d %s", response.Code, response.Body.String())
	}
	var body struct {
		Results []petImportResult `json:"results"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Results
}

func listWithWorkspace(t *testing.T, cfg config.Config, workspace string) []petView {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/pets", nil)
	request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
	Pets(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("list status %d %s", response.Code, response.Body.String())
	}
	var body struct {
		Pets []petView `json:"pets"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Pets
}

func petArchive(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, body := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func jsonString(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
