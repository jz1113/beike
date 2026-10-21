package modelgw

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
)

// Apply orientation through a read-only view, avoiding a second full-size
// allocation. JPEG re-encoding otherwise loses the source's EXIF orientation.
func orientTextImage(source image.Image, body []byte) image.Image {
	orientation := textJPEGOrientation(body)
	if orientation < 2 || orientation > 8 {
		return source
	}
	return textOrientedImage{Image: source, orientation: orientation}
}

// Read only the inline SHORT orientation in IFD0, never arbitrary TIFF tags,
// external offsets or linked directories. Malicious EXIF counts cannot trigger
// allocations or recursive directory traversal.
func textJPEGOrientation(body []byte) int {
	if len(body) < 2 || body[0] != 0xff || body[1] != 0xd8 {
		return 1
	}
	for offset := 2; offset < len(body); {
		if body[offset] != 0xff {
			return 1
		}
		for offset < len(body) && body[offset] == 0xff {
			offset++
		}
		if offset >= len(body) {
			return 1
		}
		marker := body[offset]
		offset++
		if marker == 0xda || marker == 0xd9 { // Stop at scan data or EOI.
			return 1
		}
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd7 {
			continue
		}
		if len(body)-offset < 2 {
			return 1
		}
		size := int(binary.BigEndian.Uint16(body[offset:]))
		if size < 2 || size > len(body)-offset {
			return 1
		}
		segment := body[offset+2 : offset+size]
		if marker == 0xe1 && bytes.HasPrefix(segment, []byte("Exif\x00\x00")) {
			return textTIFFOrientation(segment[6:])
		}
		offset += size
	}
	return 1
}

func textTIFFOrientation(body []byte) int {
	if len(body) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(body[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(body[2:]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(body[4:]))
	if offset < 8 || offset+2 > uint64(len(body)) {
		return 1
	}
	entries := body[int(offset):]
	count := int(order.Uint16(entries))
	entries = entries[2:]
	if count > len(entries)/12 {
		return 1
	}
	for i := 0; i < count; i++ {
		entry := entries[i*12 : i*12+12]
		if order.Uint16(entry) != 0x0112 || order.Uint16(entry[2:]) != 3 || order.Uint32(entry[4:]) != 1 {
			continue
		}
		if value := int(order.Uint16(entry[8:])); value >= 1 && value <= 8 {
			return value
		}
	}
	return 1
}

type textOrientedImage struct {
	image.Image
	orientation int
}

func (im textOrientedImage) Bounds() image.Rectangle {
	b := im.Image.Bounds()
	if im.orientation >= 5 {
		return image.Rect(0, 0, b.Dy(), b.Dx())
	}
	return image.Rect(0, 0, b.Dx(), b.Dy())
}

func (im textOrientedImage) At(x, y int) color.Color {
	b := im.Image.Bounds()
	w, h := b.Dx(), b.Dy()
	switch im.orientation {
	case 2:
		x = w - 1 - x
	case 3:
		x, y = w-1-x, h-1-y
	case 4:
		y = h - 1 - y
	case 5:
		x, y = y, x
	case 6:
		x, y = y, h-1-x
	case 7:
		x, y = w-1-y, h-1-x
	case 8:
		x, y = w-1-y, x
	}
	return im.Image.At(b.Min.X+x, b.Min.Y+y)
}
