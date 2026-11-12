# manim-worker

Renders one Manim scene (Python) to MP4, and joins MP4s. Used by the API's
`VideosService` through `@octonote/manim`'s `workerRenderer`.

It **holds no secrets and calls no AI**: the API writes and repairs the code and
stores the result. Each render: static checks (`worker/check.py`: allowed
imports only; no dunders, eval/open/getattr, file-reading Manim or numpy APIs),
then `manim` in a fresh temp dir as the unprivileged `render` user, with an
empty environment, CPU/memory/file-size/process limits and a timeout.

```bash
docker build -t octonote-manim-worker:dev services/manim-worker
docker run -d --name octonote-manim-worker -p 127.0.0.1:8090:8090 \
  -e WORKER_TOKEN=local-dev-token --memory 4g --cpus 2 --pids-limit 512 octonote-manim-worker:dev
# API: MANIM_WORKER_URL=http://127.0.0.1:8090 MANIM_WORKER_TOKEN=local-dev-token (+ ANTHROPIC_API_KEY)
```

Image ≈ 2.2 GB (texlive-latex-extra is most of it; Manim's default TeX template needs `standalone`).
Before production: run it where outbound network can be blocked (e.g. Modal, or a
container with no egress); the code checks are a layer, not the boundary.
