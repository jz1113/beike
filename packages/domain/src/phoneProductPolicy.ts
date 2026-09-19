/** Product titles only: never classify a product from “Shot on iPhone” camera prose. */
export function isPhoneProduct(title = ''): boolean {
  const soldTitle = title.replace(/(?:赠送|赠|配赠)[^，,；;]{0,24}(?:手机壳|保护壳|钢化膜)/g, '');
  if (/手机壳|保护壳|保护套|手机挂绳|手机挂饰|钢化膜|屏幕膜|镜头膜|phone\s*case/i.test(soldTitle)) return false;
  return /手机|智能机|iphone|redmi|iqoo|红米|小米\s*\d|小米note|galaxy|pixel\s*\d|smartphone|(?:vivo|oppo|荣耀|honor|realme|一加|华为|huawei|三星|samsung|nova)\s*[a-z]*\s*\d/i.test(soldTitle);
}

/** Keep factual reverse-analysis separate from rules for reusing a reference. */
export const PHONE_REVERSE_POLICY = `
## 手机参考图专项解构（仅在画面出现手机或手机配件时执行）
- 在 analysis_summary 与 dimensions 的手机相关描述中分别记录：主体数量与朝向、是否商品正反面拼图/海报、裸机可见结构、手机壳、挂绳/挂饰、连接位置、磁吸环/贴纸、屏幕内容、包装盒；不可见或不确定写“无法确认”。这些都是观察记录，禁止从品牌常识推测。将本体与配件区别写入既有 dimensions.subject，将连接关系写入 dimensions.action_pose，保证母本与原子动作均可保留，不依赖新增字段。
- 透明壳边缘、镜头保护圈、磁吸圆环、支架与背板纹理分开描述；无法确定是否原生结构时，不能写进手机本体特征。
- 有挂饰时记录壳体挂孔或挂绳片是否可见及其连接关系。看不清连接点只记“连接方式无法确认”，不得脑补裸机孔洞。
- reverse_prompt 母本如实记录原图；scene 与 action 原子资产只迁移机位、光影、物理摆放和动作，不绑定参考手机型号、壳图案、促销文字或屏幕内容。需要配件的动作在 action 中注明配件及连接前提。
- 包装/开箱图在 action.title 与 tags 明确标记“包装盒/开箱”；正反面并列图标记“正反面组合展示”；配件主体标记“手机壳”或“挂绳配件”。不能把包装图包装成普通手机背面机位，也不能把两面拼图解释成一台双屏手机。
- 屏幕只记录可见的壁纸色调、构图、亮度、反光和 UI 布局；不抄通知隐私、促销文字，不虚构可读文字。`;

export const PHONE_GENERATION_POLICY = `【手机商品一致性约束】
以下规则优先于参考资产中的冲突内容，仅适用于本次手机商品：
1. 商品实物图用于识别目标手机的可见外观。若垫图包含正反面并列、多个颜色、包装或电商文字，视为资料组合图，不得整体复制其布局；选择当前目标款式及一个主视角，单张成片只出现一台手机。四宫格时每格各一台，不在同一格叠放正反两台；禁止把后摄、前屏拼到同一面，禁止复制促销字和悬浮贴膜。折叠屏只按参考中明确可见的铰链及状态，不臆造折叠结构。
2. 每镜明确正面、背面或侧面主视角。机身颜色、镜头数量/排布、闪光灯、边框、开孔、按键和标志以目标商品可见证据为准，不照搬资产中的旧手机；缺少某一面的可靠外观证据时优先选择已知面，不编造不可见细节。
3. 默认裸机；壳、挂绳、磁吸环、支架、贴纸均是独立配件，不属于原生背板。无配件需求时移除资产附带的壳与磁吸环。需要保留挂饰/挂绳的镜头必须配透明无图案保护壳，并清楚表现壳体挂孔或从充电口伸出的挂绳片与绳扣的连接，不遮挡镜头、标志和充电接口；无法合理表达连接则去掉挂饰，禁止直接在裸机打孔或让挂绳漂浮。不得声称配件原装、随手机赠送或证明手机具有磁吸功能。
4. 本次手机成片禁止包装盒、开箱盒、产品包装展示、说明卡、价格卡、补贴广告和促销海报。若旧资产要求开箱/包装机位，改为同场景同光线下单台手机的可见背面或侧面近景，不能制造品牌盒型或包装文字。
5. 正面亮屏镜头：选择与机身颜色和场景协调、留白清晰的简洁抽象渐变或自然纹理壁纸；全组同一台手机保持同一壁纸主题。保留真实屏幕比例、边框、圆角、前摄/挖孔/刘海，壁纸只在有效显示区内，不越框覆盖机身。屏幕亮度适中，弱真实反光，不白屏过曝、不像贴纸；不复制电商双面图作壁纸。默认纯壁纸，不添加未经确认的系统 UI、品牌标志、通知、乱码或广告；需要锁屏时间时仅少量清晰可读数字，不让文字抢主体。
6. 输出分镜前自检：单机单主视角、目标型号结构一致、裸机与壳分离、挂饰连接可实现、无包装促销、正面屏幕自然。此检查是提示词检查，不等同于生成图片已经通过视觉验收。`;

export function phoneGenerationPolicy(title = ''): string {
  return isPhoneProduct(title) ? PHONE_GENERATION_POLICY : '';
}

export function enforcePhoneGenerationPolicy(prompt: string, title = ''): string {
  const policy = phoneGenerationPolicy(title);
  return !policy || prompt.endsWith(policy) ? prompt : `${prompt}\n\n${policy}`;
}

/** Exclude packaging-focused actions; don't discard a camera shot merely mentioning “no box”. */
export function isPhonePackagingAction(title: string | null | undefined): boolean {
  const text = (title || '').replace(/(?:无|不要|禁止|不含|去掉|去除)\s*(?:手机)?包装盒/g, '');
  return /包装|开箱|盒装|产品盒|手机盒|礼盒|unboxing|packaging/i.test(text);
}

export function isActionAllowedForProduct(productTitle: string, action: { title?: string | null }): boolean {
  return !isPhoneProduct(productTitle) || !isPhonePackagingAction(action.title);
}
