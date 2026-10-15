package storage

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func ObjectKeyWithConfig(config ObjectConfig, category, ext, filename string) string {
	isMaterial := category == "assets" || strings.HasPrefix(category, "canvas-materials") || category == "materials"

	var rootPrefix string
	var subFolder string

	if isMaterial {
		rootPrefix = strings.Trim(config.MaterialsPrefix, "/")
		if rootPrefix == "" {
			rootPrefix = "canvas-materials"
		}
		if strings.Contains(category, "video") {
			subFolder = "videos"
		} else if strings.Contains(category, "thumb") {
			subFolder = "thumbnails"
		} else {
			subFolder = "images"
		}
	} else {
		rootPrefix = strings.Trim(config.ApiPrefix, "/")
		if rootPrefix == "" {
			rootPrefix = "seedance"
		}
		subFolder = category
	}

	cleanExt := strings.TrimPrefix(ext, ".")
	if cleanExt == "" {
		cleanExt = "png"
	}

	now := time.Now()
	yearMonth := fmt.Sprintf("%d%02d", now.Year(), now.Month())

	if filename != "" {
		clean := filepath.Base(filename)
		if clean != "." && clean != "/" && clean != "\\" {
			if subFolder != "" {
				return fmt.Sprintf("%s/%s/%s/%s", rootPrefix, subFolder, yearMonth, clean)
			}
			return fmt.Sprintf("%s/%s/%s", rootPrefix, yearMonth, clean)
		}
	}

	randomSuffix := randomHex(3)
	prefixTag := "item"
	if isMaterial {
		prefixTag = "mat"
	} else if strings.Contains(category, "video") {
		prefixTag = "vid"
	} else if strings.Contains(category, "image") {
		prefixTag = "img"
	}

	name := fmt.Sprintf("%s_%d_%s.%s", prefixTag, now.UnixMilli(), randomSuffix, cleanExt)
	if subFolder != "" {
		return fmt.Sprintf("%s/%s/%s/%s", rootPrefix, subFolder, yearMonth, name)
	}
	return fmt.Sprintf("%s/%s/%s", rootPrefix, yearMonth, name)
}

func ObjectKey(category, ext, filename string) string {
	return ObjectKeyWithConfig(ObjectConfig{}, category, ext, filename)
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())[:bytesLen*2]
	}
	return hex.EncodeToString(b)
}

func WorkspaceKey(rel, workspace string) string {
	prefix := workspace
	clean := strings.TrimPrefix(rel, "/")
	if clean == prefix || strings.HasPrefix(clean, prefix+"/") {
		return clean
	}
	return prefix + "/" + clean
}

var hex64Regex = regexp.MustCompile(`^[a-f0-9]{64}$`)

func WorkspaceRel(rel, workspace string, legacy bool) bool {
	clean := strings.TrimPrefix(rel, "/")
	if clean == workspace || strings.HasPrefix(clean, workspace+"/") {
		return true
	}
	if legacy && workspace == "local" {
		parts := strings.Split(clean, "/")
		if len(parts) > 0 {
			first := parts[0]
			if hex64Regex.MatchString(first) || first == "official" || first == "legacy" {
				return false
			}
			return true
		}
	}
	return false
}

func ManagedKey(raw string, config *ObjectConfig) string {
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "/storage/") {
		key := strings.TrimPrefix(raw, "/storage/")
		if idx := strings.IndexAny(key, "?#"); idx != -1 {
			key = key[:idx]
		}
		if strings.HasPrefix(key, "azhuo/") {
			return key
		}
	}
	if strings.HasPrefix(raw, "azhuo/") || strings.HasPrefix(raw, "/azhuo/") {
		key := strings.TrimPrefix(raw, "/")
		if idx := strings.IndexAny(key, "?#"); idx != -1 {
			key = key[:idx]
		}
		return key
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	path := strings.TrimPrefix(parsed.Path, "/")
	if strings.HasPrefix(path, "azhuo/") {
		return path
	}
	if config != nil && config.BucketName != "" && strings.HasPrefix(path, config.BucketName+"/azhuo/") {
		return strings.TrimPrefix(path, config.BucketName+"/")
	}
	return ""
}

var permanentSuffixes = []string{"r2.dev", "aliyuncs.com", "myqcloud.com", "amazonaws.com", "amazonaws.com.cn", "clouddn.com", "qiniucs.com", "cloudinary.com"}
var tempQueryKeys = map[string]bool{
	"signature": true, "sig": true, "sign": true, "expires": true, "token": true,
	"x-amz-signature": true, "x-oss-signature": true, "q-signature": true,
}

func AlreadyPermanent(rawURL, publicDomain string) bool {
	if rawURL == "" {
		return false
	}
	if strings.HasPrefix(rawURL, "/storage/") {
		return true
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	query := parsed.Query()
	for k := range query {
		if tempQueryKeys[strings.ToLower(k)] {
			return false
		}
	}
	if publicDomain != "" {
		if base, err := url.Parse(publicDomain); err == nil {
			if parsed.Host == base.Host {
				return true
			}
		}
	}
	for _, suffix := range permanentSuffixes {
		if parsed.Host == suffix || strings.HasSuffix(parsed.Host, "."+suffix) {
			return true
		}
	}
	return false
}
