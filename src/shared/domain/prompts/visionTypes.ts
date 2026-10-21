/** 跨批次反雷同签名：场景 + 动作/表情库摘要 */
export interface PreviousGroupSignature {
  scene: string;
  actionDigest: string;
  lookBible?: string;
}

export interface AssetLibrarySlotData {
  scenes?: Array<{ id: string; code?: string; title: string; description: string; lighting?: string | null; reversePrompt?: string | null }>;
  outfits?: Array<{ id: string; code?: string; title: string; top: string; bottom: string; colorPalette?: string | null; reversePrompt?: string | null }>;
  actions?: Array<{ id: string; code?: string; title: string; action: string; shotType?: string; camera?: string | null; suitableAnatomy?: string; reversePrompt?: string | null; has_human?: boolean }>;
  personas?: Array<{ id: string; code?: string; name: string; description: string; reversePrompt?: string | null }>;
}

export interface LockedAssetSlots {
  personaId?: string;
  personaName?: string;
  sceneId?: string;
  sceneTitle?: string;
  outfitId?: string;
  outfitTitle?: string;
  actionId?: string;
  actionTitle?: string;
}

export interface VisionAnalyzeParams {
  productTitle: string;
  productProps?: Record<string, string>;
  imageUrls?: string[];
  templateStyle?: string;
  shotCount?: number;
  extraRequirements?: string;
  model?: string;
  /** 模特人设文字（原创种草人像） */
  modelPersona?: string;
  /** 是否已上传专属正脸 ID 图 */
  hasAnchorFace?: boolean;
  /** 架构模式：默认种草人像 8 段骨架；纯商品静物可走 no_model */
  architectureMode?: 'seed_portrait' | 'pure_product' | 'auto';
  /** 本会话近期 master_scene 摘要，用于跨批次反雷同（兼容旧字段） */
  previousMasterScenes?: string[];
  /** 本会话近期组签名（场景 + 动作库），优先于 previousMasterScenes */
  previousGroupSignatures?: PreviousGroupSignature[];
  /** 🌟 提示词资产库联动数据（自动从数据库检索的精选原子资产） */
  assetLibraryData?: AssetLibrarySlotData;
  /** 🌟 用户定向锁定的特定资产 */
  lockedAssets?: LockedAssetSlots;
}

export interface ShotPrompt {
  sourceReferenceImageUrl?: string;
  sourceShotNo?: number;
  sourcePrompt?: string;
  sourceGroupId?: string;
  assembly_source?: 'group_skeleton' | 'architecture' | 'fallback';
  shot_no: number;
  title?: string;
  prompt: string;
  scene?: string;
  expression?: string; // 本镜表情关键词（组内强制差异）
  action?: string; // 本镜动作/道具互动（组内强制差异）
  prop?: string; // 本镜道具
  optics?: string; // 光学短句
  camera_focal_length?: string; // 🌟 摄影焦段 (如: 85mm f/1.8 浅景深, 35mm 人文机位, 100mm 微距特写)
  angle?: string; // 🌟 机位视角 (如: 45° 沉浸俯角, 平视平角, 超低仰角, 越肩抓拍)
  lighting_type?: string; // 🌟 采光属性 (如: 5500K 百叶窗晨光, 柔和漫反射, 侧逆光轮廓)
  has_human?: boolean; // 🌟 是否有人物/模特出镜 (true: 有模特/人像; false: 纯商品静物/屏幕UI/背壳特写)
  shot_type?: 'model_shot' | 'hand_held_only' | 'pure_product'; // 🌟 分镜类型
  productImageUrl?: string; // 🌟 该分镜绑定的具体商品素材图（正面/背面/侧面实物图）
  selected?: boolean;
  applied_scene?: string;
  applied_outfit?: string;
  applied_action?: string;
  applied_persona?: string;
}

