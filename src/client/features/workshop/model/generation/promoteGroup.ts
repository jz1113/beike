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
