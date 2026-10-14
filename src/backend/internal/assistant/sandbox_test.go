package assistant

import (
	"strings"
	"testing"
	"time"
)

func TestSandboxPrintAndTimeout(t *testing.T) {
	output, err := RunSandbox("console.log(input.name)", map[string]any{"name": "贝壳"}, time.Second)
	if err != nil || len(output) != 1 || output[0] != "贝壳" {
		t.Fatalf("output %v err %v", output, err)
	}
	if _, err := RunSandbox(strings.Repeat("a", 32001), nil, time.Second); err == nil || !strings.Contains(err.Error(), "32000") {
		t.Fatalf("length %v", err)
	}
	if _, err := RunSandbox("while (true) {}", nil, 50*time.Millisecond); err == nil || !strings.Contains(err.Error(), "沙箱执行超时") {
		t.Fatalf("timeout %v", err)
	}
}
