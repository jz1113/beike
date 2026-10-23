package poster

import "strings"

func coverDirectorPrompt(original, cover, ratio, product, previous string, memory []string) string {
	var builder strings.Builder
	builder.WriteString("你是小红书封面的美术指导，像在向同事讲这一张封面怎么被读到。一次出图完成商品、背景和标题，不要拆成白底图再本地排字。")
	builder.WriteString("画布比例 " + ratio + "。原标题：" + original + "。封面标题：" + cover + "。商品名：" + product + "。")
	builder.WriteString("硬约束：商品水平居中，占画面高度 62%–74%；标题至少一行咬住商品上沿；标题保持给定的 7–12 个汉字并逐字使用；颜色不超过三色，一色属于商品，一色属于标题，一色属于背景；禁止在背景新增文字、数字、字母、Logo、价格、水印或二维码；商品本体的标识、型号和丝印必须保留。")
	if len(memory) > 0 {
		builder.WriteString("已采纳的封面记忆。纠正优先于这一张样张，不要把其他样张的特点混进来：")
		builder.WriteString(strings.Join(memory, ""))
		builder.WriteString("。设计必须遵守这些记忆；没有对应记忆的栏位按硬约束自行判断。")
	} else {
		builder.WriteString("当前没有已采纳的封面记忆。按硬约束完成七栏。")
		builder.WriteString(coverColdStart())
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

func coverColdStart() string {
	return "冷启动示例只供起稿，不能覆盖硬约束，也不要套用固定风格名：" +
		"美妆、穿搭、食品用米白纸纹和近黑超粗字，左上两行错位；" +
		"反差和结论用商品色对角色面，近黑超粗字加一条短下划线；" +
		"强品牌数码用近黑哑光底，暖白或黄色描边字压住产品；" +
		"高端小家电用有方向的柔光，近黑标题压住产品；" +
		"配件测评用浅冷几何，近黑标题顶边错位；" +
		"洗护和家电用纸感留白加一种真实材质，近黑标题咬住商品。"
}

func coverDeconstructPrompt() string {
	return `你是封面样张反推。只看这一张封面，保留它自己的特点。不要总结成多张封面的共性，也不要把它写成以后每次生成都要照做的通用规则。不要套用主体居中、标题压住商品、颜色不超过三色、背景只有一种材质这些生成限制。原样张是什么就写什么。看不清就写不确定，不要猜具体字体名称、材质或精确参数。
每栏都是对象，包含 observation、method、uncertainty。observation 写看得见的事实。method 写可以参考的做法，要能执行：位置、层级、字重、字距、颜色、遮挡和独有装饰。不要写风格名，也不要写好看、高级、杂志感。uncertainty 写看不清的地方，没有就留空。独有装饰写进对应栏，不要只留在 summary。
harmony 写这张图实际的配色分工，颜色可以超过三色，它会并入字色记忆。
variation 只写这一张最不同的一点，不会变成记忆条目。
{
  "layout": {"observation":"图上的构图和标题层级","method":"可以参考的位置、占位和咬合关系","uncertainty":""},
  "typeface": {"observation":"标题的行数、字重、字距和修饰","method":"可以参考的排版做法","uncertainty":""},
  "textColor": {"observation":"标题色和它所在的背景明度","method":"可以参考的字色关系","uncertainty":""},
  "background": {"observation":"背景里实际看见的材质、光和层次","method":"可以参考的背景做法","uncertainty":""},
  "subject": {"observation":"主体位置、遮挡关系和独有装饰","method":"可以参考的主体处理","uncertainty":""},
  "harmony": {"observation":"这张图实际出现的颜色","method":"这些颜色各自承担什么","uncertainty":""},
  "variation": {"observation":"这一张最不同的地方","method":"这个差别是什么","uncertainty":""},
  "summary": "用不超过60字概括这一张，保留独有特点"
}
严格只输出 JSON，不要解释。`
}
