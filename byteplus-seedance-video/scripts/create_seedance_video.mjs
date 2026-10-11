#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SEEDANCE_API_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
const ASSET_API_VERSION = '2024-01-01';
const SEEDANCE_STANDARD_MODEL = 'dreamina-seedance-2-0-260128';
const SEEDANCE_FAST_MODEL = 'dreamina-seedance-2-0-fast-260128';
const SEEDANCE_2_5_MODEL = 'dreamina-seedance-2-5-260628';
const DEFAULT_MODEL = SEEDANCE_FAST_MODEL;

const SEEDANCE_2_0_REFERENCE_LIMITS = Object.freeze({ images: 9, videos: 3, audios: 3 });
const SEEDANCE_2_5_REFERENCE_LIMITS = Object.freeze({ images: 30, videos: 10, audios: 10 });

const ASSET_POLL_INTERVAL_MS = 2_000;
const ASSET_POLL_TIMEOUT_MS = 15 * 60 * 1_000;
const TASK_POLL_INITIAL_INTERVAL_MS = 3_000;
const TASK_POLL_MAX_INTERVAL_MS = 15_000;
const TASK_POLL_TIMEOUT_MS = 30 * 60 * 1_000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  loadDotenv(args.dotenv);
  const env = readEnv(args);
  const prompt = readPrompt(args);
  const cleanup = createCleanupTracker(env);

  let result;
  try {
    const referenceLimits = referenceLimitsForModel(args.model);
    const imageSources = args.images.slice(0, referenceLimits.images);
    const videoSources = args.videos.slice(0, referenceLimits.videos);
    const audioSources = args.audios.slice(0, referenceLimits.audios);

    const imageAssetUrls = await prepareImageAssets(imageSources, args, env, cleanup);
    const videoUrls = await prepareVideoAssets(videoSources, args, env, cleanup);
    const audioUrls = await uploadMediaSources(audioSources, 'audios', args, env, cleanup);

    const annotatedPrompt = args.skipPromptAnnotation
      ? prompt
      : buildAnnotatedPrompt(prompt, imageAssetUrls.length, videoUrls.length, audioUrls.length, args.imageKinds);

    const body = {
      model: args.model,
      content: buildSeedanceContent(annotatedPrompt, imageAssetUrls, videoUrls, audioUrls, args.model),
      generate_audio: args.generateAudio,
      ratio: args.ratio,
      duration: normalizeDuration(args.duration, args.model),
      watermark: args.watermark,
    };
    if (typeof args.seed === 'number') body.seed = args.seed;

    result = await executeWithRetries(body, args, env);
  } finally {
    await cleanup.cleanupAll();
  }

  const output = JSON.stringify(result, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), `${output}\n`, 'utf8');
  console.log(output);
}

function usage() {
  return `Create a BytePlus Seedance video from any repository.

Usage:
  node ~/.codex/skills/byteplus-seedance-video/scripts/create_seedance_video.mjs \\
    --dotenv .env \\
    --prompt "A product video..." \\
    --image ./product.jpg \\
    --duration 8 \\
    --ratio 16:9

Options:
  --dotenv PATH                 Load KEY=VALUE pairs before reading process.env.
  --prompt TEXT                 Prompt text.
  --prompt-file PATH            Read prompt text from a file.
  --image URL_OR_PATH           Reference image. Repeatable, max 9 for 2.0; 30 for 2.5.
  --kind KIND                   product_reference or model_reference. Repeat per image.
  --video URL_OR_PATH           Reference video. Repeatable, max 3 for 2.0; 10 for 2.5.
                                Uploaded as Ark Video Asset.
  --audio URL_OR_PATH           Reference audio. Repeatable, max 3 for 2.0; 10 for 2.5.
  --model MODEL                 Default ${DEFAULT_MODEL}. Supports ${SEEDANCE_FAST_MODEL},
                                ${SEEDANCE_STANDARD_MODEL}, and ${SEEDANCE_2_5_MODEL}.
                                Aliases: fast, standard, 2.5, sd25.
  --duration SECONDS            Default 8. 2.0: 4-15; 2.5: 4-30 or -1 (adaptive).
  --ratio RATIO                 Default 16:9. 2.5 also supports 4:3, 3:4, 21:9, adaptive.
  --generate-audio BOOL         Default true.
  --watermark BOOL              Default false.
  --seed NUMBER                 Optional seed.
  --attempts NUMBER             Default 5.
  --tos-acl public-read|private|none
                                Default public-read.
  --asset-moderation Skip|Default
                                Default Skip.
  --skip-prompt-annotation      Prompt already includes @Image/@Video/@Audio markers.
  --out PATH                    Write result JSON to this path.
  --help                        Show this help.

Environment:
  ARK_API_KEY is always required.
  BYTEPLUS_ACCESS_KEY, BYTEPLUS_SECRET_KEY, BYTEPLUS_TOS_BUCKET are required for reference media.
  BYTEPLUS_TOS_REGION defaults to ap-southeast-3.
  BYTEPLUS_ARK_REGION defaults to ap-southeast-1.`;
}

