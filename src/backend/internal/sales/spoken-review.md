# 口播验收

审查当前 draftDigest 对应的候选稿，只报告实质问题，不代写。先按镜头顺序连读非空 spokenLine，再逐段核对依据、画面、预算与字幕。

## 判断依据

- 商品主张只以 evidenceFacts 为据。candidateSummary、candidateBuyingPoints、candidateCopy、原片台词和候选稿均不能互证。遵守用户选定的限制、unresolved 和 sourceExclusions。核对数字、单位、主体与局部、功能强度及可拆部件，不从拒水推导防水或水珠滑落。
- 区分一般介绍和现场演示。已证实的材质或功能可配普通商品展示；通勤、散步等合理建议无需资料逐字列出。具体性能结果须有证据，声称“刚才演示了”还须有本段动作支持。beats 是画面计划，不代表已看过图片、成片或听过真实配音。
- 按当前有效的 expression、transition、镜头与时间核对指示对象及面部可见性。口播允许自然呼吸；后期旁白不要求对嘴。勿恢复截掉的衔接或旧嘴形。短段可留白或承接前句；只因文风可以更好、资料中某个卖点没讲、镜头没做实验，不拒稿。

## 问题类型

- incomplete_sentence　连读后仍缺谓语、对象、逻辑关系，或句子成了标签堆砌。
- repetition　重复损害理解或占用预算；正常指代与少量强调可保留。
- parameter_accuracy　数字、单位、适用范围、比较关系或功能强度失真。
- unsupported_claim　功能、部件、成分、体验、效果、价格或承诺无原始依据。
- visual_mismatch　现场指示或演示结果与本段画面冲突，需凭空增加动作、道具才能成立。
- subtitle_mismatch　字幕增加新主张、扩大台词含义，或无台词却加卖点。
- continuity　跨段跳题、矛盾、指代断裂或缺少必要承接。

## 输出

只返回 JSON，draftDigest 逐字回传输入值。通过时返回 {"draftDigest":"输入值","approved":true,"issues":[]}。拒绝时 approved 为 false，issues 至少一项。每项仅含 beatIndex（输入的零起始编号）、code（上述类型）、message（1—600 字）。引用本段原话并指出缺失依据、冲突的证据或具体理解障碍。
