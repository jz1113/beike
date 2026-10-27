import type {InspirationItem} from '../model/inspirationItem';

const prompt=`场景：穿搭达人开箱种草。博主从购物袋掏出衣服展示、瞬间换装旋转、多角度pose。极简白墙卧室，自然日光，活泼有感染力。10秒。

参考占位：
@image1：博主人物。100%匹配参考图。
@image4：衣服单品。100%匹配参考图。

镜头1（0-3秒）：
中景，47°视角。@image1穿着白色基础T恤面对镜头，兴奋地举着购物袋说："我的快递终于到了我直接爱住！"从袋中抽出@image4展开举高展示全貌，瞪大眼睛夸张表达惊喜。
3秒 匹配剪辑（同位置瞬间换装）

镜头2（3-7秒）：
中景，47°视角。@image1已穿上@image4，自信原地转一圈，面料随旋转自然飘动。转完面朝镜头双手叉腰说："你们说这是不是也太好看了！"歪头俏皮笑容。

镜头3（7-10秒）硬切：
全身远景，63°视角，略仰拍。@image1快速连续三个pose——插兜、单手上扬、靠墙随意一倚。说："版型绝了穿着超舒服，尺码和链接我置顶了。"最后一拍手指向上指镜头。

口播台词：
0-3秒："我的快递终于到了我直接爱住！"（开箱兴奋）
3-7秒："你们说这是不是也太好看了！"（自信得意）
7-10秒："版型绝了穿着超舒服，尺码和链接我置顶了。"（真诚推荐）

灯光：右侧大窗自然日光，5500K，柔和有方向性，在身体左侧形成轻微阴影展示面料立体感和垂坠度。白墙反射提供补光。干净、自然、杂志编辑级日光效果。

色彩：干净明亮中性微暖。面料质感高清晰度。白墙纯净不偏蓝。肤色自然健康。衣服色彩完全真实饱和。整体清新、亲切、日光编辑风。

输出：竖屏9:16，10秒，24帧，真实速度。

锁定：@image1外貌全程一致。@image4无论手举还是穿上身都完全一致。白色背景不变。日光方向固定右侧。匹配剪辑转场无缝——剪辑点身体位置完全相同。旋转时面料运动自然。嘴型与台词严格对应。`;

export const OUTFIT_VIDEO_INSPIRATION:InspirationItem={
  id:'video-outfit-unboxing',category:'video',tag:'穿搭种草 · 原始提示词',title:'穿搭开箱 · 连衣裙瞬间换装',
  prompt,
  // Only two references are attached here; remap the original fourth slot when applying them.
  referencePrompt:prompt.replace(/@image4\b/g,'@image2'),
  image:'/inspirations/outfit-unboxing/poster.jpg',video:'/inspirations/outfit-unboxing/video.mp4',poster:'/inspirations/outfit-unboxing/poster.jpg',mediaType:'video',
  referenceImages:['/inspirations/outfit-unboxing/person.png','/inspirations/outfit-unboxing/dress.png'],
  referenceLabels:['博主人物 · 原提示词 @image1','连衣裙 · 原提示词 @image4（使用时为 @image2）'],
  videoRefMode:'omni',videoDuration:10,actualVideoDuration:10.08,aspectRatio:'9:16',quality:'720P',
};
