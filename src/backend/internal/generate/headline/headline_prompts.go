package headline

import "strings"

func coverDirectorPrompt(original, cover, ratio, product, previous string, memory []string) string {
	var builder strings.Builder
	builder.WriteString("你是小红书封面的美术指导，像在向同事讲这一张封面怎么被读到。一次出图完成商品、背景和标题，不要拆成白底图再本地排字。")
	builder.WriteString("画布比例 " + ratio + "。原标题：" + original + "。封面标题：" + cover + "。商品名：" + product + "。")
	builder.WriteString("硬约束：商品水平居中，占画面高度 62%–74%；标题至少一行咬住商品上沿；标题保持给定的 7–12 个汉字并逐字使用；颜色不超过三色，一色属于商品，一色属于标题，一色属于背景；禁止在背景新增文字、数字、字母、Logo、价格、水印或二维码；商品本体的标识、型号和丝印必须保留。")
	if len(memory) > 0 {
		builder.WriteString("已采纳的封面记忆，纠正优先于样张共性：")
		builder.WriteString(strings.Join(memory, ""))
		builder.WriteString("。设计必须遵守这些记忆；没有对应记忆的栏位按硬约束自行判断。")
	} else {
		builder.WriteString("当前没有已采纳的封面记忆。按硬约束完成七栏，可参考冷启动示例，但不要套用固定风格名。")
	}
	if strings.TrimSpace(previous) != "" {
		builder.WriteString("本批上一张封面：" + strings.TrimSpace(previous) + "。variation 必须写出和上一张相比只改了哪一个决定。")
	}
	builder.WriteString("只返回 JSON，字段 title、titleLines、productNameLine、composition、material、palette、typographySystem、typography、visualAnchor、styleFamily、imagePrompt、layout、typeface、textColor、background、subject、harmony、variation。")
	builder.WriteString("layout 写视线落点、标题咬住商品的哪一条边，以及留白如何托住标题。")
	builder.WriteString("typeface 把标题写成一块图形：字族、字重、行数、每行字数、字距，两行时哪一行更重，修饰只留一种。")
	builder.WriteString("textColor 先看标题落点的背景明度，再写标题色；描边和衬底只留一种，并说明为什么能立刻读清。")
	builder.WriteString("background 只写一种材质、光向、接触阴影，以及标题背后为什么明度均匀。")
	builder.WriteString("subject 写商品或人物如何占住中部，以及不能挡住的识别点。")
	builder.WriteString("harmony 写三色分工：哪一色来自商品，哪一色做标题，哪一色做背景。")
	builder.WriteString("variation 和上一张只改一个决定：构图、字体修饰、背景材质或字色。没有上一张就写为什么选现在这个咬合方式。")
	builder.WriteString("titleLines 拼接必须等于封面标题。imagePrompt 为 450 到 1000 字，先写标题怎么被读到，再写它怎么咬住商品，然后写主体锁定、背景只做一件事、三色分工、和上一张的差别，并用「」逐行列出标题。")
	return builder.String()
}

func coverDeconstructPrompt(imageCount int) string {
	shared := `每栏都是对象，包含 rule 和 evidence。rule 是一句可直接执行的设计规则；evidence 写这张图的哪个位置支持这句话。
{
  "layout": {"rule":"构图、主体占高、锚点和标题压住商品的哪一条边","evidence":"图上位置"},
  "typeface": {"rule":"字族、字重、行数、字距和这一张只用的一套修饰","evidence":"图上位置"},
  "textColor": {"rule":"标题色、描边或衬底色，以及字色如何迁就背景明度才能读清","evidence":"图上位置"},
  "background": {"rule":"只一种背景材质、光从哪来、接触阴影、哪里留出均匀底给标题","evidence":"图上位置"},
  "subject": {"rule":"商品或人物怎么摆、哪些识别点不能挡、人和手是否出现","evidence":"图上位置"},
  "harmony": {"rule":"标题色、商品色、背景色如何只留三色，以及为什么这样好看","evidence":"图上位置"},
  "variation": {"rule":"这组封面允许变化的槽；单张就写这张最值得记住的取舍","evidence":"图上位置"},
  "summary": "一句话概括这套封面语法，不超过60字"
}`
	if imageCount > 1 {
		return "你是封面设计导演。对比这 " + itoa(imageCount) + " 张同类封面，提炼可以复用的排版、字体、字色、背景和主体规则。严格只输出 JSON，不要解释。\n" + shared
	}
	return "你是封面设计导演。拆解这张封面的排版、字体、字色、背景和主体，供以后生成封面时遵守。严格只输出 JSON，不要解释。\n" + shared
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
