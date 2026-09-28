/**
 * Read a reusable screen *visual* from one reverse-analysed mother shot.
 * The product photo supplies the handset, never the screen's fake UI.
 */
const SCREEN_MENTION = /(?:正面|亮起的|点亮的)?(?:屏幕|屏显|显示屏)(?:画面|内容|中|内|上|里)?|(?:手机|锁屏)壁纸|(?:正面)?亮屏/;
const SCREEN_HEADING = /^(?:正面)?(?:屏幕|屏显|显示画面|壁纸)(?:内容|画面|风格|状态)?$/;
const OBSERVATION_HEADING = /^(?:主体|穿搭或物体细节|物体细节|材质与真实感|画面总览|屏幕|屏显|正面屏幕|显示画面|壁纸)(?:内容|画面|风格|状态)?$/;
const UNLIT_SCREEN = /熄屏|黑屏|息屏|熄灭|未亮屏|未点亮|屏幕关闭|屏幕未亮|屏幕不亮|屏幕无显示|没有显示|屏幕内容(?:不清|看不清|无法确认|不可辨)|无法确认|不能辨认|不可辨认|无可见(?:画面|内容)|空白屏|白屏过曝/;
const UI_CONTENT = /(?:时间|通知|消息|聊天|状态栏|导航栏|应用|图标|文字|文本|数字|号码|品牌|商标|标志|水印|促销|价格|广告|参数|二维码|乱码|界面按钮|锁屏时钟|系统桌面|系统界面|手机桌面|APP|App|Logo|logo|UI)(?:内容|信息|标识|排列|显示|为|是)?/;
const INSTRUCTION_LIKE = /忽略(?:以上|之前|所有)?(?:规则|指令|提示)|(?:必须|务必|请|禁止|不要|执行|输出).{0,16}(?:规则|提示词|商品|模型|系统)/;
const OLD_BRAND = /(?:荣耀|华为|小米|红米|苹果|三星|一加|真我|魅族|努比亚|索尼|摩托罗拉|vivo|VIVO|oppo|OPPO|iQOO|IQOO|realme|Realme|iPhone|iphone|Pixel|Google|Samsung|Honor|Huawei|Redmi|Xiaomi)(?=.{0,8}(?:壁纸|画面|海|山|蓝|绿|红|紫|粉|黑|白|渐变|纹理|插画|风景)|$)/g;
const PRODUCT_STRUCTURE = /机身|背板|后摄|镜头模组|充电口|手机壳|保护壳|按键|接口|包装盒|边框厚度|前摄开孔/;
const VISUAL_SUBJECT = /海洋|海水|海底|海岸|海滩|沙滩|鲸|鲨鱼|鱼群|水母|珊瑚|波浪|水波|湖泊|河流|瀑布|雪山|山脉|峡谷|冰川|蓝天|天空|云层|白云|森林|树林|草地|沙漠|日落|落日|日出|朝霞|晚霞|极光|彩虹|星空|银河|星云|宇宙|月亮|花朵|花卉|植物|猫咪|狗狗|猫|狗|飞鸟|鸟|兔子|狐狸|熊猫|老虎|狮子|鹿|蝴蝶|动物|城市|夜景|街景|建筑|人像|肖像|人物剪影|女性肖像|男性肖像|油画|水彩|版画|浮世绘|手绘|涂鸦|艺术图案|装饰图案|线条图案|流体艺术|数字艺术|摄影作品|渐变|抽象|几何|纹理|色块|光斑|插画|风景/;
const VISUAL_COLOR = /深蓝|浅蓝|湛蓝|湖蓝|藏蓝|冷蓝|暖橙|橙色|蓝色|紫色|粉色|绿色|金色|银色|黑白|灰色|白色|红色|黄色|青色|橘色|棕色|冷色|暖色|低饱和|高饱和/;
const VISUAL_COMPOSITION = /居中|中央|上下分层|左右分层|上方|下方|前景|背景|留白|明暗|逆光|柔光|漫射|光感|亮度|反光/;
const SCREEN_CONTENT_LEAD = /^(?:显示|呈现|播放|展示|铺满|有一幅|有一张|可见|绘有|亮着|亮起后显示|点亮后显示|是一幅|为一幅|为|是|手机壁纸为|锁屏壁纸为|壁纸为|壁纸是)/;
const SCREEN_CONTEXT = /屏幕|屏显|屏内|显示区|壁纸|画面内|画面中/;

