function promptSectionText(prompt: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`【${escaped}】\\s*([\\s\\S]*?)(?:\\n?【[^】]+】|$)`).exec(prompt);
  return match?.[1]?.trim() || "";
}

function inferFromPromptSections(prompt?: string | null): { has_human: boolean; shot_type: string } | undefined {
  if (!prompt || !prompt.includes("【发型与面部】")) return undefined;
  const faceSec = promptSectionText(prompt, "发型与面部");
  if (!faceSec) return undefined;
  const rawSubj = `${promptSectionText(prompt, "主体")} ${promptSectionText(prompt, "动作或摆放")}`;
  const noFace = /(?:画面|图中|人物)?(?:没有|未出现|未见|无|不入镜|未入镜)[^。；\n]{0,18}(?:头部|发型|面部|五官|人脸|脸部)|(?:头部|发型|面部|五官|人脸|脸部)[^。；\n]{0,16}(?:没有|未出现|未见|不入镜|未入镜|不可见)|画面无人/.test(faceSec)
    || /(?:面部和身体主体不入镜|没有面部与完整身体|只露出手部|仅露出手部)/.test(`${rawSubj} ${faceSec}`);
  if (!noFace) return undefined;
  const cleanSubj = rawSubj.replace(/(?:无|没有|未见|不含|不出现|非)[^，,。；;\n]{0,12}(?:手部|手指|双手|人手|手持|握持|人物|人体)/g, "");
  const cleanFace = faceSec.replace(/(?:无|没有|未见|不含|不出现|非)[^，,。；;\n]{0,12}(?:手部|手指|双手|人手|手持|握持)/g, "");
  const hasHand = /(?:手部|手指|双手|单手|一只手|两只手|右手|左手|手掌|手托|手握|握持|手持|托住|托起|托持|捏住|夹持|前臂|手腕)/.test(`${cleanSubj} ${cleanFace}`);
  return { has_human: false, shot_type: hasHand ? "hand_held_only" : "pure_product" };
}

/** Resolve explicit asset evidence and correct no-face hand shots mislabeled as model_shot. */
export function resolveAssetShotSubject(asset: {
  has_human?: boolean; hasHuman?: boolean; shotType?: string; shot_type?: string;
  title?: string; action?: string; prompt?: string | null; reversePrompt?: string | null;
}): { has_human: boolean; shot_type: string } | undefined {
  const type = asset.shotType || asset.shot_type;
  if (type === "hand_held_only") return { has_human: false, shot_type: type };
  if (type === "pure_product") return { has_human: false, shot_type: type };
  const fromSections = inferFromPromptSections(asset.prompt || asset.reversePrompt);
  if (fromSections) return fromSections;
  if (type === "model_shot") return { has_human: true, shot_type: type };
  const explicit = asset.has_human ?? asset.hasHuman;
  if (typeof explicit === "boolean") return { has_human: explicit, shot_type: explicit ? "model_shot" : "pure_product" };
  // Use the action field rather than a full prompt whose negative section may mention people.
  const text = [asset.title, asset.action].filter(Boolean).join("，");
  if (/仅手部|只露手|只有手|手部(?:特写|局部|操作|组合)|双手.*(?:局部|细节|特写|操作)|(?:局部|细节|特写).*双手/.test(text)) {
    return { has_human: false, shot_type: "hand_held_only" };
  }
  if (/无人物|无人出镜|无模特|纯静物|纯商品|静物|(?:桌面|台面).*(?:平放|摆放|陈列)|(?:平放|叠放|摆放|陈列).*(?:商品|手机|机位|特写)/.test(text)) {
    return { has_human: false, shot_type: "pure_product" };
  }
  return undefined;
}
