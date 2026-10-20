package videosales

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

type finalPrompt struct {
	ShotID      int    `json:"shotId"`
	Prompt      string `json:"prompt"`
	ImagePrompt string `json:"imagePrompt,omitempty"`
}

type fashionStills struct {
	Person string
	Scene  string
}

// Finalize rewrites each shot prompt from the image actually selected for it.
func Finalize(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}
		var protocolOK bool
		r, protocolOK = generate.BindTextProtocol(w, r, payload)
		if !protocolOK {
			return
		}
		if err := checkWorkflowVersion(payload); err != nil {
			workflowError(w, 400, err)
			return
		}
		if workflowV3(payload) || payload["operation"] != nil {
			handleWorkflowFinalize(w, r, cfg, payload)
			return
		}
		shots := parseFinalizeShots(payload)
		catalog := parseCatalog(payload)
		if len(shots) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "没有可定稿的分镜"})
			return
		}
		if err := shotsHaveImages(shots, catalog); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)
		if key == "" || base == "" {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "提示词模型调用失败，请检查模型与密钥后重试"})
			return
		}
		var prompts []finalPrompt
		var fullPrompt string
		var stills fashionStills
		var raw map[string]any
		if strings.TrimSpace(generate.StringField(payload, "category")) == "fashion" {
			prompts, fullPrompt, stills, raw, err = runFashionFinalize(r.Context(), base, key, model, shots, payload, strings.TrimSpace(generate.StringField(payload, "productAnalysis")))
		} else {
			prompts, raw, err = runFinalize(r.Context(), base, key, model, shots, catalog, strings.TrimSpace(generate.StringField(payload, "productAnalysis")))
		}
		if err != nil {
			status := http.StatusBadGateway
			if strings.Contains(err.Error(), "出镜人物") {
				status = http.StatusBadRequest
			}
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": err.Error()})
			return
		}
		response := map[string]any{"success": true, "prompts": prompts, "model": model}
		if fullPrompt != "" {
			response["fullPrompt"] = fullPrompt
		}
		if stills.Person != "" {
			response["personImagePrompt"] = stills.Person
		}
		if stills.Scene != "" {
			response["sceneImagePrompt"] = stills.Scene
		}
		if usage := generate.NormalizeUsage(raw); usage != nil {
			response["usage"] = usage
		}
		httpx.WriteJSON(w, http.StatusOK, response)
	})
}

func runFinalize(ctx context.Context, base, key, model string, shots []ScriptShot, catalog []CatalogImage, analysis string) ([]finalPrompt, map[string]any, error) {
	var merged []finalPrompt
	var raw map[string]any
	for _, batch := range chunkShots(shots, visionBatchSize) {
		images := imagesForShots(batch, catalog)
		content, nextRaw, status, err := postChatJSON(ctx, base, key, finalizeChatBody(model, batch, images, analysis), chatWait)
		if errors.Is(err, errTruncatedOutput) {
			return nil, nil, errTruncatedOutput
		}
		if err != nil || status < 200 || status >= 300 {
			return nil, nil, fmt.Errorf("提示词模型调用失败，请检查模型与密钥后重试")
		}
		prompts, _, _, promptErr := promptsForShots(batch, content, false)
		if promptErr != nil {
			return nil, nil, promptErr
		}
		merged = append(merged, prompts...)
		raw = nextRaw
	}
	return merged, raw, nil
}

func chunkShots(shots []ScriptShot, size int) [][]ScriptShot {
	if size <= 0 {
		size = visionBatchSize
	}
	batches := make([][]ScriptShot, 0, (len(shots)+size-1)/size)
	for start := 0; start < len(shots); start += size {
		end := start + size
		if end > len(shots) {
			end = len(shots)
		}
		batches = append(batches, shots[start:end])
	}
	return batches
}

