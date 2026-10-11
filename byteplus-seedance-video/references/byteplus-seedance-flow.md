# BytePlus Seedance Flow Reference

## Endpoints

- Seedance create task: `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`
- Seedance query task: `GET https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{taskId}`
- Ark Asset API: `POST https://ark.ap-southeast-1.byteplusapi.com/?Action={Action}&Version=2024-01-01`
- TOS S3 virtual-host URL: `https://{bucket}.tos-{region}.bytepluses.com/{key}`

## Authentication

- Seedance task APIs use `Authorization: Bearer $ARK_API_KEY`.
- Ark Asset APIs use BytePlus HMAC signing with:
  - Algorithm: `HMAC-SHA256`
  - Credential scope: `{yyyyMMdd}/{region}/ark/request`
  - Signed headers: `content-type;host;x-content-sha256;x-date`
- TOS S3 APIs use AWS Signature V4 style signing with:
  - Algorithm: `AWS4-HMAC-SHA256`
  - Credential scope: `{yyyyMMdd}/{tosRegion}/s3/aws4_request`

## Asset Lifecycle

1. `CreateAssetGroup`:
   ```json
   { "Name": "seedance-xxxx", "GroupType": "AIGC" }
   ```
2. Upload image or video bytes to TOS.
3. `CreateAsset`:
   ```json
   {
     "GroupId": "group-xxx",
     "URL": "https://bucket.tos-region.bytepluses.com/seedance-run/input.jpg",
     "AssetType": "Image",
     "Moderation": { "Strategy": "Skip" }
   }
   ```
   For reference videos, use `"AssetType": "Video"` and the uploaded video URL.
4. Poll `GetAsset`:
   - `Active`: use `asset://{AssetId}`.
   - `Processing`: keep waiting.
   - `Failed`: stop and surface `Error.Message`.
5. Cleanup after task success or failure:
   - Delete all tracked TOS objects.
   - Delete all tracked Asset Groups. Deleting a group cascades to its assets.

## Seedance Content Shape

Select one of these model IDs:

- Seedance 2.0 Fast: `dreamina-seedance-2-0-fast-260128`
- Seedance 2.0: `dreamina-seedance-2-0-260128`
- Seedance 2.5: `dreamina-seedance-2-5-260628`

```json
{
  "model": "dreamina-seedance-2-5-260628",
  "content": [
    { "type": "text", "text": "@Image1 is product reference. Make a cinematic ad..." },
    {
      "type": "image_url",
      "image_url": { "url": "asset://Asset-xxx" },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": { "url": "asset://Asset-video-xxx" },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": { "url": "https://bucket.tos-region.bytepluses.com/input.mp3" },
      "role": "reference_audio"
    }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 8,
  "watermark": false
}
```

The task create/query endpoints and content roles are shared across Seedance 2.0 and 2.5. Apply model-specific limits:

| Model | Duration | Reference images | Reference videos | Reference audio |
| --- | --- | --- | --- | --- |
| Seedance 2.0 / 2.0 Fast | 4-15 seconds | Up to 9 | Up to 3 | Up to 3 |
| Seedance 2.5 | 4-30 seconds or `-1` | Up to 30 | Up to 10 | Up to 10 |

Seedance 2.5 supports up to 50 combined omni reference assets and allows audio-only references. For video editing, use `ratio: "adaptive"` and `duration: -1`; video extension requires `ratio: "adaptive"`. Read the [official Seedance 2.5 tutorial](https://docs.byteplus.com/en/docs/ModelArk/2607688) before using edit, extension, or first/last-frame task types because they have additional constraints.
