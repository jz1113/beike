package system

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

var selectVideoDirectory = pickVideoDirectory

func cleanVideoDirectory(raw string) (string, error) {
	cleaned := filepath.Clean(strings.TrimSpace(raw))
	if cleaned == "" || cleaned == "." || !filepath.IsAbs(cleaned) {
		return "", errors.New("请选择本机文件夹")
	}
	info, err := os.Stat(cleaned)
	if err != nil || !info.IsDir() {
		return "", errors.New("保存文件夹不存在")
	}
	return filepath.EvalSymlinks(cleaned)
}

func safeVideoDestination(dir, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 240 || name != filepath.Base(name) || strings.ContainsAny(name, `/\:<>"|?*`) || strings.HasPrefix(name, ".") {
		return "", errors.New("文件名不合法")
	}
	for _, character := range name {
		if character < 32 {
			return "", errors.New("文件名不合法")
		}
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".mp4", ".mov", ".webm", ".mkv", ".ogv":
	default:
		return "", errors.New("只允许保存视频文件")
	}
	stem := strings.TrimSuffix(name, filepath.Ext(name))
	if reservedVideoName(stem) {
		return "", errors.New("文件名不合法")
	}
	dest := filepath.Join(dir, name)
	rel, err := filepath.Rel(dir, dest)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("文件名不合法")
	}
	return dest, nil
}

func reservedVideoName(stem string) bool {
	// Windows recognizes device names before the first dot, even when another
	// extension follows. Keep these paths invalid on every host platform.
	stem, _, _ = strings.Cut(stem, ".")
	stem = strings.TrimRight(stem, " ")
	stem = strings.NewReplacer("¹", "1", "²", "2", "³", "3").Replace(stem)
	switch strings.ToLower(stem) {
	case "con", "prn", "aux", "nul":
		return true
	}
	if len(stem) != 4 {
		return false
	}
	prefix := strings.ToLower(stem[:3])
	digit := stem[3]
	return (prefix == "com" || prefix == "lpt") && digit >= '1' && digit <= '9'
}

func videoConcurrency(value int) (int, bool) {
	switch value {
	case 0, 100:
		return 100, true
	default:
		return 0, false
	}
}

func pickVideoDirectory(ctx context.Context) (string, error) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.CommandContext(ctx, "osascript", "-e", `POSIX path of (choose folder with prompt "选择视频保存文件夹")`)
	case "windows":
		script := `Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择视频保存文件夹'; if ($dialog.ShowDialog() -ne 'OK') { exit 1 }; $dialog.SelectedPath`
		command = exec.CommandContext(ctx, "powershell", "-NoProfile", "-STA", "-Command", script)
	default:
		command = exec.CommandContext(ctx, "zenity", "--file-selection", "--directory", "--title=选择视频保存文件夹")
	}
	output, err := command.Output()
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", context.Canceled
		}
		return "", errors.New("已取消选择文件夹")
	}
	return cleanVideoDirectory(string(output))
}
