package assistant

import (
	"bytes"
	"encoding/binary"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/richardlehane/mscfb"
)

func xlsText(data []byte) (string, int, string) {
	reader, err := mscfb.New(bytes.NewReader(data))
	if err != nil {
		return "", 422, "旧版 .xls 解析失败，请另存为 .xlsx 后再上传"
	}
	var book []byte
	for {
		file, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", 422, "旧版 .xls 解析失败，请另存为 .xlsx 后再上传"
		}
		if file.Name != "Workbook" && file.Name != "Book" {
			continue
		}
		book, err = io.ReadAll(io.LimitReader(file, 50<<20))
		if err != nil || len(book) == 0 {
			return "", 422, "旧版 .xls 解析失败，请另存为 .xlsx 后再上传"
		}
		break
	}
	if len(book) == 0 {
		return "", 422, "旧版 .xls 解析失败，请另存为 .xlsx 后再上传"
	}
	names, rows, status, message := biffSheets(book)
	if message != "" {
		return "", status, message
	}
	parts := []string{}
	for i, name := range names {
		if i >= len(rows) {
			break
		}
		csv := sheetCSV(rows[i])
		if csv == "" {
			continue
		}
		parts = append(parts, "--- 工作表: "+name+" ---\n"+csv)
	}
	return strings.Join(parts, "\n\n"), 0, ""
}

func biffSheets(book []byte) ([]string, [][][]string, int, string) {
	records := biffRecords(book)
	stringsTable := []string{}
	names := []string{}
	sheets := [][][]string{}
	var current [][]string
	cells := 0
	for _, record := range records {
		switch record.kind {
		case 0x00FC:
			stringsTable = biffStrings(record.data)
		case 0x0085:
			if name := biffSheetName(record.data); name != "" {
				names = append(names, name)
			}
		case 0x0809:
			if len(record.data) >= 4 && binary.LittleEndian.Uint16(record.data[2:4]) == 0x0010 {
				if current != nil {
					sheets = append(sheets, current)
				}
				current = [][]string{}
				if len(names) > sheetLimit || len(sheets) >= sheetLimit {
					return nil, nil, 413, "工作表过多（>50），请拆分文件后上传"
				}
			}
		case 0x00FD, 0x0203, 0x027E:
			if current == nil || len(record.data) < 6 {
				continue
			}
			row := int(binary.LittleEndian.Uint16(record.data[0:2]))
			col := int(binary.LittleEndian.Uint16(record.data[2:4]))
			if row < 0 || col < 0 || row > 20000 || col > 256 {
				return nil, nil, 413, "工作表范围过大，请删除多余空白行列或拆分文件后上传"
			}
			cells++
			if cells > bookCellLimit {
				return nil, nil, 413, "工作表范围过大，请删除多余空白行列或拆分文件后上传"
			}
			value := ""
			switch record.kind {
			case 0x00FD:
				if len(record.data) >= 10 {
					index := int(binary.LittleEndian.Uint32(record.data[6:10]))
					if index >= 0 && index < len(stringsTable) {
						value = stringsTable[index]
					}
				}
			case 0x0203:
				if len(record.data) >= 14 {
					value = strconv.FormatFloat(math.Float64frombits(binary.LittleEndian.Uint64(record.data[6:14])), 'f', -1, 64)
				}
			case 0x027E:
				if len(record.data) >= 10 {
					value = strconv.FormatFloat(decodeRK(binary.LittleEndian.Uint32(record.data[6:10])), 'f', -1, 64)
				}
			}
			current = putCell(current, row, col, value)
		}
	}
	if current != nil {
		sheets = append(sheets, current)
	}
	if len(names) == 0 {
		for i := range sheets {
			names = append(names, "Sheet"+strconv.Itoa(i+1))
		}
	}
	return names, sheets, 0, ""
}

func putCell(rows [][]string, row, col int, value string) [][]string {
	for len(rows) <= row {
		rows = append(rows, nil)
	}
	for len(rows[row]) <= col {
		rows[row] = append(rows[row], "")
	}
	rows[row][col] = value
	return rows
}

func biffRecords(book []byte) []biffRecord {
	out := []biffRecord{}
	for i := 0; i+4 <= len(book); {
		kind := binary.LittleEndian.Uint16(book[i:])
		size := int(binary.LittleEndian.Uint16(book[i+2:]))
		i += 4
		if size < 0 || i+size > len(book) {
			break
		}
		payload := append([]byte(nil), book[i:i+size]...)
		i += size
		if kind == 0x003C && len(out) > 0 {
			out[len(out)-1].data = append(out[len(out)-1].data, payload...)
			continue
		}
		out = append(out, biffRecord{kind: kind, data: payload})
	}
	return out
}

type biffRecord struct {
	kind uint16
	data []byte
}

func biffSheetName(data []byte) string {
	if len(data) < 8 {
		return ""
	}
	count := int(data[6])
	flags := data[7]
	raw := data[8:]
	if flags&1 == 1 {
		return biffUTF16(raw, count)
	}
	if count > len(raw) {
		count = len(raw)
	}
	return string(raw[:count])
}

func biffStrings(data []byte) []string {
	if len(data) < 8 {
		return nil
	}
	unique := int(binary.LittleEndian.Uint32(data[4:8]))
	rest := data[8:]
	out := []string{}
	for len(out) < unique && len(rest) >= 3 {
		text, next := biffXLString(rest)
		if next <= 0 || next > len(rest) {
			break
		}
		out = append(out, text)
		rest = rest[next:]
	}
	return out
}

func biffXLString(data []byte) (string, int) {
	if len(data) < 3 {
		return "", 0
	}
	count := int(binary.LittleEndian.Uint16(data[0:2]))
	flags := data[2]
	offset := 3
	runs := 0
	ext := 0
	if flags&0x8 != 0 {
		if len(data) < offset+2 {
			return "", 0
		}
		runs = int(binary.LittleEndian.Uint16(data[offset:]))
		offset += 2
	}
	if flags&0x4 != 0 {
		if len(data) < offset+4 {
			return "", 0
		}
		ext = int(binary.LittleEndian.Uint32(data[offset:]))
		offset += 4
	}
	width := 1
	if flags&1 != 0 {
		width = 2
	}
	size := count * width
	if len(data) < offset+size {
		return "", 0
	}
	var text string
	if width == 2 {
		text = biffUTF16(data[offset:offset+size], count)
	} else {
		text = string(data[offset : offset+size])
	}
	offset += size + runs*4 + ext
	if offset > len(data) {
		return text, len(data)
	}
	return text, offset
}

func biffUTF16(data []byte, count int) string {
	if count*2 > len(data) {
		count = len(data) / 2
	}
	units := make([]uint16, count)
	for i := 0; i < count; i++ {
		units[i] = binary.LittleEndian.Uint16(data[i*2:])
	}
	return string(utf16.Decode(units))
}

func decodeRK(value uint32) float64 {
	number := 0.0
	if value&2 != 0 {
		number = float64(int32(value) >> 2)
	} else {
		number = math.Float64frombits(uint64(value&0xfffffffc) << 32)
	}
	if value&1 != 0 {
		number /= 100
	}
	return number
}
