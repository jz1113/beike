# Kling prompting guide

**Model page:** [Kling on Vivideo](https://vivideo.ai/ai-models/kling-ai-video)

Kling is a video model family from Kuaishou. It is widely used for realistic human motion, dynamic camera work and image-to-video that stays faithful to the start frame.

## Where it shines

- People moving: walking, dancing, sports, hand actions
- Image-to-video from product shots, portraits and listing photos
- Dynamic camera moves: tracking, orbit, crane
- Ads, social clips and action beats

## Prompt tips

- **One subject, one main action.** Kling executes a clearly stated action well; stacked actions get muddled.
- **State the camera move as its own sentence.** "The camera orbits slowly around her." "The camera tracks alongside at running speed."
- **In image-to-video, describe only what changes.** The image already defines the look; the prompt should describe motion and camera. Repeating the scene description can make the model redraw it.
- **Use the negative prompt field** for recurring artifacts: `blurry, distorted hands, extra limbs, warped face, text, watermark`.
- **Higher-quality modes cost more and take longer** — draft in a faster version, then render the final in the best one.

## Example prompts

```
A ballet dancer in a white leotard performs a slow pirouette in an empty sunlit studio, her arms opening at the end of the turn. The camera orbits slowly around her at chest height. Soft daylight from tall windows, dust in the air, wooden floor reflections. Elegant, cinematic realism. 9:16, 5 seconds.
```

```
Image-to-video: the woman in the image turns her head toward the camera, smiles slightly and tucks her hair behind her ear. The camera pushes in gently. Keep her face, clothing and background unchanged. 9:16, 5 seconds.
```

```
A mountain biker speeds down a narrow forest trail, skidding through a tight corner and spraying dirt toward the lens. The camera tracks low and fast just behind the rear wheel. Dappled sunlight through pine trees, motion blur on the edges. High-energy action-sports look. 16:9, 5 seconds.
```

## Related

- [Kling vs Veo](https://vivideo.ai/compare/kling-vs-veo), [Hailuo vs Kling](https://vivideo.ai/compare/hailuo-vs-kling), [Kling vs Luma](https://vivideo.ai/compare/kling-vs-luma)
- [Image to video guide](https://vivideo.ai/guides/image-to-video-guide)
- Prompt packs: [product ads](../prompts/product-ads.md), [ecommerce](../prompts/ecommerce.md), [real estate](../prompts/real-estate.md)
