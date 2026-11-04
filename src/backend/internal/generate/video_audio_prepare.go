package generate

import (
	"context"
	"fmt"
	"math"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

type videoAudioDurationLimits struct {
	minimum, maximum, total float64
}

type videoAudioPreparation struct {
	sourceDuration, submittedDuration float64
	trimmed                           bool
}

type localVideoAudioSource struct {
	path     string
	duration float64
}

func videoAudioLimits(model string) videoAudioDurationLimits {
	if viduQ4Preview(model) {
		return videoAudioDurationLimits{minimum: 3, maximum: 12}
	}
	if minimaxH3(model) {
		return videoAudioDurationLimits{minimum: 2, maximum: 15, total: 15}
	}
	if videoFamily(model) == "seedance" {
		if seedance25(model) {
			return videoAudioDurationLimits{minimum: 2, maximum: 30, total: 30}
		}
		return videoAudioDurationLimits{minimum: 2, maximum: 15, total: 15}
	}
	return videoAudioDurationLimits{minimum: 1, maximum: 15, total: 15}
}

// Inspect every local original before uploading any submission copy. Provider
// URLs and managed assets keep their existing provider-side metadata checks.
func inspectLocalVideoAudioReferences(ctx context.Context, root, model string, refs []string, workspace string, production bool) ([]localVideoAudioSource, error) {
	limits := videoAudioLimits(model)
	sources := make([]localVideoAudioSource, len(refs))
	for index, ref := range refs {
		if !strings.HasPrefix(strings.TrimSpace(ref), "/storage/") {
			continue
		}
		path, err := localReferenceAudioPath(strings.TrimSpace(ref), workspace, production)
		if err != nil {
			return nil, err
		}
		if _, _, _, err := readLocalReferenceAudio(path); err != nil {
			return nil, err
		}
		duration, err := system.ProbeAudioDuration(ctx, root, path)
		if err != nil {
			return nil, imageEditPrepareError{"参考音频校验失败：" + err.Error()}
		}
		if duration < limits.minimum {
			return nil, imageEditPrepareError{fmt.Sprintf("音频%d时长不足：当前模型参考音频至少需 %.0f 秒，当前为 %.2f 秒", index+1, limits.minimum, duration)}
		}
		sources[index] = localVideoAudioSource{path: path, duration: duration}
	}
	return sources, nil
}

// Preserve reference order and reserve the minimum for every remaining sample.
// Millisecond budgets keep rounding from exceeding a provider's total limit.
func planVideoAudioDurations(limits videoAudioDurationLimits, sources []localVideoAudioSource) ([]float64, error) {
	targets := make([]float64, len(sources))
	remainingCount := 0
	total := 0.0
	for index, source := range sources {
		if source.path != "" {
			remainingCount++
			targets[index] = math.Min(source.duration, limits.maximum)
			total += targets[index]
		}
	}
	if limits.total == 0 || total <= limits.total {
		return targets, nil
	}
	minimum := int64(limits.minimum * 1000)
	remaining := int64(limits.total * 1000)
	if limits.total > 0 && int64(remainingCount)*minimum > remaining {
		return nil, imageEditPrepareError{"参考音频数量过多，无法在总时长限制内保留每段最低时长"}
	}
	for index, source := range sources {
		if source.path == "" {
			continue
		}
		remainingCount--
		target := int64(math.Floor(math.Min(source.duration, limits.maximum) * 1000))
		if limits.total > 0 {
			target = min(target, remaining-int64(remainingCount)*minimum)
			remaining -= target
		}
		targets[index] = float64(target) / 1000
	}
	return targets, nil
}

func prepareVideoAudioReferences(ctx context.Context, root, model string, refs []string, workspace string, production bool, cfg *storage.ObjectConfig) ([]string, []videoAudioPreparation, error) {
	if len(refs) == 0 {
		return refs, nil, nil
	}
	sources, err := inspectLocalVideoAudioReferences(ctx, root, model, refs, workspace, production)
	if err != nil {
		return nil, nil, err
	}
	limits := videoAudioLimits(model)
	targets, err := planVideoAudioDurations(limits, sources)
	if err != nil {
		return nil, nil, err
	}
	prepared := append([]string(nil), refs...)
	results := make([]videoAudioPreparation, len(refs))
	for index, source := range sources {
		if source.path == "" {
			continue
		}
		if cfg == nil {
			return nil, nil, imageEditPrepareError{"当前未配置对象存储，参考音频需要公网可访问链接，请先完成对象存储配置"}
		}
		data, extension, mime, err := readLocalReferenceAudio(source.path)
		if err != nil {
			return nil, nil, err
		}
		submittedDuration := source.duration
		trim := source.duration > targets[index]
		convert := extension != "mp3" && extension != "wav"
		format, maximum := "wav", targets[index]
		if viduQ4Preview(model) {
			format, maximum = "mp3", limits.maximum
			convert = extension != "mp3"
		}
		if trim || convert {
			data, extension, mime, err = transcodeReferenceAudio(ctx, root, source.path, format, maximum)
			if err != nil {
				return nil, nil, err
			}
			submittedDuration, err = probePreparedReferenceAudio(ctx, root, data, extension)
			if err != nil {
				return nil, nil, err
			}
			if submittedDuration < limits.minimum || submittedDuration > maximum+0.000001 {
				return nil, nil, imageEditPrepareError{"参考音频处理后时长不符合模型限制，请更换声音样本"}
			}
		}
		key := storage.ObjectKeyWithConfig(*cfg, "refs", extension, "")
		if err := storage.Objects.Put(ctx, *cfg, key, mime, data); err != nil {
			return nil, nil, imageEditPrepareError{"对象存储上传参考音频失败，请检查存储配置"}
		}
		prepared[index], err = storage.ReferenceObjectURL(ctx, *cfg, key)
		if err != nil {
			return nil, nil, imageEditPrepareError{"参考音频已上传，但无法生成访问链接，请检查存储配置"}
		}
		trimmed := trim || submittedDuration < source.duration-0.000001 || convert && format == "mp3" && source.duration > maximum-0.1
		results[index] = videoAudioPreparation{sourceDuration: source.duration, submittedDuration: submittedDuration, trimmed: trimmed}
	}
	return prepared, results, nil
}

func probePreparedReferenceAudio(ctx context.Context, root string, data []byte, extension string) (float64, error) {
	file, err := os.CreateTemp("", "video-prepared-audio-*."+extension)
	if err != nil {
		return 0, imageEditPrepareError{"无法校验处理后的参考音频"}
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		return 0, imageEditPrepareError{"无法校验处理后的参考音频"}
	}
	duration, err := system.ProbeAudioDuration(ctx, root, file.Name())
	if err != nil {
		return 0, imageEditPrepareError{"参考音频处理后校验失败：" + err.Error()}
	}
	return duration, nil
}

func replaceVideoAudioReferences(body map[string]any, family string, refs []string) {
	if len(refs) == 0 {
		return
	}
	index := 0
	switch family {
	case "vidu":
		body["sounds"] = refs
	case "seedance", "minimax":
		content, _ := body["content"].([]map[string]any)
		for _, item := range content {
			if item["type"] == "audio_url" && index < len(refs) {
				item["audio_url"] = map[string]string{"url": refs[index]}
				index++
			}
		}
	case "wan":
		input, _ := body["input"].(map[string]any)
		media, _ := input["media"].([]map[string]string)
		for _, item := range media {
			if item["type"] == "reference_audio" && index < len(refs) {
				item["url"] = refs[index]
				index++
			}
		}
	}
}
