# Znith Desktop v0.3 — Hybrid AI pipeline (development)

The desktop canvas stays local-first. New nodes default to their real local provider, and mock sample output must be selected explicitly in the node inspector.

## What works in this branch

- Ollama JSON generation for Outline, Script, Character Bible and Storyboard nodes.
- Optional OpenAI-compatible cloud LLM via main-process environment variable.
- Manual Approval Gate: select its node after the run pauses, then Approve or Reject.
- ComfyUI API workflow templates for image/video nodes. Images must be PNG; videos must be MP4.
- Per-shot generated file artifacts with SHA-256 checksums and relative project paths.
- Collect Clips orders actual videos by shot index.
- FFmpeg exports an H.264 MP4 from actual clips. It needs ffmpeg on PATH or ZNITH_FFMPEG_PATH.
- Persistent SQLite execution history; interrupted *real* provider nodes are marked FAILED, never blindly resubmitted.

## Getting started

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

### Real text output through Ollama

1. Install Ollama, run `ollama serve`, and pull a suitable model (e.g. `ollama pull qwen2.5:7b`).
2. Add a Text Prompt and connect it to an Outline, Script, Characters, or Storyboard node.
3. The AI node is set to Ollama by default. Set **Model** to a locally installed model name in its inspector.
4. Save the graph, then run. Output JSON will be validated for minimal schema requirements.

These prompts are **Znith compatibility adapters**, not a completed execution of every original upstream `shuohao-skills` shell script or quality gate. Full upstream script integration and validation remain outstanding.

### Cloud LLM (optional)

Set `ZNITH_CLOUD_LLM_API_KEY` in the Electron main process environment. On a skill node select Cloud LLM and a compatible model. Nothing is automatically uploaded to the cloud when mock/Ollama is selected.

### ComfyUI image/video

1. Install and start ComfyUI on local loopback.
2. Export a model-specific **API Format** workflow JSON from ComfyUI (not the editor UI JSON).
3. For an Image Generator or Video Generator node choose ComfyUI and paste the API JSON.
4. Replace the text input in the API graph with `$ZNITH_PROMPT`. For video image-to-video workflows, replace the LoadImage filename with `$ZNITH_INPUT_IMAGE`.
5. Build a full graph including `Batch Shots → Image → Video → Collect Clips → Film Export`; select FFmpeg mode on Film Export.
6. Make sure the Comfy workflow uses SaveImage PNG or an MP4-capable video output node. Comfy custom nodes, checkpoint models and VRAM requirements depend on your workflow.

**Important:** Video generation, ComfyUI custom nodes, models and FFmpeg availability are not bundled with the app. There is no automatic model installation, native installer verification or cloud image/video provider yet. Image/video batch runs currently handle tasks sequentially.

### Safety

- Only localhost HTTP endpoints are accepted for local AI clients.
- Cloud mode requires an explicit node setting and API key; secrets stay outside the graph.
- No untrusted skill shell commands are executed by Znith.
- An interrupted real provider job is not replayed without manual retry to avoid duplicate generation.
- A model-specific ComfyUI JSON template is needed because there is no universal image/video workflow.

## Upstream references

- https://github.com/eternityspring/shuohao-skills — source skills and quality gates. Znith currently ships its **own minimal structured prompts**, not the upstream scripts.
- https://github.com/eternityspring/reelbench-skills — analysis, video sync and metadata scrub tools; **not yet executed** by this branch.

## Development status

This branch is an incremental implementation, **not a fully finished AI filmmaking app**. Run the GitHub Actions CI and test with actual Ollama/ComfyUI models and FFmpeg on the target OS before claiming production readiness.
