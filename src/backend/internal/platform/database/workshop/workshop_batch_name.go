package workshop

import (
	"strings"
	"time"
)

func workshopBatchName(id, name, createdAt string) string {
	if name != "" && name != "未命名新批次" && name != "未命名批次" {
		return name
	}
	date, err := time.Parse(time.RFC3339Nano, createdAt)
	dateLabel := "未知日期"
	if err == nil {
		dateLabel = date.In(time.FixedZone("CST", 8*60*60)).Format("20060102")
	}
	shortID := id
	if len(shortID) > 6 {
		shortID = shortID[len(shortID)-6:]
	}
	return "电商图片 · " + dateLabel + " · " + strings.ToUpper(shortID)
}

func workshopBatchCopyName(source WorkshopBatchRow) string {
	name := strings.TrimSuffix(workshopBatchName(source.ID, source.Name, source.CreatedAt), "（副本）")
	characters := []rune(name)
	if len(characters) > 116 {
		name = string(characters[:116])
	}
	return name + "（副本）"
}
