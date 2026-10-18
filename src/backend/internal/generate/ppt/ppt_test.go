package ppt

import (
	"testing"
)

func TestParseMarkdownOutline(t *testing.T) {
	md := `# Part 1: 背景
## 封面：新一代 AI 演示革命
- 副标题：颠覆传统 PPT 排版
- 汇报人：方案架构师

## 算力极限打破传统模型扩张路径
- 芯片功耗年增 45%
- 单点边际效应递减
`

	pages := parseMarkdownOutline(md)
	if len(pages) != 2 {
		t.Fatalf("expected 2 pages, got %d", len(pages))
	}

	p1 := pages[0]
	if p1["title"] != "封面：新一代 AI 演示革命" {
		t.Errorf("unexpected title: %v", p1["title"])
	}
	if p1["part"] != "Part 1: 背景" {
		t.Errorf("unexpected part: %v", p1["part"])
	}
	points1, ok := p1["points"].([]string)
	if !ok || len(points1) != 2 {
		t.Errorf("expected 2 points for page 1, got %v", points1)
	}

	p2 := pages[1]
	if p2["title"] != "算力极限打破传统模型扩张路径" {
		t.Errorf("unexpected title: %v", p2["title"])
	}
}

func TestParseNarrationSlides(t *testing.T) {
	text := `
=== SLIDE 1 ===
大家好，欢迎来到今天的分享...
=== SLIDE 2 ===
我们现在看第二页的核心突破...
`
	result := parseNarrationSlides(text)
	if len(result) != 2 {
		t.Fatalf("expected 2 slide narrations, got %d", len(result))
	}
	if result["1"] != "大家好，欢迎来到今天的分享..." {
		t.Errorf("unexpected narration for slide 1: %s", result["1"])
	}
	if result["2"] != "我们现在看第二页的核心突破..." {
		t.Errorf("unexpected narration for slide 2: %s", result["2"])
	}
}

func TestParseDetailPagesObjectAndArray(t *testing.T) {
	fromObject := parseDetailPages(`{"pages":[{"pageIndex":1,"title":"封面"}]}`)
	fromArray := parseDetailPages(`[{"pageIndex":2,"title":"正文"}]`)
	if len(fromObject) != 1 || fromObject[0]["title"] != "封面" {
		t.Fatalf("object parse %#v", fromObject)
	}
	if len(fromArray) != 1 || fromArray[0]["title"] != "正文" {
		t.Fatalf("array parse %#v", fromArray)
	}
}
