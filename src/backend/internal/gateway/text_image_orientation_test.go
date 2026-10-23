package gateway

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestTextImageEXIFOrientationParsingIsBounded(t *testing.T) {
	for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
		tiff := make([]byte, 26)
		if order == binary.LittleEndian {
			copy(tiff, "II")
		} else {
			copy(tiff, "MM")
		}
		order.PutUint16(tiff[2:], 42)
		order.PutUint32(tiff[4:], 8)
		order.PutUint16(tiff[8:], 1)
		order.PutUint16(tiff[10:], 0x0112)
		order.PutUint16(tiff[12:], 3)
		order.PutUint32(tiff[14:], 1)
		order.PutUint16(tiff[18:], 8)
		if got := textTIFFOrientation(tiff); got != 8 {
			t.Fatalf("orientation=%d", got)
		}
		for _, mutation := range []func([]byte){
			func(b []byte) { order.PutUint32(b[4:], 0xffffffff) },
			func(b []byte) { order.PutUint16(b[8:], 0xffff) },
			func(b []byte) { order.PutUint32(b[14:], 0x80000001) },
			func(b []byte) { order.PutUint16(b[18:], 9) },
		} {
			body := bytes.Clone(tiff)
			mutation(body)
			if got := textTIFFOrientation(body); got != 1 {
				t.Fatalf("invalid metadata accepted: %d", got)
			}
		}
		for length := 0; length < 22; length++ {
			if got := textTIFFOrientation(tiff[:length]); got != 1 {
				t.Fatalf("truncated metadata accepted: length=%d orientation=%d", length, got)
			}
		}
	}
	for _, body := range [][]byte{
		nil, {0xff, 0xd8}, {0xff, 0xd8, 0xff},
		{0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff},
		{0xff, 0xd8, 0xff, 0xe1, 0, 1},
		{0xff, 0xd8, 0xff, 0xda, 0xff, 0xe1},
	} {
		if got := textJPEGOrientation(body); got != 1 {
			t.Fatalf("invalid JPEG metadata accepted: %d", got)
		}
	}
}
