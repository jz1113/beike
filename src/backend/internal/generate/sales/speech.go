package sales

import (
	"fmt"
	"strings"
)

func salesSpeechRules() string {
	return `声音与画面执行规则：以逐段标注的声音来源和台词原文为准，不得把出镜讲解替换成旁白。
on_camera：画内同一位出镜人物亲口说出台词，声音来自此人，与画面同时生成；保持同一自然声线、语气和空间声，禁止另加解说员或后期旁白替代。中文每个字的发音、唇形开合、下颌动作和说话起止同步，停顿时嘴部自然停止发音，不持续机械开合、不提前动嘴、不声音结束后继续说。说话时用头顶至腰部或大腿的正面或轻微侧面中景，完整头部和主要服装同时入画，嘴唇可辨且无遮挡，不为对口型推近或裁切放大脸部，不被手、手机、衣领或商品遮挡，不用背影、远景或大幅转头承载说话。每句配一个简单展示动作；转身、换装、低头看细节和遮嘴动作放在句间停顿，必要时独立划成 voiceover 段，不能在同一段随意切换声音来源。
voiceover：仅明确的商品细节、手部、背影或无露脸段使用画外音，画内人物不假装开口说话；与出镜段沿用同一人的声线和空间感，不引入第二个解说员，不要求无脸画面对口型。
台词原文不能增删、改写或遗漏。嘴型要求仅用于出镜说话；声音来源未标明时，按实际画面逐段确定：露脸讲解就由此人说话，纯商品或背影才用画外音，不能把全片默认为旁白。
生活实拍节奏：稳定的手机固定机位或轻微手持，保持空间、光线和动作连续；自然眨眼、呼吸、轻重音、视线短暂落到商品后回镜头，微表情随语义变化。避免每秒切镜、无目的推拉环绕、匀速摆拍、持续营业式微笑、塑料磨皮、夸张变装特效；真实速度，不用慢动作覆盖口播，不把静帧做成幻灯片。`
}

func speechDirection(mode string) string {
	switch mode {
	case "on_camera":
		return "声音来源：出镜人物现场说话，嘴部清晰可见，按台词逐字同步口型；停顿后再转身或遮嘴，不得改成旁白。"
	case "voiceover":
		return "声音来源：同一人物画外音，本段画内人物不开口，不要求无脸画面对口型。"
	default:
		return "声音来源按本段实际画面确定：露脸讲解由人物亲口说出并同步口型，纯商品、手部或背影使用画外音。"
	}
}

func validateSpeechModes(shots []ScriptShot, required bool) error {
	for _, shot := range shots {
		switch shot.SpeechMode {
		case "":
			if required {
				return fmt.Errorf("第 %d 段缺少 speechMode，请明确出镜说话或画外音", shot.ShotId)
			}
		case "on_camera", "voiceover":
			if strings.TrimSpace(shot.Voiceover) == "" {
				return fmt.Errorf("第 %d 段已指定声音来源但缺少台词", shot.ShotId)
			}
		default:
			return fmt.Errorf("第 %d 段 speechMode 无效，只能为 on_camera 或 voiceover", shot.ShotId)
		}
	}
	return nil
}

func validateFinalSpeech(full string, prompts []finalPrompt, shots []ScriptShot) error {
	byID := map[int]string{}
	for _, prompt := range prompts {
		byID[prompt.ShotID] = prompt.Prompt
	}
	for _, shot := range shots {
		// Older drafts did not carry a speech mode; retain their existing contract.
		if shot.SpeechMode != "" && (!strings.Contains(full, shot.Voiceover) || !strings.Contains(byID[shot.ShotId], shot.Voiceover)) {
			return fmt.Errorf("第 %d 段定稿遗漏或改写台词原文，请重新定稿", shot.ShotId)
		}
	}
	return nil
}

func speechAssetValidationRules() string {
	return `有 on_camera 分镜时，逐张检查承担出镜讲解的人物或关键帧：正面或轻微侧面的中景，完整头部与主要服装同时入画，嘴唇可辨且无遮挡，不要求脸部或嘴部特写。只有背面、远景、手机挡脸或嘴唇畸变的讲解素材应 conflict；看不清时 uncertain，并说明需补充同一人物的可用讲解帧。商品细节、手部及纯场景素材不强制露脸。静帧只能确认口型生成条件，不能据此声称成片已经口型同步。`
}

func needsSpeakingAsset(shots []ScriptShot) bool {
	for _, shot := range shots {
		if shot.SpeechMode == "on_camera" {
			return true
		}
	}
	return false
}

func isFashionVoiceoverMode(mode string) bool {
	return mode == "product_closeup" || mode == "graphic_montage" || mode == "scene_demo"
}

func normalizeFashionSpeechModes(shots []ScriptShot, mode string) []ScriptShot {
	if !isFashionVoiceoverMode(mode) {
		return shots
	}
	out := make([]ScriptShot, len(shots))
	copy(out, shots)
	for i := range out {
		if out[i].SpeechMode == "on_camera" || (out[i].SpeechMode == "" && strings.TrimSpace(out[i].Voiceover) != "") {
			out[i].SpeechMode = "voiceover"
		}
	}
	return out
}

func fashionPresentationRule(mode string) string {
	if isFashionVoiceoverMode(mode) {
		return "\n本次出镜方式为 " + mode + "（无露脸展示，全程画外音）：所有分镜的 speechMode 必须全部填写 \"voiceover\"，严禁任何一段填写 \"on_camera\"；画内人物不开口对镜头说话，不规划露脸说话人物，全程使用画外音配合商品、手部或背影展示。"
	}
	return "\n本次出镜方式为 live_presenter（人物出镜讲解）：脚本必须包含至少一段 speechMode:\"on_camera\" 的出镜人物说话分镜（不能全片 voiceover），且 assets 数组必须包含至少一项 required:true、kind:\"person\"、usesProduct:true 的出镜人物素材。"
}

func validateFashionPresentation(shots []ScriptShot, mode string) error {
	if mode == "live_presenter" && !needsSpeakingAsset(shots) {
		return fmt.Errorf("已选择人物出镜讲解，脚本必须包含 on_camera 出镜说话分镜，不能全片画外音")
	}
	if (mode == "product_closeup" || mode == "graphic_montage" || mode == "scene_demo") && needsSpeakingAsset(shots) {
		return fmt.Errorf("已选择商品、手部或背影展示，请使用画外音；需要人物说话时请选择人物出镜讲解")
	}
	return nil
}

func validateSpeakingAssetPlan(shots []ScriptShot, assets []PlannedAsset) error {
	if !needsSpeakingAsset(shots) {
		return nil
	}
	for _, asset := range assets {
		if asset.Required && (asset.Kind == "person" || asset.Kind == "keyframe" || asset.Kind == "face") {
			return nil
		}
	}
	return fmt.Errorf("出镜说话需要规划必需的人物或讲解关键帧素材，不能只用商品或空场景")
}

func validateSpeakingReferences(shots []ScriptShot, refs []actualReference) error {
	if !needsSpeakingAsset(shots) {
		return nil
	}
	for _, ref := range refs {
		if ref.Kind == "person" || ref.Kind == "keyframe" || ref.Kind == "face" {
			return nil
		}
	}
	return fmt.Errorf("出镜说话缺少实际人物或讲解关键帧，请先补充并确认素材")
}
