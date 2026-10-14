package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"github.com/xuri/excelize/v2"
)

func buildTextMatrix(cfg config.Config, r *http.Request, payload map[string]any) (string, map[string][]byte, string, int) {
	products, ok := payload["products"].([]any)
	if !ok || len(products) == 0 || !matrixTextOnly(cfg, products) {
		return "", nil, "", 0
	}
	single := payload["singleProductExport"] == true && len(products) == 1
	files := map[string][]byte{}
	used := map[string]struct{}{}
	var rows [][]string
	var singleName string
	var items []matrixSummaryItem
	succeeded := 0
	failed := 0
	for index, item := range products {
		product := item.(map[string]any)
		productID := strings.TrimSpace(exportString(product, "skuId"))
		if productID == "" {
			productID = "商品_" + itoa(index+1)
		}
		group := strings.TrimSpace(exportString(product, "promptAssetGroupName"))
		if group == "" {
			group = "未绑定图组"
		}
		title := strings.TrimSpace(exportString(product, "copywritingTitle"))
		folder := uniqueMatrixFolder(matrixFolderName(group, productID, title), used)
		if single {
			singleName = folder
			folder = ""
		}
		copy := formatMatrixCopy(exportString(product, "copywritingContent"))
		if copy != "" {
			files[joinMatrixPath(folder, "文案.txt")] = []byte(copy)
		}
		links := []string{"", "", "", ""}
		shots, ok := matrixDataShots(cfg, product["images"].([]any))
		if !ok {
			return "", nil, "", 0
		}
		for _, shot := range []int{1, 2, 3, 4} {
			image, exists := shots[shot]
			if !exists {
				continue
			}
			body, _, err := readExportMedia(cfg, r, image.raw, false)
			sniffed, sniffedOK := sniffedImageExt(body)
			if err != nil || !sniffedOK {
				note := joinMatrixPath(folder, "图"+itoa(shot)+".error.txt")
				files[note] = []byte(matrixFailureNote(image.raw, err))
				items = append(items, matrixSummaryItem{Filename: "图" + itoa(shot) + ".error.txt", Status: "failure", Error: matrixFailureReason(image.raw, err)})
				failed++
				continue
			}
			imageName := "图" + itoa(shot) + "." + sniffed
			files[joinMatrixPath(folder, imageName)] = body
			items = append(items, matrixSummaryItem{Filename: imageName, Status: "success"})
			succeeded++
			links[shot-1] = matrixPublicLink(image.original, image.raw)
		}
		name := strings.TrimSpace(exportString(product, "title"))
		if name == "" {
			name = strings.TrimSpace(exportString(product, "productTitle"))
		}
		rows = append(rows, []string{
			name, strings.TrimSpace(exportString(product, "category")), productID,
			links[0], links[1], links[2], links[3], title, copy, group,
		})
	}
	if succeeded == 0 {
		if failed == 0 {
			return "", nil, "没有可打包的媒体素材", http.StatusBadRequest
		}
		return "", nil, "所有媒体文件均未能下载，请检查文件地址后重试", http.StatusBadGateway
	}
	filename := singleName
	if !single {
		filename = sanitizeExportName(exportString(payload, "batchTitle"), "贝壳云图_批量生图矩阵")
		sheet, err := matrixSheet(rows)
		if err != nil {
			return "", nil, "", 0
		}
		files["生成成果清单.xlsx"] = sheet
	}
	if failed > 0 {
		files["导出结果.txt"] = []byte("下载成功：" + itoa(succeeded) + " 项\n下载失败：" + itoa(failed) + " 项")
		summary, err := json.MarshalIndent(matrixSummary{Total: succeeded + failed, Succeeded: succeeded, Failed: failed, Items: items, Partial: true}, "", "  ")
		if err != nil {
			return "", nil, "", 0
		}
		files["export-summary.json"] = summary
	}
	return filename, files, "", 0
}

func matrixTextOnly(cfg config.Config, products []any) bool {
	for _, item := range products {
		product, ok := item.(map[string]any)
		if !ok {
			return false
		}
		images, ok := product["images"].([]any)
		if !ok {
			return false
		}
		if _, ok := matrixDataShots(cfg, images); !ok {
			return false
		}
	}
	return true
}

type matrixImage struct {
	raw      string
	original string
}

func matrixDataShots(cfg config.Config, images []any) (map[int]matrixImage, bool) {
	shots := map[int]matrixImage{}
	for index, image := range images {
		shot := index + 1
		var raw, original string
		switch value := image.(type) {
		case string:
			raw = value
		case map[string]any:
			text, ok := value["url"].(string)
			if !ok {
				return nil, false
			}
			raw = text
			original, _ = value["originalUrl"].(string)
			if number, ok := wholeNumber(value["shotNo"]); ok {
				shot = number
			}
		default:
			return nil, false
		}
		if shot < 1 || shot > 4 {
			continue
		}
		if !matrixImageSource(cfg, raw) {
			return nil, false
		}
		shots[shot] = matrixImage{raw: raw, original: original}
	}
	return shots, true
}

func matrixImageSource(cfg config.Config, raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" || (strings.HasPrefix(raw, "data:") && !strings.HasPrefix(raw, "data:image/")) {
		return false
	}
	if strings.HasPrefix(raw, "data:image/") || strings.HasPrefix(raw, "/storage/") || strings.HasPrefix(raw, "blob:") {
		return true
	}
	err := exportRemoteRefusal(cfg, normalizeExportRemote(raw))
	return err == nil || exportFailureKept(err.Error())
}

