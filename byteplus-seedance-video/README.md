# BytePlus Seedance Video

Codex skill and standalone Node.js runner for generating BytePlus Seedance 2.0, 2.0 Fast, and 2.5 videos from text prompts and optional image, video, or audio references.

The runner handles the BytePlus flow end to end:

- uploads local reference media to BytePlus TOS
- creates Ark Asset Groups and image/video assets when needed
- polls assets until they become active
- submits Seedance generation tasks
- polls for the final video URL
- cleans up temporary TOS objects and Ark Asset Groups in a `finally` path

Real Seedance task submissions may incur BytePlus charges. Confirm before running generation against production credentials.

## Quick Install

```bash
npx skills add yang-fireworkhq/aigc-skills --skill byteplus-seedance-video
```

## Contents

```text
.
|-- SKILL.md
|-- agents/
|   `-- openai.yaml
|-- references/
|   `-- byteplus-seedance-flow.md
`-- scripts/
    `-- create_seedance_video.mjs
```

## Requirements

- Node.js 18 or newer
- BytePlus Ark API credentials
- BytePlus TOS credentials when using reference images, videos, or audio

No npm install is required. The runner uses built-in Node.js modules and global `fetch`.

## Environment

Values can come from the shell environment or a dotenv file passed with `--dotenv`.

| Variable | Required | Notes |
| --- | --- | --- |
| `ARK_API_KEY` | Always | Used for Seedance task creation and polling. |
| `BYTEPLUS_ACCESS_KEY` | With reference media | Used for Ark Asset API and TOS signing. |
| `BYTEPLUS_SECRET_KEY` | With reference media | Used for Ark Asset API and TOS signing. |
| `BYTEPLUS_TOS_BUCKET` | With reference media | Bucket used for temporary uploads. |
| `BYTEPLUS_TOS_REGION` | No | Defaults to `ap-southeast-3`. |
| `BYTEPLUS_ARK_REGION` | No | Defaults to `ap-southeast-1`. |

Text-only generation only requires `ARK_API_KEY`. Any `--image`, `--video`, or `--audio` input requires the BytePlus access key, secret key, TOS bucket, and TOS region settings.

## Quick Start

Run the bundled script from any repository:

```bash
node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \
  --dotenv .env \
  --prompt "A premium product video with cinematic camera movement and natural lighting." \
  --duration 8 \
  --ratio 16:9 \
  --out result.json
```

Use a reference image:

```bash
node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \
  --dotenv .env \
  --prompt "Create an elegant 8 second product ad. Keep the product shape and label consistent." \
  --image ./product.jpg \
  --kind product_reference \
  --duration 8 \
  --ratio 9:16 \
  --out result.json
```

Use image, video, and audio references together:

```bash
node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \
  --dotenv .env \
  --prompt-file ./prompt.txt \
  --image ./hero-product.png \
  --kind product_reference \
  --video ./motion-reference.mp4 \
  --audio ./voice-reference.wav \
  --model standard \
  --duration 15 \
  --ratio 9:16 \
  --generate-audio true \
  --out result.json
```

The output JSON includes the BytePlus task response, including the final `content.video_url` when the task succeeds.

## Runner Options

```text
--dotenv PATH                 Load KEY=VALUE pairs before reading process.env.
--prompt TEXT                 Prompt text.
--prompt-file PATH            Read prompt text from a file.
--image URL_OR_PATH           Reference image. Max 9 for 2.0; 30 for 2.5.
--kind KIND                   product_reference or model_reference. Repeat per image.
--video URL_OR_PATH           Reference video. Max 3 for 2.0; 10 for 2.5.
--audio URL_OR_PATH           Reference audio. Max 3 for 2.0; 10 for 2.5.
--model MODEL                 fast, standard, 2.5, sd25, or a full model id.
--duration SECONDS            Default 8. 2.0: 4-15; 2.5: 4-30 or -1.
--ratio RATIO                 Default 16:9. 2.5: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive.
--generate-audio BOOL         Default true.
--watermark BOOL              Default false.
--seed NUMBER                 Optional seed.
--attempts NUMBER             Default 5.
--tos-acl public-read|private|none
--asset-moderation Skip|Default
--skip-prompt-annotation      Prompt already includes reference markers.
--out PATH                    Write result JSON to this path.
--help                        Show CLI help.
```

Model aliases:

- `fast`: `dreamina-seedance-2-0-fast-260128`
- `standard`: `dreamina-seedance-2-0-260128`
- `2.5` or `sd25`: `dreamina-seedance-2-5-260628`

Use `fast` for drafts and iteration. Use `standard` for the Seedance 2.0 quality model. Use `2.5` for Seedance 2.5 quality improvements, clips up to 30 seconds, adaptive duration with `--duration -1`, and larger reference sets (up to 30 images, 10 videos, and 10 audio clips).

Seedance 2.5 can use audio-only references. It also has special constraints for editing and extension: video editing requires `--ratio adaptive --duration -1`, while video extension requires `--ratio adaptive`. See the [official Seedance 2.5 tutorial](https://docs.byteplus.com/en/docs/ModelArk/2607688) for the latest capability and portrait-input restrictions.

## Reference Media Flow

For reference images and videos, the runner uploads local files to TOS, creates an Ark Asset Group, creates Ark image/video assets, polls `GetAsset` until each asset is `Active`, and then passes `asset://{AssetId}` references to Seedance.

For reference audio, the runner uploads local files to TOS and passes the temporary TOS HTTPS URL directly as a `reference_audio` item.

Tracked temporary TOS objects and Ark Asset Groups are deleted after success or failure. If cleanup warnings appear, report the affected object key or group ID so the user can clean it up manually.

See [references/byteplus-seedance-flow.md](references/byteplus-seedance-flow.md) for endpoint, signing, asset lifecycle, and request-shape details.

## Prompting Notes

Seedance 2.0 and 2.5 can generate synchronized picture, motion, music, foley, dialogue, and voiceover in a single pass when the prompt is explicit.

For ad-style videos:

- Decide whether the video needs `voiceover`, `on-camera dialogue`, or `no speech`.
- Specify the target language and speaker style, such as `Chinese female voiceover, warm premium food commercial, measured pace`.
- Keep spoken copy short enough for the duration. For a 15 second Chinese ad, about 20-40 Chinese characters of primary narration is a practical first pass.
- Put spoken lines in the prompt with timing cues, such as `0-4s: female Chinese voiceover says "..."`.
- Describe subtitles separately from speech. Do not rely on generated text rendering for production-accurate captions.
- Use `--audio` only when the user already has a reference voice, timing bed, rhythm, or approved narration track.

## Codex Skill Use

The skill file lives at `SKILL.md`. A Codex installation can place this directory under:

```text
~/.codex/skills/byteplus-seedance-video
```

When this skill is active, Codex should warn before running real generation because BytePlus may charge for submitted tasks.
