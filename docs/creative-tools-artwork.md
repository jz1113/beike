# 首页创作工具配图

八张配图由内置 ImageGen 根据文字独立生成，未使用即梦素材或截图作为图片输入。网页交付文件位于 `src/client/assets/creative-tools`，统一为 640×427 JPEG，组件以 3:2 视口展示。替换时保持文件名与卡片用途对应；图片仅为功能示意，不改变待接入状态。

## 可复用提示词

除 canvas 外，每项完整提示词由「通用前缀 + 对应场景 + 通用后缀」拼接。生成不使用参考图片，背景不透明。

通用前缀：

```text
Use case: stylized-concept. Create ONE original feature thumbnail for a premium AI creative software homepage, landscape 3:2 composition. 
```

通用后缀：

```text
Sophisticated cinematic editorial artwork, tactile materials, restrained dramatic lighting, single clear focal subject, readable when cropped to a 150px thumbnail, edge-to-edge artwork. No text, no letters, no numbers, no logos, no watermark, no interface screenshot. Entirely original design; do not copy Jimeng assets or any existing platform imagery.
```

### storyboard.jpg

```text
A cinematic miniature film set: elegant cream paper storyboard panels unfolding into a real amber-lit stage with a sculptural chair and a compact cinema camera, warm walnut, bronze and soft gold lighting against a midnight background. A single strong composition, no contact sheet.
```

### upscale.jpg

```text
Macro photograph of an iridescent blue butterfly wing with exquisitely sharp scales and tiny dew drops, one softly blurred translucent glass panel revealing a crisp portion, glacial cyan and deep navy studio, visual metaphor for clarity and detail.
```

### director.jpg

```text
A sophisticated miniature monochrome architectural set, a small articulated wooden artist mannequin standing on a circular stage, two miniature camera rigs and subtle curved camera paths, sage green, warm ivory and charcoal, realistic physical diorama.
```

### image-edit.jpg

```text
An elegant unbranded sculptural coral-red perfume bottle on a stone plinth, a luminous thin rounded rectangular selection frame around a small region, background gracefully transitioning from warm sand to terracotta, realistic product photography blended with minimal editorial 3D.
```

### retake.jpg

```text
A cinematic sand-colored running shoe suspended above a dark cyan track, a floating curved strip of three video frames below, one frame highlighted in warm amber with a subtle circular light trail, dynamic athletic product advertisement, sharp main shoe.
```

### prompt-reverse.jpg

```text
A cobalt-blue translucent glass sculpture on a studio plinth, its light and silhouette deconstructed into floating thin glass cards containing only abstract horizontal luminous lines, no actual characters, dark indigo setting with cyan highlights, clear visual metaphor for analyzing an image into a description.
```

### product-angles.jpg

```text
Three views of the same original cream and cobalt wireless over-ear headphones hovering on three overlapping translucent glass panels, front, side and rear views with consistent product design, vivid blue studio background, subtle curved orbit line, photorealistic premium product rendering.
```

### canvas.jpg

```text
Use case: stylized-concept. Create one original premium creative-software feature thumbnail for 'infinite canvas', landscape 3:2 composition. A luminous pearlescent folded ribbon floating inside a large translucent glass picture frame, several small image panels connected in a spacious dark teal studio, subtle perspective grid, tactile cinematic materials, turquoise rim lighting and soft warm highlights, sophisticated editorial 3D illustration. Clear central focal object readable at 150px wide, edge-to-edge artwork, no text, no letters, no logo, no watermark, no UI screenshot. Entirely original design, do not reproduce Jimeng or any existing platform assets.
```

