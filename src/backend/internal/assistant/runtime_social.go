package assistant

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/catalog"
	"beike.local/cloud/src/backend/internal/config"
)

var socialURLPattern = regexp.MustCompile(`(?i)https?://[^\s<>「」『』"，。；！）)]+`)
var analyzePattern = regexp.MustCompile(`分析|挑|筛选|选出|选择|选取|帮我选|封面|主图|构图|配图|海报|设计|根据|按照|适合|需要|想要`)
var collectOnlyPattern = regexp.MustCompile(`(?:只|仅)(?:要|需)?(?:采集|收集|下载|解析)|不(?:要|用)(?:分析|挑选|筛选|调用.*模型)`)

type socialIntent struct {
	urls    []string
	analyze bool
}

func detectSocialIntent(text string) socialIntent {
	seen := map[string]bool{}
	urls := []string{}
	for _, raw := range socialURLPattern.FindAllString(text, -1) {
		parsed, err := url.Parse(raw)
		if err != nil {
			continue
		}
		host := strings.ToLower(parsed.Hostname())
		if host != "xiaohongshu.com" && host != "xhslink.com" && !strings.HasSuffix(host, ".xiaohongshu.com") && !strings.HasSuffix(host, ".xhslink.com") {
			continue
		}
		if seen[raw] {
			continue
		}
		seen[raw] = true
		urls = append(urls, raw)
	}
	instruction := text
	for _, raw := range urls {
		instruction = strings.ReplaceAll(instruction, raw, "")
	}
	collectOnly := collectOnlyPattern.MatchString(instruction)
	analyze := len(urls) == 0 && !collectOnly && analyzePattern.MatchString(instruction)
	return socialIntent{urls: urls, analyze: analyze}
}

func lastUserText(messages []map[string]any) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "user" {
			continue
		}
		if text, ok := messages[i]["content"].(string); ok {
			return text
		}
	}
	return ""
}

type collectedImage struct {
	URL    string `json:"url"`
	Label  string `json:"label"`
	Source string `json:"sourceUrl,omitempty"`
}

func collectSocialImages(r *http.Request, cfg config.Config, urls []string) (images []collectedImage, summaries []string, raws []string, widget map[string]any) {
	seen := map[string]bool{}
	for index, raw := range urls {
		_, body := catalog.ParseSocialRequest(cfg, r, raw)
		encoded, _ := json.Marshal(body)
		raws = append(raws, string(encoded))
		title, _ := body["title"].(string)
		list := stringImages(body["images"])
		if body["success"] == true {
			summaries = append(summaries, "链接 "+strconv.Itoa(index+1)+"："+fallbackText(title, "小红书图集")+"，获取 "+strconv.Itoa(len(list))+" 张图片")
		} else {
			message, _ := body["error"].(string)
			if message == "" {
				message = "采集失败"
			}
			summaries = append(summaries, "链接 "+strconv.Itoa(index+1)+" 采集失败："+message)
		}
		if body["success"] != true {
			continue
		}
		for _, image := range list {
			if seen[image] {
				continue
			}
			seen[image] = true
			images = append(images, collectedImage{URL: image, Label: "素材 " + strconv.Itoa(len(images)+1) + "（链接 " + strconv.Itoa(index+1) + "）", Source: raw})
		}
	}
	if len(images) == 0 {
		return images, summaries, raws, nil
	}
	all := make([]string, len(images))
	for i, image := range images {
		all[i] = image.URL
	}
	title := "小红书采集图集"
	widget = map[string]any{
		"title": title, "imageSources": images, "allImages": all, "mainImages": all,
		"props": map[string]any{"链接数量": strconv.Itoa(len(urls)), "图集数量": strconv.Itoa(len(images))},
	}
	return images, summaries, raws, widget
}

func xhsHost(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "xiaohongshu.com" || host == "xhslink.com" || strings.HasSuffix(host, ".xiaohongshu.com") || strings.HasSuffix(host, ".xhslink.com")
}

func stringImages(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := []string{}
		for _, item := range typed {
			text, _ := item.(string)
			if text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func jsonMarshal(value any) ([]byte, error) { return json.Marshal(value) }

func jsonUnmarshalMap(raw string, dest *map[string]any) error {
	return json.Unmarshal([]byte(raw), dest)
}

func fallbackText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func reusedImages(messages []map[string]any) []collectedImage {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "assistant" {
			continue
		}
		widget, _ := messages[i]["productWidget"].(map[string]any)
		if widget == nil {
			continue
		}
		raw, _ := widget["imageSources"].([]any)
		images := []collectedImage{}
		for _, item := range raw {
			row, _ := item.(map[string]any)
			url, _ := row["url"].(string)
			if url == "" {
				continue
			}
			label, _ := row["label"].(string)
			source, _ := row["sourceUrl"].(string)
			images = append(images, collectedImage{URL: url, Label: label, Source: source})
		}
		if len(images) > 0 {
			return images
		}
	}
	return nil
}
