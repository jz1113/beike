package sales

import "fmt"

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
