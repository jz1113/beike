package network

import (
	"net"
	"strings"
)

func PrivateIP(ip string) bool {
	raw := strings.ToLower(strings.Trim(ip, "[]"))
	if parsed := net.ParseIP(raw); parsed != nil {
		if v4 := parsed.To4(); v4 != nil {
			return privateDotted(v4.String())
		}
		return privateIPv6(parsed.String())
	}
	return privateDotted(raw)
}

func privateIPv6(raw string) bool {
	parsed := net.ParseIP(raw)
	if parsed == nil {
		return false
	}
	if parsed.Equal(net.IPv6zero) || parsed.IsLoopback() || parsed.IsLinkLocalUnicast() || parsed.IsLinkLocalMulticast() || parsed.IsMulticast() || parsed.IsInterfaceLocalMulticast() {
		return true
	}
	if len(parsed) == 16 && (parsed[0]&0xfe) == 0xfc {
		return true
	}
	if parsed[0] == 0x20 && parsed[1] == 0x01 && parsed[2] == 0x0d && parsed[3] == 0xb8 {
		return true
	}
	return false
}

func privateDotted(mapped string) bool {
	if mapped == "::1" || mapped == "0.0.0.0" || mapped == "127.0.0.1" {
		return true
	}
	if strings.HasPrefix(mapped, "fe80:") || strings.HasPrefix(mapped, "fc") || strings.HasPrefix(mapped, "fd") {
		return true
	}
	parts := strings.Split(mapped, ".")
	if len(parts) != 4 {
		return false
	}
	numbers := make([]int, 4)
	for index, part := range parts {
		number, ok := decimalByte(part)
		if !ok {
			return false
		}
		numbers[index] = number
	}
	first, second, third := numbers[0], numbers[1], numbers[2]
	if first == 10 || first == 127 || first == 0 {
		return true
	}
	if first == 192 && second == 168 {
		return true
	}
	if first == 169 && second == 254 {
		return true
	}
	if first == 172 && second >= 16 && second <= 31 {
		return true
	}
	if first == 100 && second >= 64 && second <= 127 {
		return true
	}
	if first == 192 && second == 0 && third <= 2 {
		return true
	}
	if first == 198 && second == 51 && third == 100 {
		return true
	}
	if first == 203 && second == 0 && third == 113 {
		return true
	}
	if first == 198 && (second == 18 || second == 19) {
		return true
	}
	return first >= 224
}

func dottedIPv4(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 4 {
		return false
	}
	for _, part := range parts {
		if part == "" || len(part) > 3 {
			return false
		}
		for _, char := range part {
			if char < '0' || char > '9' {
				return false
			}
		}
	}
	return true
}

func decimalByte(value string) (int, bool) {
	if value == "" || (len(value) > 1 && value[0] == '0') {
		return 0, false
	}
	number := 0
	for _, char := range value {
		if char < '0' || char > '9' {
			return 0, false
		}
		number = number*10 + int(char-'0')
	}
	return number, number <= 255
}
