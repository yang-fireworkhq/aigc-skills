---
name: minimax-h3-video
description: Generate and manage MiniMax-H3 videos through the international MiniMax API. Use when Codex needs to create 4–15 second MiniMax-H3 videos at 768P or 2K from text, first/last frames, reference images, reference videos, or reference audio; add native voice, music, sound effects, or exact text overlays through prompts; query, wait for, list, download, or inspect H3 task results; or reproduce an H3 API command without exposing the API key.
---

# MiniMax H3 Video

Use the international endpoint `https://api.minimax.io` and the credential in `MINIMAX_API_KEY_INTER`. Never print, persist, or embed the key in prompts, scripts, logs, or artifacts.

## Required setup

1. Read [references/api.md](references/api.md) before constructing an API request.
2. Read [references/prompt-writing.md](references/prompt-writing.md) completely before drafting or revising a creation prompt. It contains the official H3 base and full-reference structures, timeline syntax, reference labels, voice, visible-text, sound, and prompt-budget rules.
3. Use [scripts/minimax_h3.py](scripts/minimax_h3.py) for API operations.
4. If the key is not visible to the process but is configured in `~/.zshrc`, source that file with shell tracing disabled before invoking the script.
5. Treat video creation as a paid external action. Show the final prompt, media mapping, duration, ratio, and resolution, and obtain user confirmation before submitting unless the user already explicitly authorized submission.

## Choose the generation mode

- **Text-to-video:** prompt only. Provide a concrete ratio.
- **First/last-frame image-to-video:** use `--first-frame` and optionally `--last-frame`. Do not add reference media. The service determines the ratio from the frame.
- **Reference-to-video:** use any combination of `--image`, `--video`, and `--audio`. Do not mix these with first/last frames.
- **New generation versus editing:** do not add a reference video merely because an earlier video exists. Add `--video` only when the user explicitly wants its motion, timing, subject, audio, or content used as context.

Preserve media order. In the prompt, call the first image `@Image 1`, the first video `@Video 1`, and the first audio clip `@Audio 1`; immediately follow each token with a noun explanation, for example `@Image 1 (the model)`. Split contact sheets, grids, and long composite images into individual images before submission unless the user explicitly wants the composite interpreted as one reference.

## Build the prompt

Follow [references/prompt-writing.md](references/prompt-writing.md), not an improvised prose format.

- **Reference-to-video:** use the official six sections in order: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, and `non_diegetic_music`. Combine hosted-API tokens such as `@Image 1 (the product)` with stable semantic labels such as `<Subject 1>`.
- **Text or frame modes:** use `integrated_multimodal_description`, `overall_soundscape`, and `non_diegetic_music`, preceded by the applicable first/last-picture alignment instruction.
- Keep the timeline explicit. `[Shot 1]` has no timestamp; later shots begin with `[Shot N] At MM:SS.mmm, ...`. Put exact spoken lines, language, stable speaker ID, visible copy, position, timing, camera movement, and synchronized sound in the relevant shot.
- Put dialogue and narration inside `<d>[Language] ...</d>`, quote exact visible text with English double quotes, and distinguish ambience from audience-only music.
- Keep the entire prompt at or below 7,000 characters; aim for 6,500 or fewer. Preserve exact copy, media mapping, timestamps, and critical reference constraints when shortening.

Ask for missing spoken language, voice type, tone, exact copy or permission to draft it, and whether on-screen text is a headline or subtitle. Do not silently invent those choices.

Before presenting or submitting a new or revised task, run the same `create` command with `--dry-run`. Treat a successful dry run as structural validation only; it does not guarantee creative quality or create a task.

## Submit a task

Prefer a prompt file for long prompts:

```bash
python3 ~/.codex/skills/minimax-h3-video/scripts/minimax_h3.py create \
  --prompt-file /absolute/path/prompt.txt \
  --image /absolute/path/model.png \
  --image /absolute/path/product.jpg \
  --duration 15 --ratio 9:16 --resolution 2K
```

Run it first with `--dry-run`, then remove that flag only after the paid action is authorized. The helper rejects prompts over 7,000 characters before network submission.

The media flag order defines `@Image N`, `@Video N`, and `@Audio N` numbering within each modality. Local media are encoded as data URLs. Prefer public HTTPS URLs for large media and whenever the estimated JSON body approaches 64 MB.

Do not automatically retry a creation request after an ambiguous connection failure. First run `list` and look for a newly created matching task; retry only if no task was created.

## Query, wait, and download

Query once when the user asks for a status check:

```bash
python3 ~/.codex/skills/minimax-h3-video/scripts/minimax_h3.py query TASK_ID
```

Do not poll unless the user asks. When asked to monitor, keep the user updated and use:

```bash
python3 ~/.codex/skills/minimax-h3-video/scripts/minimax_h3.py wait TASK_ID --interval 55
```

List recent tasks after an ambiguous create response:

```bash
python3 ~/.codex/skills/minimax-h3-video/scripts/minimax_h3.py list --page-size 10
```

Download only after success:

```bash
python3 ~/.codex/skills/minimax-h3-video/scripts/minimax_h3.py download TASK_ID --out /absolute/path/output.mp4
```

After download, use `ffprobe` to verify duration, dimensions, frame rate, and audio streams. For text-overlay or product-detail tests, make a contact sheet and visually inspect exact spelling, stability, product identity, hands, straps, and other high-risk regions. Report generation success separately from creative QA.

## Safety and failure handling

- Never expose the environment variable value, even while debugging.
- Never submit duplicate paid tasks merely because H3 is slow; queued and running states can persist for a long time at 2K.
- On HTTP 401, verify environment loading without printing the key.
- On HTTP 402, report insufficient balance and stop.
- On HTTP 422, report the service's content validation message and revise only with user approval.
- On HTTP 429 or 5xx during queries, retry safely. Do not automatically retry POST creation.
- Keep failed creative candidates; do not splice, publish, or replace an existing video unless the user requested that action.
