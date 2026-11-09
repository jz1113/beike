# Hunyuan Video prompting guide

**Model page:** [Hunyuan Video on Vivideo](https://vivideo.ai/ai-models/hunyuan-video)

Hunyuan Video is Tencent's video model, released with open weights. It is a capable general-purpose model for realistic scenes — nature, people, everyday environments — and a common base for custom and fine-tuned work.

## Where it shines

- Realistic nature and landscape scenes
- Everyday human activity in real-world settings
- Cinematic establishing shots
- Image-to-video for realistic stills

## Prompt tips

- **Use a clear structure**: subject → action → environment → camera → lighting → style.
- **Be specific about the environment**; detailed settings help realism.
- **Name the camera move and lens** ("slow tracking shot, 35mm", "aerial descending shot").
- **Keep to one continuous action** per clip.
- **Add a negative prompt** for blur, distortion, text and watermarks.

## Example prompts

```
A herd of wild horses gallops across a misty highland meadow at sunrise, manes flowing, dew spraying from the grass. Wide tracking shot from a low angle running parallel to the herd. Soft golden backlight through the mist. Nature documentary realism. 16:9, 6 seconds.
```

```
An elderly man in a flat cap feeds pigeons on a park bench in autumn, tossing crumbs as the birds flutter around his feet and orange leaves fall. Medium shot, slow push-in, 50mm. Soft overcast light, warm autumn palette. Gentle, observational realism. 16:9, 6 seconds.
```

```
Aerial shot descending slowly over a turquoise glacial river winding through a gravel valley between dark mountains, low clouds clinging to the peaks. Cool, crisp light, high detail. Epic landscape cinematography. 16:9, 8 seconds.
```

## Related

- [AI video model strengths map](https://vivideo.ai/research/ai-video-model-strengths-map)
- Prompt pack: [travel](../prompts/travel.md)
