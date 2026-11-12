# Manim render worker. No secrets live here; see worker/app.py.
FROM python:3.11-slim

# Cairo/Pango for Manim's text, ffmpeg for video, and the LaTeX packages
# MathTex needs (standalone + amsmath). latex-extra is the big one, but
# Manim's default template needs `standalone` from it.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended \
      dvisvgm fonts-dejavu-core \
      build-essential pkg-config libcairo2-dev libpango1.0-dev python3-dev \
    && pip install --no-cache-dir "manim==0.19.0" "fastapi==0.115.6" "uvicorn==0.34.0" \
    && apt-get purge -y build-essential pkg-config libcairo2-dev libpango1.0-dev python3-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man \
       /usr/share/texlive/texmf-dist/doc /usr/share/texmf/doc

# Renders run as this unprivileged user.
RUN useradd --create-home --uid 10001 render
WORKDIR /app
COPY worker /app/worker
USER render

ENV RENDER_TIMEOUT=180 RENDER_CONCURRENCY=2 PYTHONUNBUFFERED=1
EXPOSE 8090
CMD ["uvicorn", "worker.app:app", "--host", "0.0.0.0", "--port", "8090"]
