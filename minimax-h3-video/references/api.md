# MiniMax-H3 international API reference

Official sources:

- Create: https://platform.minimax.io/docs/api-reference/video-generation-v2-create
- Query: https://platform.minimax.io/docs/api-reference/video-generation-v2-query
- List: https://platform.minimax.io/docs/api-reference/video-generation-v2-list
- Model overview: https://www.minimax.io/blog/minimax-h3

Verify the official documentation when current behavior, pricing, availability, or limits matter.

## Endpoints

- Create: `POST https://api.minimax.io/v2/video_generation`
- Query one: `GET https://api.minimax.io/v2/query/video_generation/{task_id}`
- List: `GET https://api.minimax.io/v2/query/video_generation`
- Authentication: `Authorization: Bearer $MINIMAX_API_KEY_INTER`
- Content type for create: `application/json`

## Create body

```json
{
  "model": "MiniMax-H3",
  "content": [
    {"type": "text", "text": "required prompt"},
    {
      "type": "image_url",
      "image_url": {"url": "https://example.com/reference.jpg"},
      "role": "reference_image"
    }
  ],
  "resolution": "2K",
  "duration": 15,
  "ratio": "9:16"
}
```

Content types and roles:

- `text`: exactly one non-empty prompt is required.
- `image_url`: `first_frame`, `last_frame`, or `reference_image`.
- `video_url`: `reference_video`.
- `audio_url`: `reference_audio`.

Do not mix first/last-frame roles with any reference media role.

## Current limits

- Output: `768P` or `2K`; duration is an integer from 4 through 15 seconds.
- Prompt text: at most 7,000 Unicode characters after trimming. The hosted API rejects longer prompts with HTTP 400; aim for 6,500 or fewer.
- Ratios: `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`.
- Text-to-video requires a concrete ratio.
- First/last-frame generation uses the input frame ratio; a supplied concrete ratio is ignored.
- Reference-to-video may use a concrete ratio or `adaptive`.
- Request body: at most 64 MB; prefer public URLs for large files.
- Images: JPG/JPEG/PNG/WEBP/HEIC/HEIF, at most 30 MB each, dimensions 256–5760 px, aspect ratio 0.4–2.5, at most 9 reference images.
- Videos: MP4/MOV with H.264/H.265 video and AAC/MP3 audio, at most 50 MB each, 2–15 seconds per clip, at most 3 clips and 15 seconds total, dimensions 256–5760 px, 23.976–60 fps.
- Audio references: WAV/MP3, at most 15 MB each, 2–15 seconds per clip, at most 3 clips and 15 seconds total.
- Query and list cover tasks from the last 7 days.

## Task states

`queued`, `running`, `succeeded`, `failed`, `cancelled`.

A successful result contains `task.content.url`. H3 can jointly generate native stereo voice, music, ambience, and sound effects when instructed in natural language; no separate audio-generation flag is documented for the V2 create endpoint.
