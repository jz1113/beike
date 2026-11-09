# Seedance prompting guide

**Model pages:** [Seedance 2.5](https://vivideo.ai/ai-models/seedance-2-5) · [Seedance 2](https://vivideo.ai/ai-models/seedance-2)

Seedance is ByteDance's video model family. It is known for smooth, controlled camera movement, strong prompt following and multi-shot generation, which makes it a reliable choice for polished social and commercial clips.

## Where it shines

- Smooth camera paths: orbits, dolly-ins, crane moves, aerials
- Clean product spins and loops
- Multi-shot clips with consistent subjects
- Social shorts and ads that need a polished, stable look

## Prompt tips

- **Describe the camera path precisely.** Direction, speed and end framing: "slow orbit 90 degrees to the right, ending on a close-up of the face".
- **Use explicit shot breaks for multi-shot clips.** `Shot 1: … Cut to: …` with the same subject description repeated in each shot.
- **Be literal about style.** "Photorealistic", "3D animation", "watercolor" — then hold it constant across a series.
- **Specify speed.** "Slow", "steady", "rapid" change the result more than you would expect.
- **Keep a clip to one location** unless you deliberately cut.

## Example prompts

```
A sleek white electric scooter stands on a rooftop at sunrise. The camera starts low at the front wheel and makes a slow, smooth 180-degree orbit, rising to finish on a three-quarter view with the city skyline behind. Soft golden light, long shadows, clean commercial style, no text. 16:9, 8 seconds.
```

```
Shot 1: wide shot of a girl in a yellow raincoat running through a rainy park, splashing through puddles. Cut to: close-up of the same girl in the yellow raincoat laughing, raindrops on her face. Cut to: low shot of her red boots landing in a puddle in slow motion. Bright overcast light, saturated colors, joyful mood. 9:16, 10 seconds.
```

```
Clean 3D motion graphics: a single glowing cube splits into nine smaller cubes that arrange themselves into a rotating grid, then reassemble. Slow, steady camera push-in. Dark navy background, soft cyan rim light, minimal tech style. Seamless loop. 1:1, 6 seconds.
```

## Related

- [Seedance 2.5 explained](https://vivideo.ai/blog/seedance-2-5-explained)
- [AI video model strengths map](https://vivideo.ai/research/ai-video-model-strengths-map)
- Prompt packs: [social shorts](../prompts/social-shorts.md), [explainer videos](../prompts/explainer-videos.md), [travel](../prompts/travel.md)
