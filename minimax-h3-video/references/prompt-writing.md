# MiniMax H3 prompt writing

Use this reference when drafting or revising a MiniMax-H3 creation prompt. It is a maintained, API-oriented summary of MiniMax's official guides rather than a copy of them:

- Base modes: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
- Full-reference mode: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md

## Route by generation mode

- **Text-to-video:** use the base three-field format.
- **First-frame, first-and-last-frame, or last-frame:** use the base three-field format preceded by the applicable picture-alignment instruction.
- **Reference-to-video:** use the full-reference six-section format. This includes prompts with reference images, videos, audio, or any combination of them.

The hosted API numbers uploaded media as `@Image N`, `@Video N`, and `@Audio N`. Use those tokens in the prompt, immediately followed by a noun explanation. The official rewrite format separately uses `<Subject N>`, `<Picture N>`, `<Video N>`, and `<Audio N>` as semantic labels. Combine the systems instead of choosing one:

```text
<Subject 1> is the product whose shape comes from @Image 1 (the full product reference) and whose logo comes from @Image 2 (the logo close-up).
```

Use `<Subject N>` for reusable visible content. Create a standalone `<Picture N>` only when an image is an actual first frame, keyframe, last frame, or composition anchor. Use `<Video N>` for an edit, continuation, or whole-video structural relationship; visible subjects taken from that video still receive `<Subject N>`. Use `<Audio N>` only when the audio signal, voice, music, beat, or sound texture is copied or referenced.

Keep each label's meaning stable across the entire prompt.

## Full-reference six-section format

Write these sections in English and in this exact order:

```text
subject_definitions:
<Subject 1> is ... from @Image 1 (...).

summary:
[reference generation] ...

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - ...

detailed_description:
One or two sentences establish the target style.
[Shot 1] ...
[Shot 2] At 00:03.500, the shot cuts to ...

overall_soundscape:
...

non_diegetic_music:
...
```

### `subject_definitions`

Define each referenced content unit on its own line, including its source, role, and the characteristics that matter. Multiple assets may define one subject; one asset may define multiple subjects.

### `summary`

Write one short paragraph beginning with the applicable task-type prefix. Combine types with `+` when needed:

- `reference generation`: assets guide a subject, scene, style, action, camera, or storyboard without acting as concrete frames.
- `keyframe completion`: an image anchors a first, intermediate, edited, or last frame.
- `video editing`: a source video is directly modified.
- `video continuation`: new content continues a source video.
- `audio reuse`: the same audio signal is copied in full or in part.
- `audio reference`: only timbre, music style, beat, dialogue content, or sound texture guides generation.

Do not introduce new labels in the summary.

### `retention_analysis`

Give every reference label one line. For visible content use `fully_preserved`, `partially_preserved`, `attribute_transfer`, or `weak_reference`. For audio use `fully_copy`, `partially_copy`, `reference`, or `weak_reference`. New environments or actions do not by themselves reduce reference fidelity.

### `detailed_description`

For ordinary generation, aim for roughly 350–500 English words while preserving all necessary dialogue and shot information. Describe the target in playback order rather than as a plot summary.

For every shot establish the current composition, subject appearance and position, environment, lighting, visible action or state change, camera behavior, synchronized sound, and where each reference takes effect.

- `[Shot 1]` has no timestamp.
- Begin later shots with `[Shot N] At MM:SS.mmm, ...`; cut times must strictly increase and remain inside the requested duration.
- Describe camera motion in natural English as motion type plus meaningful amplitude and speed, for example: `The camera pushes in with small amplitude at slow speed.` Prefer one intentional camera movement per shot.
- Use a new shot only when it adds information about subject, space, state, viewpoint, or time. Use a direct cut unless another transition is intentionally requested.
- Give vocal sources stable `(S1)`, `(S2)`, and subsequent IDs. Put only spoken content and its language inside `<d>`, for example: `<d>[English] Exact spoken line.</d>`.
- For voiceover, use the phrase `says in an off-screen voiceover`. If a visible person corresponds to that voice, explicitly keep their lips closed.
- If one line crosses a cut, use `<scenetrans>` at the connecting points and state that the audio continues across the cut. Use `<cutoff>` only when the ending intentionally truncates speech.
- Put every visible text string in English double quotation marks and preserve its spelling and punctuation exactly.
- Place diegetic sound at the moment it occurs. Keep ambience and physical sounds summarized in `overall_soundscape` rather than repeating dialogue there.

End with compact failure constraints only for plausible risks: reference identity, product geometry, anatomy, intersections, overlay spelling, unwanted captions, logos, or watermarks. Do not bury the timeline under generic quality adjectives or repeated prohibitions.

### Sound sections

`overall_soundscape` is a concise paragraph, normally one to four sentences, covering ambience, physical action sounds, and non-verbal human sounds. Do not repeat dialogue or audience-only music.

`non_diegetic_music` is normally one to three sentences. State instrumentation, tempo, rhythm, and dynamic development. Use `N/A` when no audience-only score is wanted. Do not describe diegetic radio, television, phone, singing, or performed instruments here.

## Base format for text and frame modes

Use these three fields:

```text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

For first-frame mode, put an instruction before the fields that maps `<Picture 1>` to 0.00 seconds and identifies it as the full reference for `[Shot 1]`. Begin from that exact frame, then describe the action developing forward.

For first-and-last-frame mode, map the first picture to 0.00 seconds and the last picture to the exact requested end time. Describe a continuous observable path between them; normally prefer one shot unless cuts are explicitly wanted.

For last-frame mode, map `<Picture 1>` to the exact end time. Infer a plausible opening, then progressively converge on the referenced final composition and state.

## Hosted API prompt budget

The international hosted API rejects prompt text longer than 7,000 Unicode characters. Aim for no more than 6,500 characters after trimming so small revisions remain safe. Never shorten exact dialogue, overlay copy, reference mapping, timestamps, or critical preservation constraints merely to save space. First remove repeated adjectives, duplicated subject descriptions, redundant negative constraints, and prose already captured by a section above.

Before presenting or submitting a task, run the creation command with `--dry-run`. The helper validates prompt length, media mode, media counts, local file sizes, and estimated request-body size without calling the API.

## Preflight checklist

- Generation mode matches the supplied media; reference media are not mixed with first/last frames.
- Every uploaded asset has the correct `@Image N`, `@Video N`, or `@Audio N` token and a noun explanation.
- Semantic reference labels are defined once and used consistently.
- Shot timestamps increase, fit the requested duration, and leave enough time for exact speech.
- Camera framing and text placement suit the requested aspect ratio.
- Voice language, speaker identity, accent or timbre, delivery, and exact copy are explicit.
- On-screen text is identified as headline, label, sign, or subtitle and quoted exactly.
- Ambience, action sounds, voice, and music have clear source and mixing relationships.
- Total prompt length is at most 7,000 characters; target 6,500 or fewer.