func imagesForShots(shots []ScriptShot, catalog []CatalogImage) []CatalogImage {
	byIndex := map[int]CatalogImage{}
	for _, image := range catalog {
		byIndex[image.Index] = image
	}
	seen := map[int]bool{}
	images := make([]CatalogImage, 0, len(shots))
	for _, shot := range shots {
		if seen[shot.ImageIndex] {
			continue
		}
		image, ok := byIndex[shot.ImageIndex]
		if !ok {
			continue
		}
		seen[shot.ImageIndex] = true
		images = append(images, image)
	}
	return images
}

func promptsForShots(shots []ScriptShot, content string, requireFull bool) ([]finalPrompt, string, fashionStills, error) {
	var parsed struct {
		Prompts           []finalPrompt `json:"prompts"`
		FullPrompt        string        `json:"fullPrompt"`
		PersonImagePrompt string        `json:"personImagePrompt"`
		SceneImagePrompt  string        `json:"sceneImagePrompt"`
	}
	if json.Unmarshal([]byte(content), &parsed) != nil {
		return nil, "", fashionStills{}, fmt.Errorf("提示词结果无法解析")
	}
	full := strings.TrimSpace(parsed.FullPrompt)
	stills := fashionStills{Person: strings.TrimSpace(parsed.PersonImagePrompt), Scene: strings.TrimSpace(parsed.SceneImagePrompt)}
	if requireFull && full == "" {
		return nil, "", fashionStills{}, fmt.Errorf("没有完整视频提示词")
	}
	if requireFull && (stills.Person == "" || stills.Scene == "") {
		return nil, "", fashionStills{}, fmt.Errorf("没有人物或场景绘图提示词")
	}
	byShot := map[int]finalPrompt{}
	for _, item := range parsed.Prompts {
		byShot[item.ShotID] = item
	}
	out := make([]finalPrompt, 0, len(shots))
	for _, shot := range shots {
		item := byShot[shot.ShotId]
		prompt := strings.TrimSpace(item.Prompt)
		if prompt == "" {
			return nil, "", fashionStills{}, fmt.Errorf("镜头 %d 没有最终提示词", shot.ShotId)
		}
		imagePrompt := ""
		if shot.VisualSource == "ai_generate" {
			imagePrompt = strings.TrimSpace(item.ImagePrompt)
			if imagePrompt == "" {
				return nil, "", fashionStills{}, fmt.Errorf("镜头 %d 没有绘图提示词", shot.ShotId)
			}
		}
		out = append(out, finalPrompt{ShotID: shot.ShotId, Prompt: prompt, ImagePrompt: imagePrompt})
	}
	return out, full, stills, nil
}

func runFashionFinalize(ctx context.Context, base, key, model string, shots []ScriptShot, payload map[string]any, analysis string) ([]finalPrompt, string, fashionStills, map[string]any, error) {
	refs, err := parseFashionOrder(payload)
	if err != nil {
		return nil, "", fashionStills{}, nil, err
	}
	content, raw, status, callErr := postChatJSON(ctx, base, key, fashionFinalizeBody(model, shots, refs, analysis), chatWait)
	if errors.Is(callErr, errTruncatedOutput) {
		return nil, "", fashionStills{}, nil, errTruncatedOutput
	}
	if callErr != nil || status < 200 || status >= 300 {
		return nil, "", fashionStills{}, nil, fmt.Errorf("提示词模型调用失败，请检查模型与密钥后重试")
	}
	prompts, full, stills, promptErr := promptsForShots(shots, content, true)
	if promptErr != nil {
		return nil, "", fashionStills{}, nil, promptErr
	}
	return prompts, full, stills, raw, nil
}

func fashionFinalizeBody(model string, shots []ScriptShot, refs []fashionRef, analysis string) map[string]any {
	lines := make([]string, 0, len(shots))
	for _, shot := range shots {
		lines = append(lines, fmt.Sprintf("镜头 %d，时长 %d 秒，运镜：%s，画面：%s，口播：%s，草稿：%s", shot.ShotId, shot.Duration, shot.Camera, shot.Description, shot.Voiceover, shot.Prompt))
	}
	text := "参考顺序只能使用下面这些编号：\n" + fashionOrderText(refs) + "\n" + strings.Join(lines, "\n") + "\n商品分析：" + analysis
	images := make([]CatalogImage, 0, len(refs))
	for i, ref := range refs {
		images = append(images, CatalogImage{Index: i + 1, URL: ref.URL, Role: ref.Label})
	}
	return withLongOutput(chatBody(model, fashionFinalizePrompt(), fashionVisionParts(text, refs, images), 0.3))
}

