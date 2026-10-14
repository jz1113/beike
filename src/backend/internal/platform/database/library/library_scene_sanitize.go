package library

import (
	"regexp"
	"strings"
)

var scenePromptRules = []struct {
	pattern *regexp.Regexp
	replace string
}{
	{regexp.MustCompile(`(?:一张)?(?:真实|高清|唯美)?(?:摄影|人像|商业|胶片|胶卷)?(?:照片|大片|特写|画面)[，,\s]*`), ""},
	{regexp.MustCompile(`(?:一位|一个)?(?:年轻|成熟)?(?:东方|中国|亚洲|金发|金橙色|橙金|橙发|橙卷发|黑发|黑长直|棕发|浅金短发|卷发|短发)?(?:女性|女子|女生|模特|女郎|行人|博主|人物|名媛)`), ""},
	{regexp.MustCompile(`(?:她|他)?(?:留着|蓄着|顶着|剪着|有着)?[^，。；;\n]*(?:卷发|直发|短发|长发|发型|马尾|发夹|头饰|发饰|海星发夹|发带)[，。；;\s]*`), ""},
	{regexp.MustCompile(`(?:双手|单手)?(?:前伸|举至|微举|下垂|放于|搭在|托腮|托下巴|比出|比心|遮阳|掩面|掩嘴|侧立|前倾|盘腿|站立|行走|漫步|奔跑|跳跃|跃起|大笑|露齿甜笑|微笑|欢笑|微表情|神情|眼神|回眸|侧颜)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:身着|身穿|穿着|穿搭|搭配|穿|内搭|外搭|套着|裹着|下穿|下着|系有|系着|系|单肩挂|挂有|肩挎|手提|手拿|手握|背着|挎着|拿着|佩戴|戴有|戴着|脚穿|脚蹬|穿鞋)?[^，。；;\n]*?(?:开衫|衬衫|短裙|长裙|半身裙|连衣裙|百褶裙|蓬蓬裙|马面裙|白裙|黑裙|红裙|吊带裙|蕾丝裙|蕾丝白裙|牛仔裤|长裤|短裤|西裤|休闲裤|夹克|大衣|风衣|西装|T恤|卫衣|外套|针织衫|毛衣|马甲|吊带|上衣|下装|服饰|运动鞋|球鞋|板鞋|高跟鞋|皮鞋|靴子|乐福鞋|凉鞋|镂空凉鞋|拖鞋|围巾|轻纱围巾|薄纱围巾|薄荷绿围巾|淡绿围巾|浅绿围巾|绿色围巾|丝巾|披肩|堆堆袜|袜子|手袋|皮包|小包|背包|手提包|单肩包|斜挎包|草帽|遮阳帽|帽子|贝雷帽|手链|手串|手镯|手圈|戒指|项链|锁骨链|吊坠|耳环|耳饰|耳钉|发饰|发簪|发带|头巾|海星发夹)`), ""},
	{regexp.MustCompile(`(?:^|[，。；;\s])(?:裙|衫|裤|鞋|袜|帽|包|链|饰|装|上衣|下装)[，、。；;\s]*`), " "},
	{regexp.MustCompile(`(?:身着|身穿|穿着|穿搭|搭配|服饰|服装)[：:\s]*[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:手腕露|露腕|微挽衣袖|锁骨线条清晰|身材修长|体态优雅)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`(?:呈现)?(?:原生相机直出质感与)?(?:真实)?(?:皮肤次表面散射|次表面散射皮肤|次表面散射|真实皮肤毛孔|微观皮肤肌理|细微毛孔与微小瑕疵|真实皮肤毛孔与微小瑕疵|微透光血色|皮肤纹理|面部细微毛孔|保留毛孔呼吸感|皮肤质感|白皙透光肤质|红润气色)[^，。；;\n]*`), ""},
	{regexp.MustCompile(`[0-9]+mm\s*(?:f\/[0-9.]+)?\s*(?:商业)?\s*(?:35mm\s*RAW)?\s*(?:真实街景全景构图|全景构图)[。，]*`), "真实自然空间透视构图。"},
	{regexp.MustCompile(`(?:85mm|100mm|50mm)?\s*(?:人像特写|人像镜头|特写人像|专业人像|人像摄影|微距视角|特写摄影|人像微距)[^，。；;\n]*`), "真实生活空间环境"},
	{regexp.MustCompile(`(?:大光圈|超浅景深|浅景深|焦外|背景)?\s*(?:高斯散景|奶油般散景|光斑虚化|大面积虚化|柔和虚化|虚化模糊|虚化背景|背景为虚化|虚化)[^，。；;\n]*`), "真实建筑硬装与空间自然透视，真实物理材质微瑕肌理"},
	{regexp.MustCompile(`(?:端坐在|坐在|站立在|奔跑在|漫步在|行走在|倚靠在|停留于|穿梭于|伫立在|迎面走来|走来|走向)`), ""},
	{regexp.MustCompile(`背景(?:是|为|可见|包含|处有)?\s*`), ""},
	{regexp.MustCompile(`边缘光自然自然`), "边缘光自然通透"},
	{regexp.MustCompile(`[，、\s]+([。；;])`), "$1"},
	{regexp.MustCompile(`^[，、；;\s。]+`), ""},
	{regexp.MustCompile(`[，、；;\s]+$`), ""},
	{regexp.MustCompile(`，\s*，+`), "，"},
	{regexp.MustCompile(`、\s*、+`), "、"},
	{regexp.MustCompile(`；\s*；+`), "；"},
	{regexp.MustCompile(`。\s*。+`), "。"},
}

var sceneMotionPattern = regexp.MustCompile(`(?:在)?(?:树影斑驳|绿意盎然|阳光洒满|静谧|开阔)?(?:的)?(?:草坪|石阶|街道|木栈道|茶园|回廊|室内|窗前)?(?:上|前|畔|中|里)?(?:迎面走来|迎面走向|缓缓走来|走来|走向|走去|踱步|转身|回头|凝望|注视|端坐|盘坐|站立|侧立|侧身|托腮|抚发|遮阳|比心|微笑|露齿笑|露齿甜笑|大笑|奔跑|漫步|跳跃|伫立|倚靠|前倾)[^，。；;\n]*`)
var sceneMotionPlace = regexp.MustCompile(`(?:树影斑驳|绿意盎然|阳光洒满|静谧|开阔)?(?:的)?(?:草坪|石阶|街道|木栈道|茶园|回廊|室内|窗前)`)

func sanitizeScenePrompt(raw string) string {
	if raw == "" {
		return ""
	}
	text := raw
	for index, rule := range scenePromptRules {
		if index == 3 {
			text = sceneMotionPattern.ReplaceAllStringFunc(text, func(match string) string {
				if place := sceneMotionPlace.FindString(match); place != "" {
					return place
				}
				return ""
			})
		}
		text = rule.pattern.ReplaceAllString(text, rule.replace)
	}
	text = strings.TrimSpace(text)
	if len([]rune(text)) == 0 {
		return "真实生活美学置景空间，建筑硬装与植物环境质感扎实细腻，自然漫反射采光与扎实物理接触阴影，真实空间透视。"
	}
	return text
}
