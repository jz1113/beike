package sales

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
)

//go:embed product-selling-points.md
var summaryInstruction string

func summarySkillVersion() string {
	digest := sha256.Sum256([]byte(summaryInstruction + "|ocr-text-v2"))
	return "product-selling-points:" + hex.EncodeToString(digest[:6])
}
