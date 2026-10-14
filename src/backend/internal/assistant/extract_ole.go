package assistant

import (
	"bytes"
	"errors"
	"strings"

	"github.com/richardlehane/mscfb"
)

// Real OLE workbooks still go to Node. Only containers that cannot be a
// compound file, or that declare an illegal sector size or FAT overflow,
// match the Node .xls failure text.
func oleObviouslyBroken(data []byte) bool {
	if len(data) < 512 {
		return true
	}
	_, err := mscfb.New(bytes.NewReader(data))
	if err == nil {
		return false
	}
	var format mscfb.Error
	if !errors.As(err, &format) || format.Typ() != mscfb.ErrFormat {
		return false
	}
	message := format.Error()
	return strings.Contains(message, "bad signature") ||
		strings.Contains(message, "illegal sector size") ||
		strings.Contains(message, "overflow") ||
		strings.Contains(message, "exceeds")
}
