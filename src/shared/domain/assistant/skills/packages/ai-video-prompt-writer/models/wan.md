# WAN prompting guide

**Model page:** [WAN on Vivideo](https://vivideo.ai/ai-models/wan-video)

WAN is Alibaba's video model family, released with open weights, which has made it popular with developers and for stylized work. It handles a wide range of looks — realistic, illustrated, painterly, 3D — and supports both text-to-video and image-to-video.

## Where it shines

- Stylized and artistic looks: illustration, watercolor, paper-craft, clay
- Explainer and educational visuals with a consistent style
- Image-to-video from illustrations and concept art
- Fast, affordable iteration on ideas

## Prompt tips

- **Front-load the style.** Start with the medium: "Watercolor illustration of…", "Clay stop-motion of…". It anchors everything after it.
- **Be concrete and compact.** A clear subject, one action, one camera move and a light description work better than a long paragraph of adjectives.
- **Use a negative prompt** for common issues: `blurry, low quality, deformed, extra fingers, text, watermark, static frame`.
- **Ask for motion explicitly.** If clips come out too still, add a clear movement verb and a camera move.
- **For a series, freeze the style line** and change only the subject and action.

## Example prompts

```
Watercolor illustration of a fox walking through a snowy birch forest at dusk, its breath visible, paw prints trailing behind. Slow sideways pan following the fox. Soft washes of blue and violet, warm glow from a distant cabin window, visible paper texture. Calm storybook mood. 16:9, 6 seconds.
```

```
Paper-craft diorama of a small harbor town: layered cardboard houses, a paper boat bobbing on blue tissue-paper waves, a lighthouse beam sweeping slowly. Gentle camera dolly across the scene with parallax between layers. Soft warm studio light. Charming explainer style. 16:9, 8 seconds.
```

```
Photorealistic close-up of an old watchmaker's hands adjusting tiny gears with tweezers under a magnifying lamp, a gear clicking into place. Static camera, shallow depth of field. Warm lamp light, dark workshop background, brass reflections. 16:9, 6 seconds.
```

## Related

- [How to choose an AI video model](https://vivideo.ai/guides/how-to-choose-an-ai-video-model)
- [AI animation generator](https://vivideo.ai/solutions/ai-animation-generator)
- Prompt packs: [explainer videos](../prompts/explainer-videos.md), [education & training](../prompts/education-training.md)