function parseArgs(argv) {
  const args = {
    images: [],
    imageKinds: [],
    videos: [],
    audios: [],
    model: DEFAULT_MODEL,
    duration: 8,
    ratio: '16:9',
    generateAudio: true,
    watermark: false,
    attempts: 5,
    tosAcl: 'public-read',
    assetModeration: 'Skip',
    skipPromptAnnotation: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--dotenv':
        args.dotenv = next();
        break;
      case '--prompt':
        args.prompt = next();
        break;
      case '--prompt-file':
        args.promptFile = next();
        break;
      case '--image':
        args.images.push(next());
        break;
      case '--kind':
        args.imageKinds.push(next());
        break;
      case '--video':
        args.videos.push(next());
        break;
      case '--audio':
        args.audios.push(next());
        break;
      case '--model':
        args.model = next();
        break;
      case '--duration':
        args.duration = Number(next());
        break;
      case '--ratio':
        args.ratio = next();
        break;
      case '--generate-audio':
        args.generateAudio = parseBool(next());
        break;
      case '--watermark':
        args.watermark = parseBool(next());
        break;
      case '--seed':
        args.seed = Number(next());
        break;
      case '--attempts':
        args.attempts = Number(next());
        break;
      case '--tos-acl':
        args.tosAcl = next();
        break;
      case '--asset-moderation':
        args.assetModeration = next();
        break;
      case '--skip-prompt-annotation':
        args.skipPromptAnnotation = true;
        break;
      case '--out':
        args.out = next();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if (!Number.isFinite(args.duration)) throw new Error('--duration must be a number');
  if (!Number.isInteger(args.attempts) || args.attempts < 1) throw new Error('--attempts must be a positive integer');
  if (typeof args.seed === 'number' && !Number.isFinite(args.seed)) throw new Error('--seed must be a number');
  if (!['public-read', 'private', 'none'].includes(args.tosAcl)) throw new Error('--tos-acl must be public-read, private, or none');
  if (!['Skip', 'Default'].includes(args.assetModeration)) throw new Error('--asset-moderation must be Skip or Default');
  args.model = normalizeModel(args.model);
  if (args.imageKinds.length && args.imageKinds.length !== args.images.length) {
    throw new Error('--kind must be repeated exactly once per --image when provided');
  }

  return args;
}

function normalizeModel(model) {
  const normalized = String(model || '').trim();
  const aliases = new Map([
    ['fast', SEEDANCE_FAST_MODEL],
    ['seedance-fast', SEEDANCE_FAST_MODEL],
    ['seedance-2-fast', SEEDANCE_FAST_MODEL],
    ['seedance-2.0-fast', SEEDANCE_FAST_MODEL],
    ['dreamina-seedance-2-0-fast', SEEDANCE_FAST_MODEL],
    ['standard', SEEDANCE_STANDARD_MODEL],
    ['full', SEEDANCE_STANDARD_MODEL],
    ['quality', SEEDANCE_STANDARD_MODEL],
    ['seedance-standard', SEEDANCE_STANDARD_MODEL],
    ['seedance-2-standard', SEEDANCE_STANDARD_MODEL],
    ['seedance-2.0', SEEDANCE_STANDARD_MODEL],
    ['dreamina-seedance-2-0', SEEDANCE_STANDARD_MODEL],
    ['2.5', SEEDANCE_2_5_MODEL],
    ['2-5', SEEDANCE_2_5_MODEL],
    ['sd2.5', SEEDANCE_2_5_MODEL],
    ['sd25', SEEDANCE_2_5_MODEL],
    ['seedance-2.5', SEEDANCE_2_5_MODEL],
    ['seedance-2-5', SEEDANCE_2_5_MODEL],
    ['dreamina-seedance-2-5', SEEDANCE_2_5_MODEL],
  ]);
  return aliases.get(normalized.toLowerCase()) || normalized;
}

function isSeedance25Model(model) {
  return model === SEEDANCE_2_5_MODEL || model.includes('seedance-2-5');
}

function referenceLimitsForModel(model) {
  return isSeedance25Model(model) ? SEEDANCE_2_5_REFERENCE_LIMITS : SEEDANCE_2_0_REFERENCE_LIMITS;
}

function normalizeDuration(duration, model) {
  if (isSeedance25Model(model)) {
    if (duration === -1) return -1;
    return clamp(duration, 4, 30);
  }
  return clamp(duration, 4, 15);
}

function readPrompt(args) {
  if (args.prompt && args.promptFile) throw new Error('Use either --prompt or --prompt-file, not both');
  if (args.promptFile) return fs.readFileSync(path.resolve(args.promptFile), 'utf8').trim();
  if (args.prompt) return args.prompt;
  throw new Error('Missing --prompt or --prompt-file');
}

function loadDotenv(dotenvPath) {
  if (!dotenvPath) return;
  const fullPath = path.resolve(dotenvPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Dotenv file not found: ${fullPath}`);
  const text = fs.readFileSync(fullPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnv(args) {
  const env = {
    arkApiKey: process.env.ARK_API_KEY,
    accessKey: process.env.BYTEPLUS_ACCESS_KEY,
    secretKey: process.env.BYTEPLUS_SECRET_KEY,
    tosBucket: process.env.BYTEPLUS_TOS_BUCKET,
    tosRegion: process.env.BYTEPLUS_TOS_REGION || 'ap-southeast-3',
    arkRegion: process.env.BYTEPLUS_ARK_REGION || 'ap-southeast-1',
  };

  const missing = [];
  if (!env.arkApiKey) missing.push('ARK_API_KEY');
  const needsMedia = args.images.length > 0 || args.videos.length > 0 || args.audios.length > 0;
  if (needsMedia) {
    if (!env.accessKey) missing.push('BYTEPLUS_ACCESS_KEY');
    if (!env.secretKey) missing.push('BYTEPLUS_SECRET_KEY');
    if (!env.tosBucket) missing.push('BYTEPLUS_TOS_BUCKET');
  }
  if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  return env;
}

async function prepareImageAssets(imageSources, args, env, cleanup) {
  return prepareMediaAssets(imageSources, {
    assetType: 'Image',
    folder: 'images',
    namePrefix: 'image-ref',
    fallbackContentType: 'image/jpeg',
  }, args, env, cleanup);
}

async function prepareVideoAssets(videoSources, args, env, cleanup) {
  return prepareMediaAssets(videoSources, {
    assetType: 'Video',
    folder: 'videos',
    namePrefix: 'video-ref',
    fallbackContentType: 'video/mp4',
  }, args, env, cleanup);
}

async function prepareMediaAssets(sources, options, args, env, cleanup) {
  if (!sources.length) return [];
  const groupId = await createAssetGroup(`seedance-${options.assetType.toLowerCase()}-${randomId(8)}`, env);
  cleanup.trackAssetGroup(groupId);

  const assetUrls = [];
  for (let i = 0; i < sources.length; i += 1) {
    const media = await readMedia(sources[i], options.fallbackContentType);
    const key = `byteplus-seedance/${cleanup.runId}/assets/${options.folder}/${Date.now()}-${i}${media.ext}`;
    const url = await putTosObject(key, media.buffer, media.contentType, args, env);
    cleanup.trackTosKey(key);
    const assetId = await createAsset(groupId, url, `${options.namePrefix}-${i}`, options.assetType, args, env);
    await waitForAssetActive(assetId, env);
    assetUrls.push(`asset://${assetId}`);
  }
  return assetUrls;
}

async function uploadMediaSources(sources, folder, args, env, cleanup) {
  const urls = [];
  for (let i = 0; i < sources.length; i += 1) {
    const media = await readMedia(sources[i], 'application/octet-stream');
    const key = `byteplus-seedance/${cleanup.runId}/media/${folder}/${Date.now()}-${i}${media.ext}`;
    const url = await putTosObject(key, media.buffer, media.contentType, args, env);
    cleanup.trackTosKey(key);
    urls.push(url);
  }
  return urls;
}

async function readMedia(source, fallbackContentType) {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error(`Invalid data URI: ${source.slice(0, 40)}...`);
    const contentType = match[1] || fallbackContentType;
    return {
      buffer: Buffer.from(match[2], 'base64'),
      contentType,
      ext: extensionFromContentType(contentType),
    };
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to download media ${source}: ${response.status} ${response.statusText}`);
    const contentType = normalizeContentType(response.headers.get('content-type')) || guessContentType(source) || fallbackContentType;
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType,
      ext: extensionFromPathname(new URL(source).pathname) || extensionFromContentType(contentType),
    };
  }

  const filePath = source.startsWith('file:') ? new URL(source) : path.resolve(source);
  const buffer = fs.readFileSync(filePath);
  const contentType = guessContentType(String(filePath)) || fallbackContentType;
  return {
    buffer,
    contentType,
    ext: extensionFromPathname(String(filePath)) || extensionFromContentType(contentType),
  };
}

async function createAssetGroup(name, env) {
  const result = await arkRequest('CreateAssetGroup', { Name: name, GroupType: 'AIGC' }, env);
  return result.Id;
}

async function createAsset(groupId, url, name, assetType, args, env) {
  const body = {
    GroupId: groupId,
    URL: url,
    Name: name,
    AssetType: assetType,
    Moderation: { Strategy: args.assetModeration },
  };
  const result = await arkRequest('CreateAsset', body, env);
  if (!result.Id) throw new Error(`CreateAsset(${assetType}) returned no Id: ${JSON.stringify(result)}`);
  return result.Id;
}

async function waitForAssetActive(assetId, env) {
  const deadline = Date.now() + ASSET_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await arkRequest('GetAsset', { Id: assetId }, env);
    if (result.Status === 'Active') return;
    if (result.Status === 'Failed') {
      throw new Error(`Asset ${assetId} failed: ${result.Error?.Message || 'unknown error'}`);
    }
    await sleep(ASSET_POLL_INTERVAL_MS);
  }
  throw new Error(`Asset ${assetId} did not become Active within ${ASSET_POLL_TIMEOUT_MS / 1000}s`);
}

async function deleteAssetGroup(groupId, env) {
  await arkRequest('DeleteAssetGroup', { Id: groupId }, env);
}

async function arkRequest(action, body, env) {
  const host = `ark.${env.arkRegion}.byteplusapi.com`;
  const url = `https://${host}/?Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(ASSET_API_VERSION)}`;
  const bodyText = JSON.stringify(body);
  const now = new Date();
  const xDate = formatAmzDate(now);
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256Hex(bodyText);
  const headers = {
    'content-type': 'application/json',
    host,
    'x-content-sha256': payloadHash,
    'x-date': xDate,
  };
  headers.authorization = signVolcengineRequest({
    method: 'POST',
    canonicalUri: '/',
    query: { Action: action, Version: ASSET_API_VERSION },
    headers,
    payloadHash,
    accessKey: env.accessKey,
    secretKey: env.secretKey,
    shortDate,
    xDate,
    region: env.arkRegion,
    service: 'ark',
  });

  const response = await fetch(url, { method: 'POST', headers, body: bodyText });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Ark ${action} returned non-JSON response status=${response.status}: ${text.slice(0, 500)}`);
  }
  if (!response.ok) throw new Error(`Ark ${action} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  const meta = data.ResponseMetadata;
  if (meta?.Error) {
    throw new Error(`Ark ${action} failed: [${meta.Error.Code}] ${meta.Error.Message} (RequestId: ${meta.RequestId})`);
  }
  return data.Result || {};
}

async function putTosObject(key, buffer, contentType, args, env) {
  const host = `${env.tosBucket}.tos-${env.tosRegion}.bytepluses.com`;
  const encodedKey = encodePath(key);
  const url = `https://${host}/${encodedKey}`;
  const headers = {
    host,
    'content-type': contentType,
  };
  if (args.tosAcl !== 'none') headers['x-tos-acl'] = args.tosAcl;
  signTosHeaders(headers, 'PUT', `/${encodedKey}`, buffer, env);

  const response = await fetch(url, { method: 'PUT', headers, body: buffer });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TOS PUT failed key=${key} status=${response.status}: ${text.slice(0, 500)}`);
  }
  return url;
}

async function deleteTosObject(key, env) {
  const host = `${env.tosBucket}.tos-${env.tosRegion}.bytepluses.com`;
  const encodedKey = encodePath(key);
  const url = `https://${host}/${encodedKey}`;
  const headers = { host };
  signTosHeaders(headers, 'DELETE', `/${encodedKey}`, Buffer.alloc(0), env);
  const response = await fetch(url, { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`TOS DELETE failed key=${key} status=${response.status}: ${text.slice(0, 500)}`);
  }
}

function signTosHeaders(headers, method, canonicalUri, body, env) {
  const now = new Date();
  const tosDate = formatAmzDate(now);
  const shortDate = tosDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  headers['x-tos-date'] = tosDate;
  headers['x-tos-content-sha256'] = payloadHash;

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const tosSigningRegion = env.tosRegion.startsWith('tos-') ? env.tosRegion : `tos-${env.tosRegion}`;
  const scope = `${shortDate}/${tosSigningRegion}/tos/request`;
  const stringToSign = [
    'TOS4-HMAC-SHA256',
    tosDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(env.secretKey, shortDate), tosSigningRegion), 'tos'),
    'request',
  );
  const signature = hmacHex(signingKey, stringToSign);
  headers.authorization = `TOS4-HMAC-SHA256 Credential=${env.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function signVolcengineRequest({ method, canonicalUri, query, headers, payloadHash, accessKey, secretKey, shortDate, xDate, region, service }) {
  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(secretKey, shortDate), region), service), 'request');
  const signature = hmacHex(signingKey, stringToSign);
  return `HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function canonicalizeHeaders(headers) {
  const entries = Object.entries(headers)
    .filter(([key]) => key.toLowerCase() !== 'authorization')
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: entries.map(([key]) => key).join(';'),
  };
}