func fashionVisionParts(intro string, refs []fashionRef, images []CatalogImage) []map[string]any {
	parts := []map[string]any{{"type": "text", "text": intro}}
	for i, image := range images {
		label := image.Role
		if i < len(refs) && refs[i].Label != "" {
			label = refs[i].Label
		}
		if strings.TrimSpace(image.URL) == "" {
			parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("图片%d：%s（没有原图，按脚本生成）", i+1, label)})
			continue
		}
		parts = append(parts,
			map[string]any{"type": "text", "text": fmt.Sprintf("图片%d：%s", i+1, label)},
			map[string]any{"type": "image_url", "image_url": map[string]string{"url": image.URL}},
		)
	}
	return parts
}

func shotsHaveImages(shots []ScriptShot, catalog []CatalogImage) error {
	valid := map[int]bool{}
	for _, image := range catalog {
		valid[image.Index] = true
	}
	for _, shot := range shots {
		if !valid[shot.ImageIndex] {
			return fmt.Errorf("镜头 %d 没有有效参考图", shot.ShotId)
		}
	}
	return nil
}

func finalizeChatBody(model string, shots []ScriptShot, images []CatalogImage, analysis string) map[string]any {
	var lines []string
	for _, shot := range shots {
		lines = append(lines, fmt.Sprintf("镜头 %d，时长 %d 秒，参考图编号 %d，画面来源 %s，运镜：%s，画面：%s，口播：%s，草稿：%s", shot.ShotId, shot.Duration, shot.ImageIndex, keepVisualSource(shot.VisualSource), shot.Camera, shot.Description, shot.Voiceover, shot.Prompt))
	}
	text := "根据每个镜头实际选中的商品图，重写可直接交给图生视频模型的中文提示词。提示词要写明商品外观、包装和颜色必须与参考图一致，并包含场景、动作、运镜、要说出的口播台词，以及和相邻镜头的衔接。口播由视频模型自己念出，不要出现字幕、贴纸、大字或价格。不要编造参考图里看不见的功效和优惠。" + realisticLook() + "\n" +
		"visualSource 为 ai_generate 的镜头还要写 imagePrompt：一张静帧，只写这一镜脚本里的画面和动作。不写口播、运镜时间轴、字幕或价格。商品外观跟参考图一致，人物和场景使用上面的实拍风格。visualSource 为 product_image 的镜头不要写 imagePrompt。\n" +
		strings.Join(lines, "\n") + "\n商品分析：" + analysis +
		"\n只输出 JSON：{\"prompts\":[{\"shotId\":1,\"prompt\":\"视频提示词\",\"imagePrompt\":\"仅场景镜填写\"}]}"
	return withLongOutput(chatBody(model, "你负责把带货分镜定稿成图生视频提示词。不要发明目录里没有的图片。", visionParts(text, images), 0.3))
}

func parseFinalizeShots(payload map[string]any) []ScriptShot {
	raw, ok := payload["shots"].([]any)
	if !ok {
		return nil
	}
	shots := make([]ScriptShot, 0, len(raw))
	for _, item := range raw {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		shotID := generate.IntField(obj, "shotId")
		if shotID == 0 {
			shotID = len(shots) + 1
		}
		shots = append(shots, ScriptShot{
			ShotId:       shotID,
			Duration:     generate.IntField(obj, "duration"),
			Description:  generate.StringField(obj, "description"),
			Camera:       generate.StringField(obj, "camera"),
			Voiceover:    generate.StringField(obj, "voiceover"),
			Prompt:       generate.StringField(obj, "prompt"),
			ImageIndex:   generate.IntField(obj, "imageIndex"),
			VisualSource: keepVisualSource(generate.StringField(obj, "visualSource")),
		})
	}
	return shots
}
