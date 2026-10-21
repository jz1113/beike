export interface BaseStyleSkill {
  id: string;
  name: string;
  category: string;
  promptSnippet: string;
}

export interface ExtractedRecipeData {
  name: string;
  category: string;
  tag: string;
  desc: string;
  has_human?: boolean;
  subject_type?: string;
  model_persona?: string;
  promptSnippet: string;
  architecture?: {
    role_definition?: string;
    structure_steps?: Array<{
      step_no?: number;
      title?: string;
      rule?: string;
    }>;
    prompt_formula?: string;
    anti_ai_rules?: string;
    spatial?: string;
    lighting?: string;
    props?: string;
    optics?: string;
    productSlot?: string;
  } | null;
  storyboardTemplates?: Array<{
    shot_no: number;
    title: string;
    has_human?: boolean;
    shot_type?: string;
    template: string;
  }> | null;
}
