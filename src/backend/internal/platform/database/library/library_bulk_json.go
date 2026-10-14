package library

import "strings"

func jsStringArray(values []string) string {
	parts := make([]string, len(values))
	for index, value := range values {
		parts[index] = jsString(value)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func jsString(value string) string {
	var builder strings.Builder
	builder.WriteByte('"')
	for _, char := range value {
		switch char {
		case '\\', '"':
			builder.WriteByte('\\')
			builder.WriteRune(char)
		case '\b':
			builder.WriteString(`\b`)
		case '\f':
			builder.WriteString(`\f`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			if char < 0x20 {
				builder.WriteString(`\u00`)
				builder.WriteByte("0123456789abcdef"[char>>4])
				builder.WriteByte("0123456789abcdef"[char&0xf])
			} else {
				builder.WriteRune(char)
			}
		}
	}
	builder.WriteByte('"')
	return builder.String()
}
