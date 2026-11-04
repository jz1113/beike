package sales

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

// Save only attribution fields and role-ordered identifiers. Signed URLs, inline
// media, routing headers and provider request templates are excluded.
type mediaTrace struct {
	ScriptID        string   `json:"scriptId,omitempty"`
	ScriptVersion   int      `json:"scriptVersion,omitempty"`
	TemplateVersion string   `json:"templateVersion,omitempty"`
	AdaptVersion    string   `json:"adaptVersion,omitempty"`
	PromptDigest    string   `json:"promptDigest,omitempty"`
	References      []string `json:"references,omitempty"`
}

func mediaTraceFrom(input map[string]any, workspace string) mediaTrace {
	var trace mediaTrace
	if raw, ok := input["salesTrace"].(map[string]any); ok {
		// Values originate with the editor; only accept bounded version identifiers.
		for key, out := range map[string]*string{"scriptId": &trace.ScriptID, "templateVersion": &trace.TemplateVersion, "adaptVersion": &trace.AdaptVersion} {
			if v := assetCreationText(raw[key]); len(v) <= 180 && !strings.ContainsAny(v, "/?#@\r\n") {
				*out = v
			}
		}
		if v, ok := raw["scriptVersion"].(float64); ok && v > 0 && v <= 1e9 {
			trace.ScriptVersion = int(v)
		}
	}
	if prompt := assetCreationText(input["prompt"]); prompt != "" {
		digest := sha256.Sum256([]byte(prompt))
		trace.PromptDigest = hex.EncodeToString(digest[:])
	}
	for _, field := range []string{"images", "videos", "audios"} {
		refs, _ := input[field].([]any)
		for _, ref := range refs {
			value := assetCreationText(ref)
			digest := sha256.Sum256([]byte(value))
			id := "sha256:" + hex.EncodeToString(digest[:])
			if len(value) <= 2048 && strings.HasPrefix(value, "/storage/"+workspace+"/") && !strings.ContainsAny(value, "?#") && storage.StoredFile(strings.TrimPrefix(value, "/storage/")) != "" {
				id = value
			}
			trace.References = append(trace.References, field+" "+id)
		}
	}
	return trace
}
func mediaTraceJSON(input map[string]any, workspace string) json.RawMessage {
	data, _ := json.Marshal(mediaTraceFrom(input, workspace))
	return data
}