type matrixSummary struct {
	Total     int                 `json:"total"`
	Succeeded int                 `json:"succeeded"`
	Failed    int                 `json:"failed"`
	Items     []matrixSummaryItem `json:"items"`
	Partial   bool                `json:"partial"`
}

type matrixSummaryItem struct {
	Filename string `json:"filename"`
	Status   string `json:"status"`
	Error    string `json:"error,omitempty"`
}

func matrixFailureReason(raw string, err error) string {
	if err != nil {
		text := err.Error()
		if exportFailureKept(text) {
			return text
		}
		if strings.HasPrefix(raw, "/storage/") {
			return "本地媒体文件不存在或不在允许的媒体目录"
		}
		if strings.HasPrefix(raw, "data:") {
			return "媒体数据格式无效"
		}
	}
	return "下载内容不是有效图片或视频文件"
}

func matrixFailureSource(raw string) string {
	if strings.HasPrefix(raw, "data:") {
		return "内嵌素材 data URL（" + itoa(len([]rune(raw))) + " 字符）"
	}
	if len(raw) > 2048 {
		return raw[:2048] + "…（链接过长，后续已省略）"
	}
	return raw
}

func matrixFailureNote(raw string, err error) string {
	return matrixFailureReason(raw, err) + "\n原始URL: " + matrixFailureSource(raw)
}

func matrixPublicLink(original, raw string) string {
	for _, candidate := range []string{original, raw} {
		if strings.HasPrefix(candidate, "https://") || strings.HasPrefix(candidate, "http://") {
			return candidate
		}
	}
	return ""
}

func sniffedImageExt(body []byte) (string, bool) {
	if len(body) >= 8 && bytes.Equal(body[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		return "png", true
	}
	if len(body) >= 3 && body[0] == 0xff && body[1] == 0xd8 && body[2] == 0xff {
		return "jpg", true
	}
	if len(body) >= 6 && (bytes.HasPrefix(body, []byte("GIF87a")) || bytes.HasPrefix(body, []byte("GIF89a"))) {
		return "gif", true
	}
	if len(body) >= 12 && bytes.Equal(body[:4], []byte("RIFF")) && bytes.Equal(body[8:12], []byte("WEBP")) {
		return "webp", true
	}
	return "", false
}

func matrixSheet(rows [][]string) ([]byte, error) {
	file := excelize.NewFile()
	defer file.Close()
	const sheet = "生成成果清单"
	if err := file.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}
	headers := []string{"商品名称", "商品类目", "商品id", "生成图片链接1", "生成图片链接2", "生成图片链接3", "生成图片链接4", "标题", "文案", "对应生成的提示词资产分组组名"}
	if err := file.SetSheetRow(sheet, "A1", &headers); err != nil {
		return nil, err
	}
	for index, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, index+2)
		if err != nil {
			return nil, err
		}
		if err := file.SetSheetRow(sheet, cell, &row); err != nil {
			return nil, err
		}
	}
	var buffer bytes.Buffer
	if err := file.Write(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func matrixFolderName(groupName, productID, generatedTitle string) string {
	group := matrixFilePart(groupName, 48)
	if group == "" {
		group = "未绑定图组"
	}
	id := matrixFilePart(productID, 72)
	if id == "" {
		id = "未知商品"
	}
	title := matrixFilePart(generatedTitle, 100)
	if title == "" {
		return group + "---" + id
	}
	return group + "---" + id + "-" + title
}

func uniqueMatrixFolder(name string, used map[string]struct{}) string {
	candidate := name
	for number := 2; ; number++ {
		if _, exists := used[candidate]; !exists {
			used[candidate] = struct{}{}
			return candidate
		}
		candidate = name + "-" + itoa(number)
	}
}

func matrixFilePart(value string, maxBytes int) string {
	clean := matrixUnsafe.ReplaceAllString(value, "_")
	clean = strings.Join(strings.Fields(clean), " ")
	clean = strings.Trim(clean, ". ")
	var result []rune
	bytesUsed := 0
	for _, char := range clean {
		size := len(string(char))
		if bytesUsed+size > maxBytes {
			break
		}
		result = append(result, char)
		bytesUsed += size
	}
	return strings.TrimRight(string(result), ". ")
}

func formatMatrixCopy(content string) string {
	normalized := strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	normalized = strings.TrimSpace(strings.ReplaceAll(normalized, "\u00a0", " "))
	if normalized == "" {
		return ""
	}
	var paragraphs []string
	for _, line := range matrixLines.Split(normalized, -1) {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len([]rune(line)) <= 120 {
			paragraphs = append(paragraphs, line)
			continue
		}
		sentences := matrixSentences.FindAllString(line, -1)
		if len(sentences) == 0 {
			sentences = []string{line}
		}
		paragraph := ""
		for _, sentence := range sentences {
			if paragraph != "" && len([]rune(paragraph))+len([]rune(sentence)) > 120 {
				paragraphs = append(paragraphs, strings.TrimSpace(paragraph))
				paragraph = ""
			}
			paragraph += sentence
		}
		if strings.TrimSpace(paragraph) != "" {
			paragraphs = append(paragraphs, strings.TrimSpace(paragraph))
		}
	}
	return strings.Join(paragraphs, "\n\n")
}

func joinMatrixPath(folder, name string) string {
	if folder == "" {
		return name
	}
	return folder + "/" + name
}

var matrixUnsafe = regexp.MustCompile(`[\x00-\x1f\x7f\\/:*?"<>|]`)
var matrixLines = regexp.MustCompile(`\n+`)
var matrixSentences = regexp.MustCompile(`[^。！？!?]*[。！？!?]+|[^。！？!?]+$`)
