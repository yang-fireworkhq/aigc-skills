---
name: byteplus-seedance-video
description: Generate BytePlus Seedance 2.0, 2.0 Fast, or 2.5 videos from environment credentials in any repository. Use when Codex needs to upload reference media to BytePlus TOS, create and poll Ark Asset records, submit and monitor Seedance content generation tasks, clean temporary resources, or explain and debug this workflow. Supports native audio-video generation, multimodal references, and model-aware limits up to 30 seconds with Seedance 2.5.
---

# BytePlus Seedance Video

## Quick Start

Use the standalone runner from any repository. It has no package dependencies beyond a modern Node runtime with `fetch`.

```bash
node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \
  --dotenv .env \
  --prompt "A premium product video..." \
  --image "https://example.com/product.jpg" \
  --duration 8 \
  --ratio 16:9
```

The runner creates temporary BytePlus resources and cleans them up in a `finally` path after success or failure.

## Environment

Load values from shell environment or `--dotenv`:

- `ARK_API_KEY`: required for Seedance task create/query.
- `BYTEPLUS_ACCESS_KEY`: required when reference media is used.
- `BYTEPLUS_SECRET_KEY`: required when reference media is used.
- `BYTEPLUS_TOS_BUCKET`: required when reference media is used.
- `BYTEPLUS_TOS_REGION`: optional; defaults to `ap-southeast-3`.
- `BYTEPLUS_ARK_REGION`: optional; defaults to `ap-southeast-1`.

Text-only generation only requires `ARK_API_KEY`. Any `--image`, `--video`, or `--audio` requires AK/SK and TOS settings.

## Workflow

1. Reference images/videos: upload to TOS, create an Ark Asset Group, create Image/Video Assets, poll `GetAsset` until `Active`, then use `asset://{AssetId}` in Seedance content.
2. Reference audio: upload to TOS and use the TOS HTTPS URLs directly in Seedance content.
3. Build Seedance `content` with text first, then image/video/audio items. Seedance 2.0 and 2.5 use `reference_image`, `reference_video`, and `reference_audio` roles.
4. Create the generation task with `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`.
5. Poll the task until `status` is `succeeded`; return `content.video_url`.
6. Delete tracked TOS objects and Asset Groups after success or failure. If cleanup warnings appear, report the affected key or group ID.

Read `references/byteplus-seedance-flow.md` when endpoint or signing details are needed.

## Capability notes

- Treat Seedance 2.0 and 2.5 as native audio-video models, not just silent video models with optional ambience. They can generate background music, foley, dialogue, and voiceover in one pass when the prompt specifies them clearly.
- Chinese output is supported. For Chinese ads, prompts may be written in Chinese and can explicitly describe the spoken line, speaker gender/style, and when the line occurs.
- The runner supports `dreamina-seedance-2-0-fast-260128` (`fast`), `dreamina-seedance-2-0-260128` (`standard`), and `dreamina-seedance-2-5-260628` (`2.5` or `sd25`). Keep the 2.0 Fast default for backward compatibility. Use 2.5 when the user requests the latest quality/capabilities, more than 15 seconds, or larger reference sets.
- Seedance 2.5 can generate up to 30 seconds, accepts up to 30 reference images, 10 reference videos, and 10 reference audio clips (50 assets total), and supports audio-only reference input. Reference videos and audio are also subject to the model's duration and combined-duration limits. The runner applies the count limits only when the selected model is 2.5; 2.0 retains its 9/3/3 limits and 4-15 second duration.
- With Seedance 2.5, `--duration -1` lets the model choose a duration. Video editing requires `ratio=adaptive` and `duration=-1`; video extension requires `ratio=adaptive`. The current runner sends images as `reference_image` and does not expose first-frame/last-frame roles or `omni_reference_task_type`.
- Seedance 2.5 does not accept directly uploaded reference images or videos containing real human faces. Use BytePlus trusted model outputs, preset digital characters, or authorized portrait assets when the workflow requires people.
- The bundled runner exposes `--generate-audio true|false` and `--audio` reference inputs, but it does not expose dedicated voice-picker, SSML, or speaker-id flags. That is a runner limitation, not a model limitation.
- When a user needs exact voice identity, precise speaker selection, or SSML-style controls, consider BytePlus Seed Speech TTS as a companion workflow. When the user needs a single generated ad with synchronized picture, music, and voiceover, Seedance alone is a valid first pass.
- For ad generation, prefer prompting spoken content directly in the video prompt and then using `--audio` only when the user already has a reference voice, timing bed, or approved narration track.

For Seedance 2.5 task types, constraints, and current capability details, read the [official Seedance 2.5 tutorial](https://docs.byteplus.com/en/docs/ModelArk/2607688).

## Prompting guidance for audio

- Ask whether the video should include `voiceover`, `on-camera dialogue`, or `no speech`.
- Ask for the target language and speaker vibe up front, for example: `Chinese`, `female`, `warm premium food commercial`, `measured pace`.
- Keep spoken copy short enough to fit the duration. For a 15-second ad, target roughly 20-40 Chinese characters of primary narration unless the user explicitly wants dense speech.
- Put spoken lines into the prompt with timing cues, for example: `0-4s: female Chinese voiceover says "..."`
- If subtitles are important, describe them separately from the spoken line. Do not rely on generated text rendering for production accuracy.
- When using reference audio, describe what should be borrowed from it: tone, pacing, emotional color, rhythm, or pronunciation style.

## Runner Options

- `--dotenv path`: load KEY=VALUE pairs before reading environment variables.
- `--prompt "..."` or `--prompt-file path`: video prompt.
- `--image URL_OR_PATH`: repeat up to 9 reference images with Seedance 2.0 or 30 with Seedance 2.5.
- `--kind product_reference|model_reference`: optional image kind, repeated once per image.
- `--video URL_OR_PATH`: repeat up to 3 reference videos with Seedance 2.0 or 10 with Seedance 2.5. Videos are uploaded to TOS, registered as Ark `Video` Assets, and passed to Seedance as `asset://...` reference videos.
- `--audio URL_OR_PATH`: repeat up to 3 reference audios with Seedance 2.0 or 10 with Seedance 2.5.
- `--model MODEL`: default `dreamina-seedance-2-0-fast-260128`. Supported variants: `dreamina-seedance-2-0-fast-260128` (`fast`), `dreamina-seedance-2-0-260128` (`standard`), and `dreamina-seedance-2-5-260628` (`2.5` or `sd25`).
- `--duration N`: Seedance 2.0 is clamped to 4-15 seconds; Seedance 2.5 is clamped to 4-30 seconds and also accepts `-1` for adaptive duration.
- `--ratio 16:9|4:3|1:1|3:4|9:16|21:9|adaptive`: default `16:9`; the extra 2.5 ratios are passed through unchanged.
- `--generate-audio true|false`: default `true`.
- `--seed N`: optional seed.
- `--attempts N`: default `5`, matching the AIVidCraft provider retry behavior.
- `--tos-acl public-read|private|none`: default `public-read`; use `none` if the bucket policy already makes objects readable or ACLs are disallowed.
- `--asset-moderation Skip|Default`: default `Skip`; use `Default` if the account cannot skip asset prefilter review.
- `--skip-prompt-annotation`: use when the prompt already includes reference annotations.
- `--out result.json`: write the complete result JSON.

Warn before running real generation because BytePlus may charge for submitted tasks.
