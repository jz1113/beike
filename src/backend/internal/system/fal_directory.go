package system

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

const falExploreDirectory = "https://fal.ai/api/models"
const falExplorePageSize = 500

type falExploreItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	ModelLab    string `json:"modelLab"`
	ModelFamily string `json:"modelFamily"`
	Group       struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	} `json:"group"`
	Discovery struct {
		Lab     string `json:"lab"`
		Family  string `json:"family"`
		Version string `json:"version"`
		Variant string `json:"variant"`
	} `json:"discovery"`
}

type falExplorePage struct {
	Items []falExploreItem `json:"items"`
	Page  int              `json:"page"`
	Pages int              `json:"pages"`
	Total int              `json:"total"`
}

type falDirectoryEndpoint struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type falDirectoryModel struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Lab          string                 `json:"lab"`
	Endpoints    []falDirectoryEndpoint `json:"endpoints"`
	VideoModelID string                 `json:"videoModelId,omitempty"`
}

func FalDirectory() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		models, err := readFalDirectory(ctx, network.SafeClient(), falExploreDirectory)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]string{"error": "fal 官方目录暂时无法完整拉取，请重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"models": models, "fetchedAt": time.Now().UTC()})
	})
}

var falEndpointID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*(/[a-zA-Z0-9][a-zA-Z0-9._-]*)+$`)

func readFalDirectory(ctx context.Context, client *http.Client, source string) ([]falDirectoryModel, error) {
	first, err := readFalExplorePage(ctx, client, source, 1)
	if err != nil {
		return nil, err
	}
	if first.Page != 1 || first.Pages < 1 || first.Pages > 32 || first.Total < 1 {
		return nil, errors.New("invalid fal catalog pagination")
	}
	items := first.Items
	for page := 2; page <= first.Pages; page++ {
		next, err := readFalExplorePage(ctx, client, source, page)
		if err != nil {
			return nil, err
		}
		if next.Page != page || next.Pages != first.Pages || next.Total != first.Total {
			return nil, errors.New("fal catalog changed during pagination")
		}
		items = append(items, next.Items...)
	}
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if !falEndpointID.MatchString(item.ID) || seen[item.ID] {
			return nil, errors.New("invalid or duplicate fal endpoint")
		}
		seen[item.ID] = true
	}
	if len(items) != first.Total {
		return nil, errors.New("incomplete fal catalog")
	}
	return groupFalDirectory(items), nil
}

func readFalExplorePage(ctx context.Context, client *http.Client, source string, page int) (falExplorePage, error) {
	var result falExplorePage
	address := fmt.Sprintf("%s?limit=%d&page=%d", source, falExplorePageSize, page)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return result, err
	}
	request.Header.Set("Accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return result, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return result, fmt.Errorf("fal catalog status %d", response.StatusCode)
	}
	err = json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&result)
	return result, err
}

func (item falExploreItem) lab() string {
	return firstTextValue(item.ModelLab, item.Discovery.Lab)
}

func (item falExploreItem) groupID() string {
	if key := strings.TrimSpace(item.Group.Key); key != "" {
		return "group:" + key
	}
	family := strings.TrimSpace(item.ModelFamily)
	if item.Discovery.Version != "" || item.Discovery.Variant != "" {
		family = firstTextValue(family, item.Discovery.Family)
	}
	if family != "" {
		lab := firstTextValue(item.lab(), strings.SplitN(item.ID, "/", 2)[0])
		return "model:" + strings.ToLower(strings.Join([]string{lab, family, item.Discovery.Version, item.Discovery.Variant}, "|"))
	}
	if title := strings.Join(strings.Fields(item.Title), " "); title != "" {
		lab := firstTextValue(item.lab(), strings.SplitN(item.ID, "/", 2)[0])
		return "title:" + strings.ToLower(lab+"|"+title)
	}
	return "endpoint:" + item.ID
}

func groupFalDirectory(items []falExploreItem) []falDirectoryModel {
	groups := make(map[string][]falExploreItem)
	for _, item := range items {
		key := item.groupID()
		groups[key] = append(groups[key], item)
	}
	models := make([]falDirectoryModel, 0, len(groups))
	for key, members := range groups {
		sort.Slice(members, func(i, j int) bool { return members[i].ID < members[j].ID })
		model := falDirectoryModel{ID: key, Name: falDirectoryName(members)}
		endpoints := make(map[string]bool, len(members))
		for _, item := range members {
			endpoints[item.ID] = true
			if model.Lab == "" {
				model.Lab = item.lab()
			}
			model.Endpoints = append(model.Endpoints, falDirectoryEndpoint{
				ID: item.ID, Label: firstTextValue(item.Group.Label, item.Title, item.ID),
			})
		}
		for _, release := range falVideoReleases {
			if release.available(endpoints) {
				model.VideoModelID = release.model
				break
			}
		}
		models = append(models, model)
	}
	sort.Slice(models, func(i, j int) bool {
		a, b := strings.ToLower(models[i].Name), strings.ToLower(models[j].Name)
		if a == b {
			return models[i].ID < models[j].ID
		}
		return a < b
	})
	return models
}

func falDirectoryName(items []falExploreItem) string {
	first := items[0]
	prefix := strings.Fields(first.Title)
	families := make(map[string]string)
	for _, item := range items {
		if family := strings.TrimSpace(item.ModelFamily); strings.IndexFunc(family, unicode.IsLetter) >= 0 {
			families[strings.ToLower(family)] = family
		}
	}
	for _, item := range items[1:] {
		words := strings.Fields(item.Title)
		n := 0
		for n < len(prefix) && n < len(words) && strings.EqualFold(prefix[n], words[n]) {
			n++
		}
		prefix = prefix[:n]
	}
	title := strings.Join(prefix, " ")
	if len(items) == 1 {
		return firstTextValue(title, first.ModelFamily, first.ID)
	}
	for key, family := range families {
		if len(families) == 1 && !strings.Contains(strings.ToLower(title), key) {
			return family
		}
	}
	if len(prefix) > 1 || (title != "" && allFalTitlesMatch(items, title)) {
		return title
	}
	return firstTextValue(first.Group.Key, first.ModelFamily, first.Title, first.ID)
}

func allFalTitlesMatch(items []falExploreItem, title string) bool {
	for _, item := range items {
		if !strings.EqualFold(strings.Join(strings.Fields(item.Title), " "), title) {
			return false
		}
	}
	return true
}