function cleanClause(clause: string): string {
  return clause
    .replace(/@[\s]*图片\d+/g, '')
    .replace(/[“「『]([^”」』]{0,60})[”」』]/g, (_, inner: string) => (
      visualEnough(inner) && !UI_CONTENT.test(inner) ? inner : ''
    ))
    .replace(OLD_BRAND, '')
    .replace(/(?:和|及|以及|同时|并)?(?:顶部|顶端|上方|右上角|左上角)?(?:显示|出现)?(?:时间|通知|消息|状态栏|导航栏|应用|图标|文字|文本|数字|号码|品牌|商标|标志|水印|促销|价格|广告|参数|二维码|乱码|界面按钮|锁屏时钟|系统桌面|系统界面|手机桌面|APP|App|Logo|logo|UI)[^，,；;。]*/g, '')
    .replace(/\b[A-Za-z][A-Za-z0-9._-]*\b/g, '')
    .replace(/\b\d+(?::\d+)?\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[：:、，,\s]+|[：:、，,\s]+$/g, '')
    .trim();
}

function visualEnough(text: string): boolean {
  if (VISUAL_SUBJECT.test(text) || VISUAL_COLOR.test(text)) return true;
  if (/原商品|商品图|参考图|原图|系统|界面|桌面/.test(text)) return false;
  const subject = text.replace(/^(?:显示|呈现|播放|展示|铺满|是|为|一幅|一张|一段|一只|一个)+/, '')
    .replace(/(?:壁纸|画面|影像|照片|视频|插画|动画)+$/, '')
    .trim();
  return /壁纸|画面|影像|照片|视频|插画|动画/.test(text) && /[\p{Script=Han}]{2,}/u.test(subject);
}

function extractFromSentence(sentence: string, dedicated: boolean): string | null {
  // A semicolon normally ends the screen description. Never borrow scenery
  // from a later background/product clause to fill an empty screen.
  for (const segment of sentence.split(/[；;]/)) {
    const screen = segment.match(SCREEN_MENTION);
    if (!dedicated && !screen) continue;
    const tail = dedicated && !screen ? segment : segment.slice((screen?.index || 0) + (screen?.[0].length || 0));
    if (/^(?:外|以外|之外|周围|旁边|背后|背景)/.test(tail.trim())) continue;
    const parts = tail.split(/[，,]/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length || UNLIT_SCREEN.test(parts[0])) continue;
    const first = SCREEN_CONTENT_LEAD.test(parts[0]) || /壁纸|显示|播放|呈现|展示|画面/.test(screen?.[0] || '')
      ? parts.shift() || ''
      : parts.length > 1 && SCREEN_CONTENT_LEAD.test(parts[1]) ? (parts.shift(), parts.shift() || '') : '';
    if (!dedicated && !first) continue;
    const primary = cleanClause(first || parts.shift() || '');
    if (!primary || UI_CONTENT.test(primary) || PRODUCT_STRUCTURE.test(primary) || INSTRUCTION_LIKE.test(primary) || !visualEnough(primary)) continue;
    const visual = [primary];
    for (const part of parts) {
      if (/^(?:背景|背后|旁边|周围|外部|机身|手机)/.test(part) && !SCREEN_CONTEXT.test(part)) break;
      const clause = cleanClause(part);
      if (!clause || UNLIT_SCREEN.test(clause) || UI_CONTENT.test(clause) || PRODUCT_STRUCTURE.test(clause) || INSTRUCTION_LIKE.test(clause)) continue;
      if (!SCREEN_CONTEXT.test(part) && !VISUAL_COMPOSITION.test(clause) && !VISUAL_SUBJECT.test(clause) && !VISUAL_COLOR.test(clause)) continue;
      visual.push(clause);
      if (visual.join('，').length >= 110 || visual.length >= 3) break;
    }
    return visual.join('，').slice(0, 120).replace(/[，、\s]+$/g, '');
  }
  return null;
}

/**
 * Returns null for an unlit, illegible, or UI-only display. Never emits exact
 * time, notification, app, brand, pricing, or other textual interface details.
 */
export function extractTemplatePhoneScreenStyle(sourcePrompt: string): string | null {
  const prompt = String(sourcePrompt || '').trim();
  if (!prompt) return null;
  const sections = [...prompt.matchAll(/【([^】]+)】/g)];
  const candidates: Array<{ text: string; dedicated: boolean }> = [];
  if (sections.length) {
    for (let index = 0; index < sections.length; index += 1) {
      const heading = sections[index][1].trim();
      if (!OBSERVATION_HEADING.test(heading)) continue;
      const start = (sections[index].index || 0) + sections[index][0].length;
      const end = sections[index + 1]?.index ?? prompt.length;
      const dedicated = SCREEN_HEADING.test(heading);
      for (const sentence of prompt.slice(start, end).split(/[。！？\n]/).map((part) => part.trim()).filter(Boolean)) {
        candidates.push({ text: sentence, dedicated });
      }
    }
  } else {
    for (const sentence of prompt.split(/[。！？\n]/).map((part) => part.trim()).filter(Boolean)) {
      candidates.push({ text: sentence, dedicated: false });
    }
  }
  for (const candidate of candidates) {
    const style = extractFromSentence(candidate.text, candidate.dedicated);
    if (style) return style;
  }
  return null;
}
