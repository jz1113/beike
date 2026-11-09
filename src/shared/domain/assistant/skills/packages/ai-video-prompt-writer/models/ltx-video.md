# LTX Video prompting guide

**Model page:** [LTX Video on Vivideo](https://vivideo.ai/ai-models/ltx-video)

LTX Video is Lightricks' video model, released with open weights and designed for speed. It is a good fit for fast drafts, previsualization and high-volume generation where turnaround matters more than maximum fidelity.

## Where it shines

- Quick drafts to test composition, camera and timing
- High-volume generation (many variants, many SKUs)
- Image-to-video for simple, controlled motion
- Atmospheric b-roll

## Prompt tips

- **Write one detailed paragraph in chronological order.** Start with the main action, then add specifics about movement, appearance, background, camera and light, in the order they happen.
- **Describe appearance precisely.** Clothing, colors, materials and textures help the model hold the subject steady.
- **Keep motion simple and continuous.** One camera move and one main action per clip.
- **Use it as a sketchpad.** Lock the idea quickly with LTX, then re-run the same prompt on a higher-fidelity model for the final.
- **Add a negative prompt** for low quality, flicker, distorted faces and text.

## Example prompts

```
A woman in a long green wool coat walks slowly along a foggy pier toward the camera, her hands in her pockets. Her red scarf moves in the wind, and her short brown hair is damp from the mist. Wooden boards glisten beneath her boots; behind her, the pier fades into grey fog and a faint lamp glows at the end. The camera backs away at her walking pace, eye level. Cold, muted morning light. Cinematic, realistic. 16:9, 6 seconds.
```

```
A cup of black coffee sits on a dark wooden table by a rainy window. Steam rises slowly from the cup and curls in the light. Raindrops run down the glass behind it, and the street outside is blurred into soft grey and amber shapes. The camera pushes in very slowly toward the cup. Warm lamp light from the left. Moody, calm. 16:9, 6 seconds.
```

```
A paper airplane glides through a sunlit classroom from the back row toward the blackboard, passing over rows of empty wooden desks. Dust drifts in the shafts of afternoon light from tall windows. The camera follows just behind the plane at the same height. Warm, nostalgic tones. 16:9, 5 seconds.
```

## Related

- [AI video render time benchmark](https://vivideo.ai/research/ai-video-render-time-benchmark)
- [AI video automation](https://vivideo.ai/features/ai-video-automation) for batch generation
- Prompt pack: [ecommerce](../prompts/ecommerce.md)
