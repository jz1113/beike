package generate

import (
	"context"
	"encoding/json"
	"strings"
)

// Vidu accepts accessible URLs or image data URIs, never browser-local storage
// paths. Resolve in place so image numbers in the reviewed prompt stay stable.
func prepareViduImageReferences(ctx context.Context, body map[string]any, workspace string, production bool) error {
	images, _ := body["images"].([]string)
	resolved := make([]string, len(images))
	for index, ref := range images {
		ref = strings.TrimSpace(ref)
		if strings.HasPrefix(ref, "//") {
			ref = "https:" + ref
		}
		converted, err := dashscopeImageRef(ctx, ref, index, workspace, production)
		if err != nil {
			return err
		}
		if converted == "" {
			return imageEditPrepareError{"参考图地址为空"}
		}
		resolved[index] = converted
	}
	if len(images) > 0 {
		body["images"] = resolved
	}
	// Measure the final JSON, including prompt and already-prepared sound URLs.
	// The provider's 20MB cap also applies to the overhead of Base64 encoding.
	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}
	if len(encoded) > 20<<20 {
		return imageEditPrepareError{"Vidu 请求总大小超过 20MB，请减少参考图片数量或压缩图片后重试"}
	}
	return nil
}
