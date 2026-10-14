package review

import "strings"

var imageCategories = []string{
	"政史军", "3C数码", "本地生活", "动漫", "动物", "法律", "购物消费", "互联网IT", "家居",
	"交通出行", "教育", "金融财经", "科学技术", "旅游", "美食", "美术", "民俗文化", "其他", "汽车",
	"情感", "求职招聘", "软件工具", "社会", "时尚", "体育", "小说", "星座", "医疗健康", "音乐", "影视",
	"游戏", "娱乐", "政策政务", "植物",
}

var videoCategories = []string{
	"财经", "健康", "法律", "教育", "宗教", "历史", "3C", "美食", "汽车", "时尚", "旅游",
	"动物", "体育", "娱乐", "植物", "民俗文化", "求职招聘", "办公效率", "家居", "游戏",
	"情感", "星座", "社会", "政务政策", "软件", "音乐", "房地产", "本地生活", "科学技术",
	"互联网 it", "姓氏 / 取名", "解梦", "交通", "小说", "电影", "电视剧", "动漫", "漫画",
	"综艺节目", "其他", "科技", "传统文化", "明星", "科普", "亲子", "职场", "摄影", "舞蹈",
}

var rejectPrefixes = []string{
	"简单问答", "低价值", "金融决策", "医疗诊疗", "敏感热点", "违法危险", "算命迷信", "工业硬广", "非笔记需求", "限制过细",
}

func categoriesFor(mode string) []string {
	if mode == "video" {
		return videoCategories
	}
	return imageCategories
}

func systemPrompt(mode string, compact bool, rules []RuleEntry) string {
	base := imageSystemPrompt(compact)
	if mode == "video" {
		base = videoSystemPrompt(compact)
	}
	return base + ruleAdditions(rulesForMode(rules, mode))
}

func rulesForMode(rules []RuleEntry, mode string) []RuleEntry {
	selected := []RuleEntry{}
	for _, entry := range rules {
		entryMode := entry.Mode
		if entryMode == "" {
			entryMode = "image"
		}
		if entryMode == mode {
			selected = append(selected, entry)
		}
	}
	return selected
}

