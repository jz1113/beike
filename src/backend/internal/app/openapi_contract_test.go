package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNativeRoutesAreInOpenAPI(t *testing.T) {
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "src/shared/contracts/openapi.yaml")); statErr == nil {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("找不到 src/shared/contracts/openapi.yaml")
		}
		dir = parent
	}
	raw, err := os.ReadFile(filepath.Join(dir, "src/shared/contracts/openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	spec := string(raw)
	for _, pattern := range NativePatterns() {
		method, path, ok := strings.Cut(pattern, " ")
		if !ok {
			t.Fatalf("路由格式不正确: %s", pattern)
		}
		quoted := "  '" + path + "':"
		plain := "  " + path + ":"
		index := strings.Index(spec, quoted)
		if index < 0 {
			index = strings.Index(spec, plain)
		}
		if index < 0 {
			t.Errorf("OpenAPI 缺少 %s", path)
			continue
		}
		section := spec[index:]
		if next := strings.Index(section[1:], "\n  /"); next >= 0 {
			section = section[:next+1]
		}
		if !strings.Contains(section, "\n    "+strings.ToLower(method)+":") {
			t.Errorf("OpenAPI 的 %s 缺少 %s", path, method)
		}
	}
}
