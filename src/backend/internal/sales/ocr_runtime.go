package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
)

var errRuntimeMissing = errors.New("OCR runtime missing; run pnpm setup:ocr")

func ocrDataDir(cfg config.Config) string {
	if dir := cfg.DataDir(); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "com.azhuo.workbench")
	case "windows":
		return filepath.Join(os.Getenv("APPDATA"), "com.azhuo.workbench")
	default:
		return filepath.Join(home, ".local", "share", "com.azhuo.workbench")
	}
}

// limitedBuffer keeps third-party diagnostics and subprocess output bounded.
type limitedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, errors.New("OCR output limit exceeded")
	}
	return b.Buffer.Write(p)
}

func runOCR(ctx context.Context, cfg config.Config, data []byte) (ocrResult, error) {
	python := strings.TrimSpace(os.Getenv("OCR_PYTHON"))
	if python == "" {
		suffix := filepath.Join("bin", "python")
		if runtime.GOOS == "windows" {
			suffix = filepath.Join("Scripts", "python.exe")
		}
		python = filepath.Join(ocrDataDir(cfg), "ocr-runtime", suffix)
	}
	script := filepath.Join(cfg.Root, "tools", "scripts", "ocr", "recognize.py")
	if _, err := exec.LookPath(python); err != nil {
		return ocrResult{}, errRuntimeMissing
	}
	command := exec.CommandContext(ctx, python, script)
	command.Stdin = bytes.NewReader(data)
	output, diagnostics := &limitedBuffer{limit: 4 << 20}, &limitedBuffer{limit: 16 << 10}
	command.Stdout, command.Stderr = output, diagnostics
	if err := command.Run(); err != nil {
		if strings.Contains(diagnostics.String(), "ModuleNotFoundError") {
			return ocrResult{}, errRuntimeMissing
		}
		return ocrResult{}, fmt.Errorf("OCR: %w: %s", err, diagnostics.String())
	}
	var result ocrResult
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		return result, err
	}
	if result.Engine != engineRevision || result.Width <= 0 || result.Height <= 0 || result.Lines == nil {
		return result, errors.New("invalid OCR response")
	}
	return result, nil
}