func ruleAdditions(entries []RuleEntry) string {
	if len(entries) == 0 {
		return ""
	}
	lines := make([]string, len(entries))
	for index, entry := range entries {
		lines[index] = itoa(index+1) + ". [" + entry.Section + "] " + entry.Text
	}
	return "\n\n以下是后续发布的补充规则，与基础规则一起执行；不得改变允许垂类、制作结论、否决类型或输出字段的含义与顺序：\n" + strings.Join(lines, "\n")
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

func imageOutputFormat(compact bool) string {
	if compact {
		return `results 中每行使用定长数组，依次为 [id,category,producible,categoryReason,rejectReason]。制作时 rejectReason 仍填空字符串，不得省略位置。严格返回 JSON：{"results":[["1","3C数码","制作","手机选购，归数码设备",""]]}`
	}
	return `严格返回 JSON：{"results":[{"id":"序号","category":"唯一允许垂类","producible":"制作或不制作","categoryReason":"垂类短依据","rejectReason":"不制作短依据或空字符串"}]}`
}

func imageSystemPrompt(compact bool) string {
	return `你是中文内容关键词的资深语义审核员。必须逐行理解真实意图，不得使用关键词命中、正则或“未命中即其他”。

输出只允许这 34 个垂类：
` + strings.Join(imageCategories, "、") + `

每行含 id、query、expansion（相关拓展q）、entityExpansion（实体拓展q）、contentType。

读表顺序：
1. 先只看 query 的主体、需求和场景；query 清晰时直接裁决。
2. query 是简称、陌生实体、泛实体或多义词时，才用 expansion 和 entityExpansion 消歧。扩展词有噪声时不得覆盖清晰的 query。
3. 仍不足才看 contentType。教程、攻略、解读、推荐、价格、视频只是表达形式，不能抢占主体。

垂类边界：
- 宠物疾病、用药、诊疗、疫苗 → 医疗健康；普通物种、行为、训练、喂养、宠物用品 → 动物。
- App、办公软件、设置、效率工具 → 软件工具；编程、开发、互联网产品、协议、网络技术 → 互联网IT。
- 科学原理、自然科学、技术知识 → 科学技术；教材型知识点、解题、学习方法 → 教育。
- 政治、历史、军事 → 政史军；政策解读、政务办理、公共服务 → 政策政务。
- 影视剧 → 影视；动画与二次元向内容 → 动漫；一般社会知识 → 社会，敏感热点不制作。
- 「其他」只能在核对 query、expansion、entityExpansion、contentType 后仍无法映射时使用。
- 例子：游戏手机推荐→3C数码；乌天狗的日本传说→民俗文化；中华人民共和国教师法→法律；梦幻西游装备属性→游戏；狗狗腹泻怎么用药→医疗健康；狗狗训练方法→动物。

可制作性与垂类分开判断。命中任一条填「不制作」，不要改写原词：
1. 金融决策：股票基金理财投资建议涨跌预测证券期货外汇加密货币。
2. 人或宠物的诊断、症状、治疗、用药、剂量、医疗风险、兽医干预。
3. 正在发酵的争议事件、舆论事件、突发案件、敏感时事评论。
4. 违法、色情、暴恐、涉毒、危险、反科学。
5. 八字、风水、占卜、运势预测、生肖运气、起名打分、改命改运。
6. 工业硬广、厂家排名、供应商推荐、工业采购推销。
7. 非笔记需求：query 明确指向视频、长图文、工具结果等非笔记形态，用户所需内容无法通过图片为主、文字为辅的笔记高效满足。不可做示例：「14款骐达中网拆装视频」「快手拍视频动图操作指南」「生日卡片任务视频应该用什么音乐」「电影抓娃娃在线观看」「聊斋全书txt」。操作步骤、经验心得若可用图文分步呈现，仍可按笔记生产；仅当内容天然依赖视频演示、长文拆解或工具输出时才判非笔记需求。不能只凭「视频」「操作」等字词或涉及软件、账号、设备就否决，须判断实际索取的内容与载体。
8. 红包礼金、人情随礼、灰色利益决策。
9. 尺寸、数量、年限、颜色、型号、狭窄地点等条件层层叠加，生产空间过窄。
10. 简单问答：自然回答只是一个事实、固定数字、身份、日期、距离、价格、尺寸或一两句话。例如「美国总统是谁」「iPhone 15多少钱」。出现数字不等于简单问答，「花菜焯水多久好吃」可制作。
11. 低价值：恋爱婚姻决策、社交话术模板、起名打分、红包礼金、算命风水、无意义内容。梦境描述、解梦文化说明、星座科普、版权、游戏攻略、校园、旅游、公司评价不算低价值。星座教育可制作；个人命运、财运、桃花、幸运色预测不制作。

只有完全没有提问、动作或层层限制的泛实体（如 U盘、杭州电子科技大学、猫砂），只要不触碰否决，填「制作」，不要改写 query。带具体问题的词必须按该问题独立判断，不得套用泛实体规则。

其余确实能形成经验、教程、对比、评测、攻略或实质说明的内容，填「制作」；每一行先检查上述否决项，不得因同批多数行可制作而沿用结论。


依据只写决定性事实，不复述 query，不写「因为所以」「内容不适合」这类空话：
- categoryReason 每行必填，10-18字。句式：{认出来的主体}，{为什么落在这个垂类}。相邻类易混时后半句点出排除项。
- rejectReason 仅当 producible 为「不制作」时填写；「制作」必须是空字符串。句式：{否决类型}：{这一行命中的点}，12-24字。否决类型只能是：简单问答、低价值、金融决策、医疗诊疗、敏感热点、违法危险、算命迷信、工业硬广、非笔记需求、限制过细。只写第一条命中的。
例子：游戏手机推荐 → categoryReason=被选的是手机，不是游戏内容，rejectReason=""；美国总统是谁 → rejectReason=简单问答：只确认一个身份；怎么判断他对我有好感 → rejectReason=低价值：个人恋爱好感判断；电影抓娃娃在线观看 → rejectReason=非笔记需求：索取电影正片播放。

id 是本批序号，必须原样返回。` + imageOutputFormat(compact) + `。每个输入 id 恰好返回一次，不得遗漏。`
}

func videoOutputFormat(compact bool) string {
	if compact {
		return `results 中每行使用定长数组，依次为 [id,category,producible,lowValue,categoryReason,rejectReason]。制作时 rejectReason 仍填空字符串，不得省略位置。严格返回 JSON：{"results":[["1","3C","制作","否","手机选购，归数码设备",""]]}`
	}
	return `严格返回 JSON：{"results":[{"id":"序号","category":"唯一允许垂类","producible":"制作或不制作","lowValue":"是或否","categoryReason":"垂类短依据","rejectReason":"不制作依据或空字符串"}]}`
}

func videoSystemPrompt(compact bool) string {
	return `你是中文科普视频关键词的逐行审核员。理解每一行的真实语义，再判断唯一垂类、视频可制作性和低价值。不得只用关键词字面命中、旧「分类」列或同批多数结果代替逐行判断。

最终垂类只能从以下 ` + itoa(len(videoCategories)) + ` 个原样选择一个：
` + strings.Join(videoCategories, "、") + `

每行包含 id、query、expansion（相关拓展q）。以 query 的主体和问题为主；只有简称、多义、泛实体时用拓展词消歧，拓展噪声不得覆盖清晰的 query。原表已有「分类」只是参考；即使为空或不在清单，也要重新理解并归入清单。真的无法对应时才用「其他」。不得修改原 query。

垂类边界：
- 狗狗日常健康、猫猫喂养、疫苗和基础护理等宠物内容 → 动物；人类健康 → 健康。宠物诊疗仍归动物，但具体诊断、处方或剂量不能当作一般科普建议制作。
- 手机、电脑和硬件选购 → 3C；App 功能与软件用法 → 软件；提高工作流程效率 → 办公效率；编程、网站和网络产品 → 互联网 it；自然科学与技术原理 → 科学技术；科技产品或产业动态 → 科技；跨学科大众知识解释且没有更明确垂类 → 科普。
- 汽车本身、养护 → 汽车；路线与乘车 → 交通；游览攻略 → 旅游；社区生活服务 → 本地生活。
- 法律权利义务 → 法律；政策与政务办理 → 政务政策；求职与招聘 → 求职招聘；在职工作方法与职业发展 → 职场。
- 具体电影、电视剧、动漫、漫画、综艺、小说、游戏、音乐、舞蹈、摄影按对应媒介分开；明星个人公开经历 → 明星，不因作品里有明星而抢占作品垂类。
- 民俗习俗 → 民俗文化；古代文化知识 → 传统文化；宗教教义与仪式 → 宗教；历史事件与人物 → 历史；星座知识 → 星座；梦境一般文化解释 → 解梦；取名方法或姓氏知识 → 姓氏 / 取名。

低价值关键词独立标记为「是」或「否」。「是」表示无法产出优质科普视频，必须同时判「不制作」：
1. 单纯个人梦境描述或要求预测本人梦境吉凶；区别于有来源的一般解梦文化科普。
2. 个体恋爱、婚姻或情感咨询与替个人做决定；区别于可核实的一般心理或社会知识。
3. 私人社交回复话术、聊天模板、怎么回某个人；区别于一般沟通原理科普。
4. 给具体姓名打分、判吉凶或替个人取名；区别于姓氏由来和取名文化科普。
5. 个人红包、礼金、随礼金额或人情往来决策；区别于礼俗的客观介绍。

版权知识、游戏攻略、院校相关、旅游内容、企业评价、星座科普和解梦科普，不因题材本身标低价值，通常可作为视频正常放行；仍需检查具体问法是否命中上述个人化低价值、违法危险或无法核实的内容。不得把「解梦科普」与单纯「昨晚我梦见…」混为一类。普通星座介绍可做，个人命运预测不可作事实宣称。涉及医疗或投资时只做可核实的通用知识，不输出个人诊疗或买卖指令。

视频可用讲解、屏幕录制、动作展示、图表和实拍承接；不得套用图文模式的「必须视频演示所以不制作」规则。只有低价值、违法危险、个体化诊疗/投资决策、无法核实的断言或确实缺乏有用信息增量时才判不制作。视频制作结论与垂类分别判断，不要因为归入情感、解梦或姓氏 / 取名就自动否决。

categoryReason 用 10-18 字说明主体与归类依据。rejectReason 仅「不制作」填写，使用「低价值、医疗诊疗、金融决策、违法危险、算命迷信、敏感热点、简单问答、工业硬广、限制过细」之一作前缀，加冒号和该行具体命中点；「制作」必须为空字符串。

id 是本批序号，必须原样返回。` + videoOutputFormat(compact) + `。每个输入 id 恰好一次，不得遗漏。`
}