async function executeWithRetries(body, args, env) {
  let lastError;
  for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
    try {
      const taskId = await createSeedanceTask(body, env);
      const task = await pollSeedanceTask(taskId, env);
      const videoUrl = task.content?.video_url;
      if (!videoUrl) throw new Error(`BytePlus task ${taskId} succeeded but returned no video_url`);
      return { videoUrl, requestId: taskId, rawResponse: task };
    } catch (error) {
      lastError = error;
      if (isNonRetryableSeedanceError(error) || attempt >= args.attempts) break;
      const backoff = 5_000 * attempt;
      console.error(`Attempt ${attempt}/${args.attempts} failed: ${formatError(error)}. Retrying in ${backoff}ms.`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

async function createSeedanceTask(body, env) {
  const response = await fetch(SEEDANCE_API_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.arkApiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`BytePlus create task failed status=${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  }
  if (!data?.id) throw new Error(`BytePlus create task returned no id: ${JSON.stringify(data)}`);
  return data.id;
}

async function pollSeedanceTask(taskId, env) {
  const deadline = Date.now() + TASK_POLL_TIMEOUT_MS;
  let interval = TASK_POLL_INITIAL_INTERVAL_MS;

  while (Date.now() < deadline) {
    await sleep(interval);
    let response;
    let data;
    try {
      response = await fetch(`${SEEDANCE_API_BASE}/${encodeURIComponent(taskId)}`, {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.arkApiKey}`,
        },
      });
      data = await response.json();
    } catch (error) {
      console.error(`BytePlus poll error for ${taskId}, will retry: ${formatError(error)}`);
      interval = Math.min(interval * 1.5, TASK_POLL_MAX_INTERVAL_MS);
      continue;
    }

    if (!response.ok) {
      console.error(`BytePlus poll HTTP ${response.status} for ${taskId}: ${JSON.stringify(data).slice(0, 500)}`);
      interval = Math.min(interval * 1.5, TASK_POLL_MAX_INTERVAL_MS);
      continue;
    }

    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'cancelled') {
      throw new Error(`BytePlus task ${taskId} ${data.status}: ${data.error?.message || JSON.stringify(data.error || {})}`);
    }
    interval = Math.min(interval * 1.5, TASK_POLL_MAX_INTERVAL_MS);
  }

  throw new Error(`BytePlus task ${taskId} timed out after ${TASK_POLL_TIMEOUT_MS / 1000}s`);
}

