# Keyword review rules

## Allowed final verticals

Use exactly one of:

`政史军、3C数码、本地生活、动漫、动物、法律、购物消费、互联网IT、家居、交通出行、教育、金融财经、科学技术、旅游、美食、美术、民俗文化、其他、汽车、情感、求职招聘、软件工具、社会、时尚、体育、小说、星座、医疗健康、音乐、影视、游戏、娱乐、政策政务、植物`

## Vertical interpretation

- Pet health, disease, medication, treatment, vaccination, and veterinary care: `医疗健康`.
- Animal behavior, species, training, ordinary feeding, and pet supplies: `动物`.
- Apps, office software, settings, and productivity tools: `软件工具`.
- Programming, development, internet products, protocols, and network technology: `互联网IT`.
- Scientific principles, natural science, technical knowledge, and general science: `科学技术`.
- Politics, history, and military subjects: `政史军`.
- Policy interpretation, government procedures, and public services: `政策政务`.
- Films and television dramas: `影视`. Animation and animation-oriented ACG content: `动漫`.
- General social knowledge and social phenomena: `社会`. Sensitive current social events are excluded from production.
- Use `其他` only when no approved vertical fits.

Resolve ambiguous terms from the full query:

| Query | Final vertical | Reason |
| --- | --- | --- |
| 游戏手机推荐 | 3C数码 | The object being selected is a phone. |
| 乌天狗的日本传说 | 民俗文化 | `天狗` is a mythological entity. |
| 中华人民共和国教师法 | 法律 | The content is a law, not teaching practice. |
| 梦幻西游装备属性 | 游戏 | The entity belongs to a game. |
| 狗狗腹泻怎么用药 | 医疗健康 | Pet treatment follows the medical exclusion. |
| 狗狗训练方法 | 动物 | Behavior training is not medical care. |

## Production exclusions

Set `是否制作=不制作` when any condition applies:

1. `金融财经`: stocks, funds, wealth management, investment advice, price/return predictions, securities, futures, foreign exchange, cryptocurrency, or similar financial decisions.
2. `医疗健康`: human or pet diagnosis, symptoms, treatment, medication, dosage, medical-risk judgment, veterinary diagnosis, or health intervention.
3. Sensitive social hotspots: active controversial events, public-opinion incidents, breaking cases, or sensitive event commentary.
4. Illegal, pornographic, violent-terrorist, drug-related, dangerous, or anti-science content.
5. Fortune-telling and superstition: bazi, feng shui, divination, fortune prediction, zodiac luck, name scoring, auspicious-direction claims, or fate-changing claims.
6. Industrial hard advertising, manufacturer rankings, supplier recommendations, or industrial procurement promotion that cannot become genuine user experience.
7. Requests for viewing, downloads, full-text resources, resource links, cracked software, real-time tool-only results, or content inherently dependent on video demonstration.
8. Gift-money, red-packet, gratuity, favor-fee, or gray-interest decisions with no objective standard.
9. Queries with excessive stacked constraints—such as multiple sizes, quantities, years, colors, models, and narrow locations—that leave too little production space. Do not rewrite these queries.

## Simple factual questions

Set `是否制作=不制作` and `可做性状态=简单问答` when the natural answer is a single fact, fixed number, identity, date, time, distance, price, size, color, specification, or one or two sentences with no useful room for experience, testing, comparison, tutorial, strategy, or substantive explanation.

Examples: `看八字一般多少钱`、`石家庄到大连开轿车来回多少公里`、`Python的len()函数是什么`、`美国总统是谁`、`iPhone 15多少钱`、`今天上海天气怎么样`、`北京地铁几点停运`.

Do not reject merely because a query contains a duration or number. `花菜焯水多久好吃` can support method, texture, and cooking advice and may be produced.

## Low-value keywords

Set `低价值关键词=是`, `是否制作=不制作`, and `可做性状态=低价值` for:

- relationship consultation or personal romantic/marital decisions;
- social reply scripts, chat formulas, or interpersonal wording templates;
- naming, name scoring, or name fortune judgments;
- gift-money, red-packet, gratuity, or favor-fee decisions;
- fortune-telling, feng shui, divination, horoscope predictions, zodiac luck, or similar superstition;
- illegal, dangerous, anti-science, bizarre, or meaningless content;
- queries that cannot yield reliable, useful, and safe information.

Do not mark the following low-value merely because of their topic:

- personal dream descriptions, such as `梦见前任和别人结婚` or `昨晚梦见蛇追我`;
- dream interpretation presented as culture, psychology, or general explanation;
- factual star-sign/constellation education;
- copyright topics;
- game guides;
- school and university topics;
- travel;
- company evaluation.

Star-sign education can be produced; personal fate, luck, wealth, romance, lucky color, or future prediction cannot.

## Generic entities and strong-demand directions

A generic entity is a bare product, institution, concept, place, work, or tool without an explicit question or production direction.

For an otherwise producible generic entity:

- keep the original query unchanged;
- set `是否制作=制作` and `可做性状态=可做`;
- derive one strong-demand direction from `相关拓展q` and `实体拓展q`;
- prefer selection, avoidance, tutorial, strategy, comparison, evaluation, experience, or substantive science directions;
- do not create a direction unsupported by the row context.

| query | Strong-demand direction |
| --- | --- |
| U盘 | U盘选购避坑及数据长期保存注意事项 |
| 杭州电子科技大学 | 杭州电子科技大学报考体验与专业选择建议 |
| 猫砂 | 不同类型猫砂的除臭、结团和粉尘对比 |

If the query already contains a clear direction, or if it is not producible, write `-`.

## Output values

- `是否制作`: `制作` or `不制作`.
- `可做性状态`: `可做 / 简单问答 / 低价值 / 红线否决 / 非笔记需求 / 限制过细 / 不可产`.
- `低价值关键词`: `是` or `否`.
- `判定原因`: concise, specific, and no more than 40 Chinese characters.

| Situation | Status |
| --- | --- |
| Normal producible query | 可做 |
| One-fact or one-number answer | 简单问答 |
| Low-value rule triggered | 低价值 |
| Medical, financial, sensitive hotspot, unsafe, illegal, or superstition exclusion | 红线否决 |
| Viewing/download/tool-only/non-note intent | 非笔记需求 |
| Excessive stacked constraints | 限制过细 |
| Semantically valid but reliable quality sources are insufficient | 不可产 |
