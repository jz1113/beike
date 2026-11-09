# Veo prompting guide

**Model page:** [Veo 3 on Vivideo](https://vivideo.ai/ai-models/veo-3)

Veo is Google's video model family, including Veo 3.1. It is a strong all-rounder for photorealistic footage and one of the models known for generating sound with the picture — dialogue, effects and ambience in the same pass.

## Where it shines

- Realistic people, places and products with natural lighting
- Short spoken lines with matching lip movement and ambient sound
- Following detailed, film-style direction (shot size, lens, camera move)
- Ads, UGC-style clips, explainers and cinematic b-roll

## Prompt tips

- **Write it like a shot description from a script.** Subject, action, setting, camera, light, style — in full sentences. Veo rewards specific, concrete detail.
- **Script the audio explicitly.** Put dialogue in quotes with a speaker (`The chef says: "Service!"`), then describe sound separately: `Audio: pans clattering, extractor fan hum, no music.` If you want silence or no music, say so.
- **Keep dialogue short.** One or two sentences fit an 8-second clip; longer lines get rushed or cut.
- **Name the lens and move.** "35mm, slow dolly-in", "85mm close-up, locked off", "handheld, following" all land reliably.
- **Use a start frame for brand accuracy.** For a real product or a consistent character, use image-to-video rather than describing the logo.

## Example prompts

```
A fisherman in his sixties in a yellow oilskin jacket hauls a dripping net onto a small wooden boat at dawn, then looks at the camera and says: "Thirty years. Never seen it this quiet." Low-angle medium shot, slow push-in, 35mm. Overcast blue light, drizzle. Audio: waves against the hull, gulls, rain on the jacket, no music. Documentary realism. 16:9, 8 seconds.
```

```
Close-up of a barista tamping espresso in a small café, then pulling a shot; the crema pours in slow, glossy streams into a white cup. Static camera at counter height, shallow depth of field. Warm morning window light. Audio: grinder whir, the hiss of the machine, soft café chatter. Specialty-coffee ad style. 9:16, 8 seconds.
```

```
A young woman in a denim jacket sits on the hood of a car at a desert overlook at sunset and laughs as her friend off camera says: "Okay, one more photo." Medium shot, gentle handheld. Golden backlight, lens flare, warm dust in the air. Audio: wind, distant crickets. Indie road-movie look. 16:9, 8 seconds.
```

## Related

- [Sora 2 vs Veo 3](https://vivideo.ai/blog/sora-2-vs-veo-3) and [Sora vs Veo side by side](https://vivideo.ai/compare/openai-sora-vs-google-veo)
- [Which AI video models have native audio](https://vivideo.ai/research/which-ai-video-models-have-native-audio)
- Prompt packs that lean on Veo: [UGC ads](../prompts/ugc-ads.md), [food & restaurants](../prompts/food-and-restaurants.md), [talking avatars](../prompts/talking-avatars.md)