function buildSeedanceContent(prompt, images, videos, audios, model) {
  const isV2 = model.includes('seedance-2');
  const content = [{ type: 'text', text: prompt }];
  for (const url of images) {
    const item = { type: 'image_url', image_url: { url } };
    if (isV2) item.role = 'reference_image';
    content.push(item);
  }
  for (const url of videos) {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  }
  for (const url of audios) {
    content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  }
  return content;
}

function buildAnnotatedPrompt(basePrompt, imageCount, videoCount, audioCount, imageKinds) {
  const segments = [];
  const modelIndices = [];
  const productIndices = [];
  for (let i = 1; i <= imageCount; i += 1) {
    const kind = imageKinds[i - 1] || 'product_reference';
    if (kind === 'model_reference') modelIndices.push(i);
    else productIndices.push(i);
  }
  if (modelIndices.length) {
    const modelTags = modelIndices.map((i) => `@Image${i}`).join(' ');
    if (productIndices.length) {
      const productTags = productIndices.map((i) => `@Image${i}`).join(' ');
      segments.push(`${modelTags} are the model reference. ${productTags} are product references. Replace the person/model in the product references with the model shown in ${modelTags}, keeping the product unchanged.`);
    } else {
      segments.push(`${modelTags} are the model reference.`);
    }
  } else if (productIndices.length) {
    segments.push(`${productIndices.map((i) => `@Image${i}`).join(' ')} are product references.`);
  }
  if (videoCount) segments.push(`${Array.from({ length: videoCount }, (_, i) => `@Video${i + 1}`).join(' ')} are reference videos.`);
  if (audioCount) segments.push(`${Array.from({ length: audioCount }, (_, i) => `@Audio${i + 1}`).join(' ')} are reference audio.`);
  return segments.length ? `${segments.join(' ')} ${basePrompt}` : basePrompt;
}

