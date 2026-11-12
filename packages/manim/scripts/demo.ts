/**
 * Generates one video end to end against Claude and the local worker.
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/manim demo "Why is the sky blue?" [portrait] [out.mp4]
 * Start the worker first: docker run -p 127.0.0.1:8090:8090 -e WORKER_TOKEN=local-dev-token octonote-manim-worker:dev
 */
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicModel } from "@octonote/compose";
import { generateVideo, workerRenderer, type Orientation } from "../src/index.js";

const [concept = "How does compound interest work?", orientation = "landscape", out = "video.mp4"] = process.argv.slice(2);
const started = Date.now();
const video = await generateVideo({
  concept,
  orientation: orientation as Orientation,
  model: anthropicModel(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }), process.env.COMPOSE_MODEL ?? "claude-opus-5-5"),
  renderer: workerRenderer(process.env.WORKER_URL ?? "http://127.0.0.1:8090", process.env.WORKER_TOKEN ?? "local-dev-token"),
  onProgress: (p) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, JSON.stringify(p)),
});
writeFileSync(out, Buffer.from(video.mp4, "base64"));
console.log(`\n${video.title}: ${video.duration.toFixed(1)}s, ${(video.bytes / 1024 / 1024).toFixed(2)} MB, ${video.chapters.length} scenes, ${video.repaired} repaired, ${video.fallbacks} title-card fallbacks, ${Math.round((Date.now() - started) / 1000)}s total`);
for (const c of video.chapters) console.log(`  ${c.start.toFixed(1).padStart(5)}s ${c.fallback ? "(fallback) " : ""}${c.title}`);
