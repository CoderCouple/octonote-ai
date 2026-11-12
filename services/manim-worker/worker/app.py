"""
Manim render worker. Turns one scene's Python into an MP4, and joins MP4s.

It holds no secrets and calls no AI: the API writes and repairs the code and
stores the result. Every render runs in a fresh temp directory as this
container's unprivileged user, with an empty environment, CPU / memory /
file-size / process limits and a timeout, after the static checks in
check.py. Requests need the shared WORKER_TOKEN.
"""

import asyncio
import base64
import os
import re
import resource
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .check import CodeRejected, check_scene_code

TOKEN = os.environ.get("WORKER_TOKEN", "")
RENDER_TIMEOUT = int(os.environ.get("RENDER_TIMEOUT", "180"))
CONCURRENCY = int(os.environ.get("RENDER_CONCURRENCY", "2"))
LIB_DIR = Path(__file__).parent

SIZES = {"landscape": "1920,1080", "portrait": "1080,1920"}

app = FastAPI(title="octonote manim worker")
slots = asyncio.Semaphore(CONCURRENCY)


def authorize(token: str | None) -> None:
    if TOKEN and token != TOKEN:
        raise HTTPException(status_code=401, detail="Bad worker token")


class RenderRequest(BaseModel):
    code: str = Field(max_length=40_000)
    scene: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
    orientation: str = Field(default="landscape", pattern=r"^(landscape|portrait)$")
    preview: bool = False


class ConcatRequest(BaseModel):
    videos: list[str] = Field(min_length=1, max_length=40)


def limits() -> None:
    """Runs in the child before exec: resource ceilings and its own session."""
    os.setsid()
    resource.setrlimit(resource.RLIMIT_CPU, (RENDER_TIMEOUT, RENDER_TIMEOUT))
    resource.setrlimit(resource.RLIMIT_AS, (3 * 1024**3, 3 * 1024**3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (300 * 1024**2, 300 * 1024**2))
    resource.setrlimit(resource.RLIMIT_NPROC, (256, 256))


ERROR_PATTERNS = [
    (r"NameError: name '(\w+)' is not defined", "undefined name"),
    (r"AttributeError: .*", "attribute error"),
    (r"TypeError: .*", "type error"),
    (r"ValueError: .*", "value error"),
    (r"IndexError: .*", "index error"),
    (r"LaTeX compilation error|latex error|! LaTeX Error", "LaTeX error"),
    (r"ZeroDivisionError", "division by zero"),
]


def classify(stderr: str) -> str:
    for pattern, label in ERROR_PATTERNS:
        if re.search(pattern, stderr, re.IGNORECASE):
            return label
    return "render error"


def tail(text: str, lines: int = 40) -> str:
    """The end of a traceback, with the temp paths shortened so the model sees its own line numbers."""
    text = re.sub(r'File "[^"]*scene\.py"', 'File "scene.py"', text)
    return "\n".join(text.strip().splitlines()[-lines:])


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def render_sync(req: RenderRequest) -> dict:
    try:
        check_scene_code(req.code, req.scene)
    except CodeRejected as error:
        return {"ok": False, "stage": "check", "error": str(error), "detail": str(error)}

    work = Path(tempfile.mkdtemp(prefix="render-"))
    try:
        (work / "scene.py").write_text(req.code)
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(work),
            "PYTHONPATH": str(LIB_DIR),
            "MPLCONFIGDIR": str(work / ".mpl"),
            "OCTO_ORIENTATION": req.orientation,
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        quality = "-ql" if req.preview else "-qm"
        command = [
            "python", "-m", "manim", "render", quality, "--fps", "30", "--resolution", SIZES[req.orientation],
            "--disable_caching", "--progress_bar", "none", "--media_dir", str(work / "media"), "scene.py", req.scene,
        ]
        try:
            run = subprocess.run(command, cwd=work, env=env, capture_output=True, text=True, timeout=RENDER_TIMEOUT, preexec_fn=limits)
        except subprocess.TimeoutExpired:
            return {"ok": False, "stage": "timeout", "error": f"Rendering took longer than {RENDER_TIMEOUT}s", "detail": "Use fewer and shorter animations."}
        videos = list((work / "media").rglob(f"{req.scene}.mp4"))
        if run.returncode != 0 or not videos:
            detail = tail(run.stderr or run.stdout)
            return {"ok": False, "stage": "render", "error": classify(detail), "detail": detail}
        video = videos[0]
        return {
            "ok": True,
            "duration": probe_duration(video),
            "bytes": video.stat().st_size,
            "mp4": base64.b64encode(video.read_bytes()).decode(),
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


def concat_sync(req: ConcatRequest) -> dict:
    work = Path(tempfile.mkdtemp(prefix="concat-"))
    try:
        listing = []
        for i, data in enumerate(req.videos):
            part = work / f"part{i:03d}.mp4"
            part.write_bytes(base64.b64decode(data))
            listing.append(f"file '{part.name}'")
        (work / "list.txt").write_text("\n".join(listing))
        out = work / "video.mp4"
        # Re-encode so parts with slightly different settings still join cleanly.
        run = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "video.mp4"],
            cwd=work, capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            return {"ok": False, "error": tail(run.stderr)}
        poster = work / "poster.jpg"
        subprocess.run(["ffmpeg", "-y", "-ss", "1", "-i", "video.mp4", "-frames:v", "1", "-q:v", "4", "poster.jpg"], cwd=work, capture_output=True, timeout=60)
        return {
            "ok": True,
            "duration": probe_duration(out),
            "bytes": out.stat().st_size,
            "mp4": base64.b64encode(out.read_bytes()).decode(),
            "poster": base64.b64encode(poster.read_bytes()).decode() if poster.exists() else None,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/render")
async def render(req: RenderRequest, x_worker_token: str | None = Header(default=None)) -> dict:
    authorize(x_worker_token)
    async with slots:
        return await asyncio.to_thread(render_sync, req)


@app.post("/concat")
async def concat(req: ConcatRequest, x_worker_token: str | None = Header(default=None)) -> dict:
    authorize(x_worker_token)
    async with slots:
        return await asyncio.to_thread(concat_sync, req)
