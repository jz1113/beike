package catalog

import "testing"

func TestParseCategoryPreview(t *testing.T) {
	reports, ok := parseCategoryPreview([]byte(`{`))
	if !ok || reports != nil {
		t.Fatal("无法解析的 JSON 应按空预览继续")
	}
	reports, ok = parseCategoryPreview([]byte(`{"local":[{"parentId":"jewelry"}]}`))
	if !ok || len(reports) != 1 || len(reports[0].Categories) != 0 {
		t.Fatalf("reports %#v ok %v", reports, ok)
	}
	if _, ok := parseCategoryPreview([]byte(`{"local":[{"parentId":"nope"}]}`)); ok {
		t.Fatal("未知父类目应拒绝")
	}
	if _, ok := parseCategoryPreview([]byte(`[]`)); ok {
		t.Fatal("预览请求必须是对象")
	}
}
