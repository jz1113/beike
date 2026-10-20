package system

import (
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

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
