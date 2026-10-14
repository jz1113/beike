package extract

import (
	"bytes"
	"strconv"
	"strings"
	"unicode"

	"github.com/xuri/excelize/v2"
)

const (
	sheetLimit     = 50
	sheetCellLimit = 200_000
	bookCellLimit  = 1_000_000
)

func spreadsheetText(data []byte) (string, int, string) {
	if status, message := inspectOfficeZip(data); message != "" {
		return "", status, message
	}
	book, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return "", 422, "文档解析失败，请检查格式后重试"
	}
	defer book.Close()
	names := book.GetSheetList()
	if len(names) > sheetLimit {
		return "", 413, "工作表过多（>50），请拆分文件后上传"
	}
	parts := []string{}
	total := 0
	for _, name := range names {
		cells, ok := sheetCellCount(book, name)
		if ok {
			total += cells
			if cells < 1 || cells > sheetCellLimit || total > bookCellLimit {
				return "", 413, "工作表范围过大，请删除多余空白行列或拆分文件后上传"
			}
		}
		rows, err := book.GetRows(name)
		if err != nil {
			return "", 422, "文档解析失败，请检查格式后重试"
		}
		csv := sheetCSV(rows)
		if csv == "" {
			continue
		}
		parts = append(parts, "--- 工作表: "+name+" ---\n"+csv)
	}
	return strings.Join(parts, "\n\n"), 0, ""
}

func sheetCellCount(book *excelize.File, name string) (int, bool) {
	dimension, err := book.GetSheetDimension(name)
	if err != nil || dimension == "" {
		return 0, false
	}
	start, end, ok := strings.Cut(dimension, ":")
	if !ok {
		end = start
	}
	startCol, startRow := cellRef(start)
	endCol, endRow := cellRef(end)
	if startCol == 0 || startRow == 0 || endCol < startCol || endRow < startRow {
		return 0, false
	}
	return (endCol - startCol + 1) * (endRow - startRow + 1), true
}

func cellRef(ref string) (int, int) {
	letters := 0
	i := 0
	for i < len(ref) && unicode.IsLetter(rune(ref[i])) {
		letters = letters*26 + int(unicode.ToUpper(rune(ref[i]))-'A'+1)
		i++
	}
	row, _ := strconv.Atoi(ref[i:])
	return letters, row
}

func sheetCSV(rows [][]string) string {
	lines := []string{}
	for _, row := range rows {
		if rowEmpty(row) {
			continue
		}
		cells := make([]string, len(row))
		for i, cell := range row {
			cells[i] = csvCell(cell)
		}
		lines = append(lines, strings.Join(cells, ","))
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func rowEmpty(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

func csvCell(value string) string {
	if strings.ContainsAny(value, ",\"\n\r") {
		return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
	}
	return value
}
