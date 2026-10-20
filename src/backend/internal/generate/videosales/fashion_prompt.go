package videosales

import (
	"fmt"
	"strings"

	"beike.local/cloud/src/backend/internal/generate"
)

func fashionNarrativeRules() string {
	return `叙事只选一种，写入 beat：
- unbox 开箱换装：上衣、裤、裙、外套。前段抽出单品举高展示；中段匹配剪辑，同一身体位置已经穿上并转身，面料自然动；后段全身连续姿势，最后指向镜头。
- lifestyle 生活穿搭：人已经穿着该单品。先坐着看镜头，再站到窗边，然后整理头发或衣服，最后走开并回头。景别在中景和全景之间，带轻微手持。
- accessory 鞋包展示：鞋或包。拿出、上手或上脚、多角度展示。不要写换装，也不要写面料飘动。`
}

func fashionScriptPrompt() string {
	return `你是服饰带货编导。只写 1 套脚本，品类是服饰鞋包。
成片会按参考图一次生成整段视频。分镜用来安排时间轴，不要写成互不相干的多条视频。
` + fashionNarrativeRules() + `
每段写景别、视角、动作、口播和转场。口播大约每秒 3 到 4 个字，只使用商品资料里的事实。没有尺码、链接、置顶、功效、评价、销量或优惠，就不要说。
画面不要字幕、贴纸、大字或价格条。示例角度和示例台词只说明要写具体，不能原样输出。分镜时长加总等于目标时长。这一步不要写死图片编号。
必须严格输出纯 JSON 对象：
{
  "scripts": [
    {
      "id": "script_1",
      "title": "脚本标题",
      "beat": "unbox",
      "totalDuration": 15,
      "shots": [
        {
          "shotId": 1,
          "type": "hook",
          "duration": 4,
          "description": "这一段画面里发生什么",
          "camera": "景别和视角",
          "visualSource": "product_image",
          "transition": "direct_concat",
          "voiceover": "口播台词",
          "prompt": "这一段的画面、动作、台词和转场"
        }
      ],
      "seo": {
        "title": "发布标题",
        "hashtags": ["#标签"],
        "coverText": "封面文案",
        "interactionGuide": "评论引导",
        "description": "发布描述"
      }
    }
  ]
}`
}

func fashionFinalizePrompt() string {
	return `你负责把服饰带货分镜定稿成一条可直接提交的中文视频提示词，并给每个分段一段对应提示词。
成片是一条提示词，一次生成整段。按这个顺序写：场景、参考图用途、按秒分段的景别视角动作台词转场、灯光、色彩、竖屏输出、锁定。
锁定：人物外貌全程一致；衣服颜色、版型、图案与服饰单品参考一致；光线方向全程不变；匹配剪辑时身体位置相同；嘴型与台词对应。
` + realisticLook() + `
图片编号只能使用给出的参考顺序。参考顺序里已经有场景时，场景必须使用那个编号，即使这一步没有场景原图。鞋或包不要写换装和面料飘动。
另外写两张静帧绘图提示词，不写口播、运镜时间轴、字幕或价格。personImagePrompt 按整段叙事里的出镜状态画一个人，外貌锁给出的人物和人脸。sceneImagePrompt 按脚本里的那一个空间画场景；没有场景原图时只靠文字。衣服不在这两张静帧里改款。两张静帧同样使用上面的实拍风格。
不要字幕、贴纸、大字或价格条。不要编造资料里没有的尺码、链接、置顶、功效、评价、销量或优惠。
只输出 JSON：{"fullPrompt":"整段提示词","personImagePrompt":"人物静帧","sceneImagePrompt":"场景静帧","prompts":[{"shotId":1,"prompt":"这一段提示词"}]}`
}

func fashionReferenceNote(payload map[string]any) string {
	raw, _ := payload["fashionReferences"].(map[string]any)
	person, face, scene := false, false, false
	if raw != nil {
		person, _ = raw["person"].(bool)
		face, _ = raw["face"].(bool)
		scene, _ = raw["scene"].(bool)
	}
	lines := []string{"服饰参考："}
	if person {
		lines = append(lines, "有出镜人物。")
	} else {
		lines = append(lines, "还没有出镜人物。")
	}
	if face {
		lines = append(lines, "有单独人脸特写。")
	} else {
		lines = append(lines, "没有单独人脸，人物图同时锁定脸。")
	}
	if scene {
		lines = append(lines, "有场景参考。")
	} else {
		lines = append(lines, "没有场景图，场景只写文字，不要编造场景图片编号。")
	}
	lines = append(lines, "衣服从商品图里选定，这一步不要写死图片编号。")
	return strings.Join(lines, "")
}

type fashionRef struct {
	Slot       string
	Label      string
	URL        string
	ImageIndex int
}

func parseFashionOrder(payload map[string]any) ([]fashionRef, error) {
	raw, ok := payload["referenceOrder"].([]any)
	if !ok || len(raw) == 0 {
		return nil, fmt.Errorf("请上传出镜人物并保留一件商品图")
	}
	refs := make([]fashionRef, 0, len(raw))
	for _, item := range raw {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		slot := strings.TrimSpace(generate.StringField(obj, "slot"))
		label := strings.TrimSpace(generate.StringField(obj, "label"))
		url := strings.TrimSpace(generate.StringField(obj, "url"))
		if slot == "" || label == "" || (url == "" && slot != "scene") {
			continue
		}
		refs = append(refs, fashionRef{Slot: slot, Label: label, URL: url, ImageIndex: generate.IntField(obj, "imageIndex")})
	}
	if !fashionHasSlot(refs, "person") || !fashionHasSlot(refs, "garment") {
		return nil, fmt.Errorf("请上传出镜人物并保留一件商品图")
	}
	return refs, nil
}

func fashionHasSlot(refs []fashionRef, slot string) bool {
	for _, ref := range refs {
		if ref.Slot == slot {
			return true
		}
	}
	return false
}

func fashionOrderText(refs []fashionRef) string {
	lines := make([]string, 0, len(refs))
	for i, ref := range refs {
		if ref.Slot == "scene" && ref.URL == "" {
			lines = append(lines, fmt.Sprintf("图片%d：%s（没有原图，按脚本生成）", i+1, ref.Label))
			continue
		}
		lines = append(lines, fmt.Sprintf("图片%d：%s", i+1, ref.Label))
	}
	return strings.Join(lines, "\n")
}

func normalizeFashionBeat(beat, productName string) string {
	switch strings.TrimSpace(beat) {
	case "unbox", "lifestyle", "accessory":
		return strings.TrimSpace(beat)
	}
	if fashionAccessoryName(productName) {
		return "accessory"
	}
	return "unbox"
}

func fashionAccessoryName(name string) bool {
	if strings.Contains(name, "衣") || strings.Contains(name, "裤") || strings.Contains(name, "裙") || strings.Contains(name, "外套") {
		return false
	}
	return strings.Contains(name, "鞋") || strings.Contains(name, "包")
}
