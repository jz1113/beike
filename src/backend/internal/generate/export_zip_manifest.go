package generate

import (
	"bytes"

	"github.com/xuri/excelize/v2"
)

type exportManifestRow struct {
	name  string
	title string
	link  string
	cover string
}

func exportManifest(rows []exportManifestRow) ([]byte, error) {
	file := excelize.NewFile()
	defer file.Close()
	const sheet = "采集清单"
	if err := file.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}
	headers := []string{"当前命名", "原标题", "链接", "封面图链接"}
	if err := file.SetSheetRow(sheet, "A1", &headers); err != nil {
		return nil, err
	}
	for index, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, index+2)
		if err != nil {
			return nil, err
		}
		values := []string{row.name, row.title, row.link, row.cover}
		if err := file.SetSheetRow(sheet, cell, &values); err != nil {
			return nil, err
		}
	}
	var buffer bytes.Buffer
	if err := file.Write(&buffer); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func manifestCover(product map[string]any) string {
	if cover := exportString(product, "coverImage"); cover != "" {
		return cover
	}
	images, _ := product["images"].([]any)
	if len(images) == 0 {
		return ""
	}
	switch image := images[0].(type) {
	case string:
		return image
	case map[string]any:
		text, _ := image["url"].(string)
		return text
	default:
		return ""
	}
}

func manifestTitle(product map[string]any) string {
	if title := exportString(product, "copywritingTitle"); title != "" {
		return title
	}
	if title := exportString(product, "title"); title != "" {
		return title
	}
	return exportString(product, "productTitle")
}
