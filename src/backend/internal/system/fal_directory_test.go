package system

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestFalDirectoryGroupsOfficialModelsAcrossPages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.URL.Query().Get("limit") != "500" {
			t.Errorf("unexpected directory request: %s", r.URL)
		}
		switch r.URL.Query().Get("page") {
		case "1":
			fmt.Fprint(w, `{"page":1,"pages":2,"total":4,"items":[
				{"id":"google/omni/edit","title":"Gemini Omni Flash Edit","modelLab":"Google","group":{"key":"gemini-omni","label":"Edit"}},
				{"id":"google/omni/v1.2/text-to-video","title":"Gemini Omni Flash 1.2","modelLab":"Google","group":{"key":"gemini-omni-12","label":"Text to Video"}}]}`)
		case "2":
			fmt.Fprint(w, `{"page":2,"pages":2,"total":4,"items":[
				{"id":"google/omni/text-to-video","title":"Gemini Omni Flash Text to Video","modelLab":"Google","group":{"key":"gemini-omni","label":"Text to Video"}},
				{"id":"some-lab/other","title":"Other","category":"text-to-video"}]}`)
		default:
			t.Errorf("unexpected directory page %s", r.URL)
		}
	}))
	defer server.Close()

	models, err := readFalDirectory(context.Background(), server.Client(), server.URL)
	expected := []falDirectoryModel{
		{ID: "group:gemini-omni", Name: "Gemini Omni Flash", Lab: "Google", Endpoints: []falDirectoryEndpoint{
			{ID: "google/omni/edit", Label: "Edit"},
			{ID: "google/omni/text-to-video", Label: "Text to Video"},
		}},
		{ID: "group:gemini-omni-12", Name: "Gemini Omni Flash 1.2", Lab: "Google", Endpoints: []falDirectoryEndpoint{
			{ID: "google/omni/v1.2/text-to-video", Label: "Text to Video"},
		}},
		{ID: "title:some-lab|other", Name: "Other", Endpoints: []falDirectoryEndpoint{
			{ID: "some-lab/other", Label: "Other"},
		}},
	}
	if err != nil || !reflect.DeepEqual(models, expected) {
		t.Fatalf("got %#v, err %v", models, err)
	}
}

func TestFalDirectoryUsesOfficialTitleAndFamilyWithoutInferringModes(t *testing.T) {
	items := []falExploreItem{
		{ID: "fal-ai/longcat-image", Title: "Longcat Image"},
		{ID: "fal-ai/longcat-image/edit", Title: "Longcat Image"},
		{ID: "different/longcat", Title: "Longcat Image"},
		{ID: "alibaba/wan3/reference", Title: "Wan 3.0", ModelFamily: "Wan 3.0"},
		{ID: "alibaba/wan3/text", Title: "Wan Text to Video", ModelFamily: "Wan 3.0"},
	}
	items[3].Group.Key = "Wan30"
	items[4].Group.Key = "Wan30"
	models := groupFalDirectory(items)
	if len(models) != 3 || len(models[0].Endpoints) != 1 || len(models[1].Endpoints) != 2 || models[2].Name != "Wan 3.0" {
		t.Fatalf("unexpected directory: %#v", models)
	}
}

func TestFalDirectoryRejectsIncompleteOrDuplicatePages(t *testing.T) {
	for _, test := range []struct {
		name, secondID string
		total          int
	}{
		{"duplicate", "lab/model", 2},
		{"incomplete", "lab/other", 3},
		{"invalid ID", "lab/../model", 2},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				page, id := 1, "lab/model"
				if r.URL.Query().Get("page") == "2" {
					page, id = 2, test.secondID
				}
				_ = json.NewEncoder(w).Encode(falExplorePage{
					Page: page, Pages: 2, Total: test.total, Items: []falExploreItem{{ID: id}},
				})
			}))
			defer server.Close()
			if _, err := readFalDirectory(context.Background(), server.Client(), server.URL); err == nil {
				t.Fatal("expected invalid directory to fail")
			}
		})
	}
}
