#!/usr/bin/env python3
"""Create, query, wait for, list, and download MiniMax-H3 video tasks."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_API_BASE = "https://api.minimax.io"
KEY_ENV = "MINIMAX_API_KEY_INTER"
MAX_BODY_BYTES = 64 * 1024 * 1024
MAX_PROMPT_CHARACTERS = 7000
MAX_FILE_BYTES = {
    "image": 30 * 1024 * 1024,
    "video": 50 * 1024 * 1024,
    "audio": 15 * 1024 * 1024,
}
MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
}
ALLOWED_SUFFIXES = {
    "image": {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"},
    "video": {".mp4", ".mov"},
    "audio": {".wav", ".mp3"},
}
TERMINAL_STATES = {"succeeded", "failed", "cancelled"}


class MiniMaxError(RuntimeError):
    pass


def api_key() -> str:
    value = os.environ.get(KEY_ENV, "").strip()
    if not value:
        raise MiniMaxError(
            f"{KEY_ENV} is not set. Load it into the environment without printing it."
        )
    return value


def api_base() -> str:
    return os.environ.get("MINIMAX_API_BASE", DEFAULT_API_BASE).rstrip("/")


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def parse_json_bytes(raw: bytes) -> Any:
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


def request_json(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    retries: int = 0,
) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": f"Bearer {api_key()}"}
    if body is not None:
        headers["Content-Type"] = "application/json"

    for attempt in range(retries + 1):
        req = Request(api_base() + path, data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=120) as response:
                return parse_json_bytes(response.read())
        except HTTPError as exc:
            details = parse_json_bytes(exc.read())
            retryable = exc.code == 429 or exc.code >= 500
            if retryable and attempt < retries:
                time.sleep(min(2 ** (attempt + 1), 10))
                continue
            raise MiniMaxError(
                f"MiniMax HTTP {exc.code}: {json.dumps(details, ensure_ascii=False)}"
            ) from None
        except URLError as exc:
            if attempt < retries:
                time.sleep(min(2 ** (attempt + 1), 10))
                continue
            raise MiniMaxError(f"MiniMax network error: {exc.reason}") from None

    raise MiniMaxError("MiniMax request failed")


def is_remote(value: str) -> bool:
    return value.startswith(("https://", "http://", "data:", "asset://"))


def media_url(value: str, kind: str) -> tuple[str, dict[str, Any]]:
    if is_remote(value):
        return value, {"kind": kind, "source": value, "encoding": "url"}

    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise MiniMaxError(f"{kind} file does not exist: {path}")
    suffix = path.suffix.lower()
    if suffix not in ALLOWED_SUFFIXES[kind]:
        allowed = ", ".join(sorted(ALLOWED_SUFFIXES[kind]))
        raise MiniMaxError(f"Unsupported {kind} extension {suffix}; expected one of {allowed}")
    size = path.stat().st_size
    if size > MAX_FILE_BYTES[kind]:
        raise MiniMaxError(
            f"{kind} file is too large ({size} bytes): {path}. Use a public HTTPS URL."
        )
    mime = MIME_BY_SUFFIX.get(suffix) or mimetypes.guess_type(path.name)[0]
    if not mime:
        raise MiniMaxError(f"Could not determine MIME type for {path}")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return (
        f"data:{mime};base64,{encoded}",
        {"kind": kind, "source": str(path), "bytes": size, "encoding": "data_url"},
    )


def read_prompt(args: argparse.Namespace) -> str:
    if args.prompt is not None:
        prompt = args.prompt
    else:
        prompt = Path(args.prompt_file).expanduser().read_text(encoding="utf-8")
    prompt = prompt.strip()
    if not prompt:
        raise MiniMaxError("Prompt must not be empty")
    if len(prompt) > MAX_PROMPT_CHARACTERS:
        raise MiniMaxError(
            f"Prompt is too long ({len(prompt)} characters); "
            f"the MiniMax hosted API limit is {MAX_PROMPT_CHARACTERS}."
        )
    return prompt


def add_media(
    content: list[dict[str, Any]],
    manifest: list[dict[str, Any]],
    values: list[str],
    kind: str,
    role: str,
) -> None:
    field = f"{kind}_url"
    for value in values:
        url, item = media_url(value, kind)
        content.append({"type": field, field: {"url": url}, "role": role})
        item["role"] = role
        manifest.append(item)


def build_create_payload(args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    refs_present = bool(args.image or args.video or args.audio)
    frames_present = bool(args.first_frame or args.last_frame)
    if refs_present and frames_present:
        raise MiniMaxError("Reference media cannot be mixed with first/last frames")
    if len(args.image) > 9:
        raise MiniMaxError("At most 9 reference images are allowed")
    if len(args.video) > 3:
        raise MiniMaxError("At most 3 reference videos are allowed")
    if len(args.audio) > 3:
        raise MiniMaxError("At most 3 reference audio clips are allowed")

    prompt = read_prompt(args)
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    manifest: list[dict[str, Any]] = []

    if args.first_frame:
        add_media(content, manifest, [args.first_frame], "image", "first_frame")
    if args.last_frame:
        add_media(content, manifest, [args.last_frame], "image", "last_frame")
    add_media(content, manifest, args.image, "image", "reference_image")
    add_media(content, manifest, args.video, "video", "reference_video")
    add_media(content, manifest, args.audio, "audio", "reference_audio")

    payload: dict[str, Any] = {
        "model": "MiniMax-H3",
        "content": content,
        "resolution": args.resolution,
        "duration": args.duration,
        "ratio": args.ratio,
    }
    if args.callback_url:
        payload["callback_url"] = args.callback_url

    body_size = len(json.dumps(payload).encode("utf-8"))
    if body_size > MAX_BODY_BYTES:
        raise MiniMaxError(
            f"Estimated JSON request body is {body_size} bytes, above the 64 MB limit. "
            "Host large media at public HTTPS URLs and retry."
        )
    manifest.insert(
        0,
        {
            "kind": "text",
            "characters": len(prompt),
            "estimated_request_bytes": body_size,
        },
    )
    return payload, manifest


def command_create(args: argparse.Namespace) -> None:
    payload, manifest = build_create_payload(args)
    if args.dry_run:
        print_json(
            {
                "dry_run": True,
                "model": payload["model"],
                "resolution": payload["resolution"],
                "duration": payload["duration"],
                "ratio": payload["ratio"],
                "inputs": manifest,
            }
        )
        return
    # Never retry POST automatically: an ambiguous response may still create a paid task.
    result = request_json("POST", "/v2/video_generation", payload, retries=0)
    print_json(result)


def query_task(task_id: str) -> Any:
    return request_json("GET", f"/v2/query/video_generation/{task_id}", retries=3)


def command_query(args: argparse.Namespace) -> None:
    print_json(query_task(args.task_id))


def command_list(args: argparse.Namespace) -> None:
    params: list[tuple[str, str]] = [
        ("page_num", str(args.page_num)),
        ("page_size", str(args.page_size)),
    ]
    if args.status:
        params.append(("filter.status", args.status))
    if args.model:
        params.append(("filter.model", args.model))
    if args.task_type:
        params.append(("filter.task_type", args.task_type))
    for task_id in args.task_id:
        params.append(("filter.task_ids", task_id))
    print_json(request_json("GET", "/v2/query/video_generation?" + urlencode(params), retries=3))


def result_url(result: Any) -> str:
    task = result.get("task", {}) if isinstance(result, dict) else {}
    if task.get("status") != "succeeded":
        raise MiniMaxError(f"Task is not succeeded; current status is {task.get('status', 'unknown')}")
    url = task.get("content", {}).get("url")
    if not url:
        raise MiniMaxError("Succeeded task did not include task.content.url")
    return url


def download_file(url: str, out_value: str, force: bool) -> Path:
    out = Path(out_value).expanduser().resolve()
    if out.exists() and not force:
        raise MiniMaxError(f"Output already exists: {out}. Pass --force to replace it.")
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_name(out.name + ".part")
    req = Request(url, headers={"User-Agent": "minimax-h3-video-skill/1.0"})
    try:
        with urlopen(req, timeout=180) as response, part.open("wb") as handle:
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                handle.write(block)
        os.replace(part, out)
    except Exception:
        try:
            part.unlink()
        except FileNotFoundError:
            pass
        raise
    return out


def command_download(args: argparse.Namespace) -> None:
    if args.source.startswith(("https://", "http://")):
        url = args.source
    else:
        url = result_url(query_task(args.source))
    out = download_file(url, args.out, args.force)
    print_json({"downloaded": str(out), "bytes": out.stat().st_size})


def command_wait(args: argparse.Namespace) -> None:
    started = time.monotonic()
    last_status: str | None = None
    while True:
        result = query_task(args.task_id)
        task = result.get("task", {}) if isinstance(result, dict) else {}
        status = str(task.get("status", "unknown"))
        if status != last_status:
            print(
                json.dumps(
                    {"task_id": args.task_id, "status": status},
                    ensure_ascii=False,
                ),
                file=sys.stderr,
                flush=True,
            )
            last_status = status
        if status in TERMINAL_STATES:
            if status == "succeeded" and args.out:
                out = download_file(result_url(result), args.out, args.force)
                result["downloaded"] = str(out)
            print_json(result)
            return
        if args.timeout and time.monotonic() - started >= args.timeout:
            raise MiniMaxError(f"Timed out while task remained {status}")
        time.sleep(args.interval)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Create a paid MiniMax-H3 task")
    prompt_group = create.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="Prompt text")
    prompt_group.add_argument("--prompt-file", help="UTF-8 prompt file")
    create.add_argument("--image", action="append", default=[], help="Reference image path or URL")
    create.add_argument("--video", action="append", default=[], help="Reference video path or URL")
    create.add_argument("--audio", action="append", default=[], help="Reference audio path or URL")
    create.add_argument("--first-frame", help="First-frame image path or URL")
    create.add_argument("--last-frame", help="Last-frame image path or URL")
    create.add_argument("--resolution", required=True, choices=["768P", "2K"])
    create.add_argument("--duration", required=True, type=int, choices=range(4, 16), metavar="4..15")
    create.add_argument(
        "--ratio",
        required=True,
        choices=["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    )
    create.add_argument("--callback-url")
    create.add_argument("--dry-run", action="store_true", help="Validate and summarize without submitting")
    create.set_defaults(func=command_create)

    query = subparsers.add_parser("query", help="Query one task")
    query.add_argument("task_id")
    query.set_defaults(func=command_query)

    listing = subparsers.add_parser("list", help="List recent tasks")
    listing.add_argument("--page-num", type=int, default=1)
    listing.add_argument("--page-size", type=int, default=20)
    listing.add_argument("--status", choices=sorted(TERMINAL_STATES | {"queued", "running"}))
    listing.add_argument("--model", default="MiniMax-H3")
    listing.add_argument("--task-type", choices=["generation", "h3_context_ir", "regeneration"])
    listing.add_argument("--task-id", action="append", default=[])
    listing.set_defaults(func=command_list)

    wait = subparsers.add_parser("wait", help="Poll until a task reaches a terminal state")
    wait.add_argument("task_id")
    wait.add_argument("--interval", type=float, default=55.0)
    wait.add_argument("--timeout", type=float, default=0.0, help="Seconds; zero means no timeout")
    wait.add_argument("--out", help="Download here after success")
    wait.add_argument("--force", action="store_true")
    wait.set_defaults(func=command_wait)

    download = subparsers.add_parser("download", help="Download a succeeded task or direct URL")
    download.add_argument("source", help="Task ID or result URL")
    download.add_argument("--out", required=True)
    download.add_argument("--force", action="store_true")
    download.set_defaults(func=command_download)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "wait" and not 10 <= args.interval <= 60:
            raise MiniMaxError("--interval must be between 10 and 60 seconds")
        if args.command == "list":
            if args.page_num < 1 or not 1 <= args.page_size <= 100:
                raise MiniMaxError("page number must be >= 1 and page size must be 1..100")
        args.func(args)
        return 0
    except (MiniMaxError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
