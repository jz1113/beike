package sales

import (
	"encoding/json"
	"fmt"
)

// Capture what was actually attached to the model. The file may have an audio
// track even though the selected protocol received only still images.
func recordScriptObservations(content []any, script map[string]any) {
	if len(content) == 0 {
		return
	}
	first, _ := content[0].(map[string]any)
	var meta struct {
		Kind  string    `json:"mediaType"`
		Times []float64 `json:"sampleTimesSec"`
	}
	if json.Unmarshal([]byte(assetCreationText(first["text"])), &meta) != nil || meta.Kind != "sampled_frames" {
		return
	}
	script["sampleTimesSec"] = meta.Times
	notes, _ := script["review"].([]any)
	note := fmt.Sprintf("本次模型只读取 %d 帧采样画面。镜头边界为估计值，未提供音轨；口播、音乐、音效需对照原视频核对。", len(meta.Times))
	if len(notes) < 20 {
		script["review"] = append(notes, note)
	}
	shots, _ := script["shots"].([]any)
	for _, item := range shots {
		shot, _ := item.(map[string]any)
		beats, _ := shot["beats"].([]any)
		for _, item := range beats {
			beat, _ := item.(map[string]any)
			voice, _ := beat["voice"].(map[string]any)
			if voice != nil {
				voice["text"] = ""
				voice["linePattern"] = ""
				voice["uncertain"] = true
			}
		}
	}
}
