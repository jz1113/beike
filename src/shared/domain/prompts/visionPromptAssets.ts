import { isPhoneProduct, phoneGenerationPolicy } from '../products/phoneProductPolicy';

export interface VisionAssetLibraryData {
  scenes?: Array<{ id: string; code?: string; title: string; description: string; lighting?: string | null; reversePrompt?: string | null }>;
  outfits?: Array<{ id: string; code?: string; title: string; top: string; bottom: string; colorPalette?: string | null; reversePrompt?: string | null }>;
  actions?: Array<{ id: string; code?: string; title: string; action: string; shotType?: string; camera?: string | null; suitableAnatomy?: string; reversePrompt?: string | null; has_human?: boolean }>;
  personas?: Array<{ id: string; code?: string; name: string; description: string; reversePrompt?: string | null }>;
}

export interface VisionLockedAssets {
  personaId?: string;
  personaName?: string;
  sceneId?: string;
  sceneTitle?: string;
  outfitId?: string;
  outfitTitle?: string;
  actionId?: string;
  actionTitle?: string;
  fullPromptId?: string;
}

export function shouldLockJewelryHalfBody(
  productTitle: string,
  assetLibraryData?: VisionAssetLibraryData | null,
): boolean {
  if (isPhoneProduct(productTitle)) return false;
  if (Array.isArray(assetLibraryData?.actions) && assetLibraryData.actions.length > 0) return false;
  return true;
}

export function appendPhoneGenerationPolicy(prompt: string, productTitle = ''): string {
  const policy = phoneGenerationPolicy(productTitle);
  return policy ? `${prompt}\n\n${policy}` : prompt;
}

export function buildVisionDiversityAxis(shotCount: number, lockJewelryHalfBody: boolean): string {
  if (!lockJewelryHalfBody) {
    return `- 【构图景别】：按商品角色与已选资产机位输出，允许全身、中景、半身与局部特写并存；禁止把全部镜头改写成半身或微距模板。
- 若提供了动作资产，必须保留对应资产的真实姿态、机位与焦段，禁止把列表位置改写成固定模板角色。`;
  }
  return `- 🚨 【构图景别硬红线：全员 100% 锁定为半身相、胸部以上肖像与局部微距，绝对禁止远景全身】：
  - ❌ **绝对禁止任何「远景（Long Shot）、全景（Wide Shot）、全身站立（Full-body standing shot）」**！严禁出现人物在画面中只占一小截、大面积空荡荡的地板走廊！
  - 🌟 **全套 ${shotCount} 镜构图比例标准（人物与饰品占画面 65%~80% 视觉中心）**：
    1. **【正面半身/胸部以上自然肖像 (Half-body / Chest-up)】**：平视视线对焦镜头，女生神态明媚自然，双手自然轻搭在身前桌沿或单手捏起吊坠向镜头展示，眼神清澈含笑自然互动；
    2. **【45° 侧颜半身抓拍 (45-degree Profile Half-body)】**：侧身看窗外或街景天光，微风吹拂发丝，单手自然撩起耳边碎发别至耳后，清晰展现侧颜下颌线条与耳饰/项链光影；
    3. **【佩戴部位生活化动作超清特写/微距 (Macro Close-up)】**：单手捏起吊坠向镜头展示细节、双手轻拉细链两端、或手部自然平放于台面大光圈浅景深聚焦首饰（严禁多画手腕手镯，严禁无依托悬空手势），背景柔和虚化；
    4. **【生活氛围感半身交互随拍 (Lifestyle Half-body Interaction)】**：生活空间舒适倚靠、车内副驾手搭安全带、街角漫步回眸、手捧水杯或单手轻扶包带，展现高级私服与生活温度。`;
}

