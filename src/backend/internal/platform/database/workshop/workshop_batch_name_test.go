package workshop

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestWorkshopBatchNaming(t *testing.T) {
	for _, name := range []string{"", "未命名新批次", "未命名批次"} {
		if got := workshopBatchName("batch_a12345", name, "2026-10-01T23:00:00.000Z"); got != "电商图片 · 20261002 · A12345" {
			t.Fatalf("unexpected default name: %s", got)
		}
	}
	if got := workshopBatchName("batch_a12345", "未命名的秋季方案", "2026-10-01T00:00:00Z"); got != "未命名的秋季方案" {
		t.Fatalf("custom name changed: %s", got)
	}
}

func TestWorkshopBatchCopyNameFitsContract(t *testing.T) {
	source := WorkshopBatchRow{Name: strings.Repeat("图", 120)}
	name := workshopBatchCopyName(source)
	if utf8.RuneCountInString(name) != 120 || !strings.HasSuffix(name, "（副本）") {
		t.Fatalf("invalid copy name: %s", name)
	}
	source.Name = name
	if got := workshopBatchCopyName(source); got != name {
		t.Fatalf("copy suffix accumulated: %s", got)
	}
}