function createCleanupTracker(env) {
  const tosKeys = new Set();
  const assetGroupIds = new Set();
  return {
    runId: `${Date.now()}-${randomId(8)}`,
    trackTosKey(key) {
      tosKeys.add(key);
    },
    trackAssetGroup(groupId) {
      assetGroupIds.add(groupId);
    },
    async cleanupAll() {
      for (const key of [...tosKeys].reverse()) {
        try {
          await deleteTosObject(key, env);
          tosKeys.delete(key);
        } catch (error) {
          console.error(`Cleanup warning: failed to delete TOS object ${key}: ${formatError(error)}`);
        }
      }
      for (const groupId of [...assetGroupIds].reverse()) {
        try {
          await deleteAssetGroup(groupId, env);
          assetGroupIds.delete(groupId);
        } catch (error) {
          console.error(`Cleanup warning: failed to delete Asset Group ${groupId}: ${formatError(error)}`);
        }
      }
    },
  };
}

function isNonRetryableSeedanceError(error) {
  const msg = formatError(error).toLowerCase();
  return msg.includes('status=401') || msg.includes('unauthorized') || msg.includes('ark_api_key');
}

function guessContentType(value) {
  const ext = extensionFromPathname(value).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
  };
  return map[ext];
}

function extensionFromPathname(value) {
  const pathname = value.split('?')[0];
  const base = pathname.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function extensionFromContentType(contentType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/gif': '.gif',
    'image/tiff': '.tiff',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
  };
  return map[normalizeContentType(contentType)] || '.bin';
}

function normalizeContentType(contentType) {
  return contentType?.split(';')[0]?.trim().toLowerCase();
}

function canonicalQueryString(query) {
  return Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
    .join('&');
}

function encodePath(key) {
  return key.split('/').map(uriEncode).join('/');
}

function uriEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function hmacHex(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function randomId(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function parseBool(value) {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
