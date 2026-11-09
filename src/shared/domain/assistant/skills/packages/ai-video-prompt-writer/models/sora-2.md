# Sora 2 prompting guide

**Model page:** [Sora 2 on Vivideo](https://vivideo.ai/ai-models/sora-2)

Sora 2 is OpenAI's video model. It generates video with synchronized sound and is good at physically plausible motion and at short sequences of more than one shot within a clip.

## Where it shines

- Short narrative scenes, including several shots in one generation
- Believable physics: water, cloth, collisions, people moving through space
- Spoken dialogue with ambient sound
- Stylized looks as well as realism (animation, film stock, archival)

## Prompt tips

- **Describe shots in order.** For a sequence, write `Shot 1: … Shot 2: … Shot 3: …` with framing and action for each. Keep the number of shots small for a short clip.
- **Lead with the look.** Put the style line ("16mm film, warm grade, handheld documentary") near the start so it governs every shot.
- **Ground the physics.** Say what objects weigh, how they move, what they hit. "The heavy door swings slowly and thuds shut" reads better than "the door closes".
- **Keep lines speakable.** Short sentences in quotes, one speaker per line.
- **Don't request real people or copyrighted characters.** Describe an original character instead.

## Example prompts

```
16mm documentary look, warm grade, handheld. Shot 1: wide shot of a tiny mountain post office in falling snow, a mail van pulling up. Shot 2: medium shot of an elderly postmistress opening the door, cheeks red from the cold, saying: "You're late again." Shot 3: close-up of the driver grinning as he hands her a parcel. Audio: wind, crunching snow, van engine idling. 16:9, 10 seconds.
```

```
A skateboarder in an empty concrete pool carves up the wall, catches air, and lands with a heavy clack, wheels roaring on the concrete. Fisheye lens, low angle, camera following. Late-afternoon sun, long shadows, faded 1990s skate-video look. 4:3, 8 seconds.
```

```
Stop-motion clay animation: a small clay fox in a knitted scarf builds a snowman in a felt forest, rolls the head into place, steps back and nods proudly. Static camera, slight stop-motion jitter, soft warm studio light, tactile fingerprint textures. Gentle whistling wind. 16:9, 8 seconds.
```

## Related

- [Sora 2 vs Veo 3](https://vivideo.ai/blog/sora-2-vs-veo-3), [Sora vs Kling](https://vivideo.ai/compare/sora-vs-kling), [Sora vs Luma](https://vivideo.ai/compare/sora-vs-luma)
- [AI movie generator](https://vivideo.ai/solutions/ai-movie-generator) for longer narrative work
- Prompt pack: [cinematic storytelling](../prompts/cinematic-storytelling.md)
