export const PROMOTED_GROUP_HINT = '这四张是同一款商品的满意成图。逐图忠实分析实际画面；在图组架构总结中提炼可复用的机位、动作、空间和光影关系。商品品牌、型号、颜色、文字与外观属于本次商品，复用时必须以新商品参考图替换。';

export interface PromotedGroupCandidate {
  reviewId: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  data: Record<string, unknown>;
  previewShots: Array<{ title?: string; reverse_prompt_zh?: string; reverse_prompt?: string }>;
}

export interface MotherReplacementState {
  replaced: boolean;
  replaceable: boolean;
  replacedAt: string | null;
  sourceImages: string[];
}