function listCodedAssets<T extends { code?: string; title?: string; name?: string }>(
  items: T[] | undefined,
  limit: number,
  prefix: string,
  format: (item: T, idx: number, codeStr: string) => string,
): string[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.slice(0, limit).map((item, idx) => {
    const codeStr = item.code ? `[#${item.code.replace(/^#/, '')}]` : `[#${prefix}-${String(idx + 1).padStart(2, '0')}]`;
    return format(item, idx, codeStr);
  });
}

export function buildAssetLibraryPromptSection(
  assetLibraryData?: VisionAssetLibraryData | null,
  lockedAssets?: VisionLockedAssets | null,
  lockJewelryHalfBody = true,
): string {
  if (!assetLibraryData && !lockedAssets) return '';
  const parts: string[] = [];
  parts.push('\n---\n## 【📚 提示词资产库精选零件插槽（已沉淀原子资产 · 优先选用组装）】');
  parts.push('系统已从用户专属「提示词资产库」中拉取了下列高品质真实场景、显白穿搭、抓拍动作与博主人设。');
  if (lockJewelryHalfBody) {
    parts.push('🚨 **【资产库强装配与分镜动作 1:1 严格分配铁律（最高优先级执行）】**：\n- 若下方提供了【可选真实场景库】、【可选抓拍动作库】、【可选显白穿搭库】、【可选博主人设库】，你必须 **100% 直接选用** 库中的具体资产进行装配！严禁编造任何脱离资产库的假想场景或动作！\n- **【套图一致性】**：同一套 4 分镜必须共用同一 scene / outfit / persona（master_scene、look_bible、identity_bible 全组一致），但 **4 个分镜的 action、camera、lighting 必须互不相同**！\n- **【分镜动作 1:1 严格绑定与排他性（绝对禁止同一套图动作雷同）】**：\n  • **分镜 1 必须绑定动作库第 1 个动作（专属超清微距/近景）**，applied_action 填对应编号；\n  • **分镜 2 必须绑定动作库第 2 个动作（45°侧颜互动）**，applied_action 填对应编号；\n  • **分镜 3 必须绑定动作库第 3 个动作（手势与桌面依托）**，applied_action 填对应编号；\n  • **分镜 4 必须绑定动作库第 4 个动作（生活氛围随拍）**，applied_action 填对应编号；\n  • 🚨 **绝对禁止在同一套中复用相同的动作编号！4 个分镜必须是 4 种截然不同的人体姿态、机位与采光描述！**\n- **【商品细节看清与极致拉近铁律】**：\n  • 分镜 1 必须为**极近距离局部微距超清特写（Tight Macro Close-Up）**，镜头对准手腕/手指/锁骨/耳垂/发髻，商品实物占据画面 55%~75% 核心画幅，超高解析度呈现做工纹理与金属光泽，绝无全身远景；\n  • 分镜 2~4 为**胸部以上中近景（Tight Bust-up Close-Up）**，模特佩戴部位清晰置于前景受光处（占画面 35%~50%），首饰清晰可辨；\n- 必须在输出 JSON 中完整回填溯源字段：master_scene 填入所选场景完整描述，applied_scene 填入所选场景标题（含资产编号）；look_bible 填入所选穿搭，applied_outfit 填入所选穿搭标题；identity_bible 填入所选人设，applied_persona 填入所选人设名称；各分镜 applied_action 必须严格按 1:1 填入动作库中对应的不同动作编号与标题！各分镜 lighting_type 必须写出互异的采光变化！\n');
  } else {
    parts.push('🚨 **【资产库强装配：绑定资产但保留真实姿态】**：\n- 若下方提供了场景/动作/穿搭/人设库，必须 **100% 直接选用** 库中具体资产，严禁编造脱离资产库的假想场景或动作。\n- **【套图一致性】**：同一套分镜共用同一 scene / outfit / persona，但各镜 action、camera、lighting 必须互不相同。\n- **【动作绑定】**：按动作库列表顺序选用并写入 applied_action，必须保留对应资产的真实姿态、机位与焦段；禁止把列表位置改写成固定模板角色，禁止按「微距 / 侧颜 / 半身」重排资产。\n- 必须回填 master_scene、applied_scene、look_bible、applied_outfit、identity_bible、applied_persona，以及各镜不同的 applied_action 与 lighting_type。\n');
  }
  parts.push('- **【逐镜出镜规则】**：每个分镜的 `has_human` 与 `shot_type` 必须严格遵循对应动作资产的「出镜」标注。标为“纯商品/无人”的动作只画商品，禁止人物、模特、人脸、肢体与手部；标为“人物出镜”的动作才装配人设与穿搭。');

  if (lockedAssets) {
    const lockedLines: string[] = [];
    if (lockedAssets.personaName) lockedLines.push(`- 🔒 **强制锁定模特人设**：${lockedAssets.personaName}`);
    if (lockedAssets.sceneTitle) lockedLines.push(`- 🔒 **强制锁定拍摄场景**：${lockedAssets.sceneTitle}`);
    if (lockedAssets.outfitTitle) lockedLines.push(`- 🔒 **强制锁定显白穿搭**：${lockedAssets.outfitTitle}`);
    if (lockedAssets.actionTitle) lockedLines.push(`- 🔒 **强制锁定核心动作**：${lockedAssets.actionTitle}`);
    if (lockedLines.length > 0) {
      parts.push(`### 🎯【用户强制锁定的特定资产】：\n${lockedLines.join('\n')}\n`);
    }
  }

  if (assetLibraryData) {
    const personas = listCodedAssets(assetLibraryData.personas, 5, 'P', (p, idx, codeStr) => {
      const body = p.reversePrompt || p.description;
      return `${idx + 1}. 【${codeStr} ${p.name}】：${body}`;
    });
    if (personas.length) {
      parts.push(`### 👤 可选博主人设库 (Persona Assets)：`);
      parts.push(...personas, '');
    }
    const scenes = listCodedAssets(assetLibraryData.scenes, 8, 'S', (s, idx, codeStr) => {
      const body = s.reversePrompt || s.description;
      return `${idx + 1}. 【${codeStr} ${s.title}】：${body}${s.lighting ? ` ｜ 光影：${s.lighting}` : ''}`;
    });
    if (scenes.length) {
      parts.push(`### 🏡 可选真实场景库 (Scene Assets)：`);
      parts.push(...scenes, '');
    }
    const outfits = listCodedAssets(assetLibraryData.outfits, 8, 'O', (o, idx, codeStr) => {
      if (o.reversePrompt) return `${idx + 1}. 【${codeStr} ${o.title}】：${o.reversePrompt}`;
      return `${idx + 1}. 【${codeStr} ${o.title}】：上装「${o.top}」+ 下装「${o.bottom}」${o.colorPalette ? ` ｜ 配色：「${o.colorPalette}」` : ''}`;
    });
    if (outfits.length) {
      parts.push(`### 👗 可选显白穿搭库 (Outfit Assets)：`);
      parts.push(...outfits, '');
    }
    const actionHeading = lockJewelryHalfBody
      ? '### 📸 可选抓拍动作库 (Action Assets - 4个分镜必须1:1分别选用下列4个动作，严禁重复)：'
      : '### 📸 可选抓拍动作库 (Action Assets - 按列表绑定并保留真实姿态，严禁改写成固定模板角色)：';
    const actions = listCodedAssets(assetLibraryData.actions, 8, 'A', (a, idx, codeStr) => {
      const body = a.reversePrompt || a.action;
      const subject = a.has_human === false ? '纯商品/无人' : a.has_human === true ? '人物出镜' : '按动作描述';
      return `${idx + 1}. 【${codeStr} ${a.title}】：${body}${a.camera ? ` ｜ 镜头：${a.camera}` : ''} ｜ 出镜：${subject}`;
    });
    if (actions.length) {
      parts.push(actionHeading);
      parts.push(...actions, '');
    }
  }

  return parts.join('\n');
}
