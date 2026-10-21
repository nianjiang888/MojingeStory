# Storywright

A local, precision scriptwriting workbench that weaves novels into short-form dramas. Import the source text, run it through five craft stages — story core, episode outline, adapted screenplay, shot script — and edit at every step. This is not a one-click toy; it is a workbench where you stay in control.

Your novels and scripts never leave your machine. The AI runs behind your own API key.

## What it does

A five-stage pipeline. Every stage's output is editable and reversible:

1. **Import** — paste or upload the full novel text; reading windows are split automatically.
2. **Story Core** — reads the whole text and distills character cards, scene cards, and a relationship web, the anchor for everything that follows.
3. **Episode Outline** — splits episodes off the core and locks down what each episode is about and where the hook lands.
4. **Adapted Screenplay** — rewrites episode by episode; characters and scenes are forced to reference the core entities, never invented on the spot.
5. **Shot Script** — every shot carries shot size, duration, characters, dialogue, screen-left/right position, and production-ready image prompts.

Finished screenplays and shot lists are stored locally under `data/projects/*.json` and exported as an asset-pack Markdown you can take to Jimeng, Kling, Midjourney for images, and to your dubbing/subtitle pipeline by the table.

The interface is bilingual (English / 中文); the screenshots below show one locale.

## Quick start

Requires Python 3.10+ and 4 GB RAM. **No GPU needed** — the AI does not run on your machine; it runs behind your own key.

```bash
# 1. Install dependencies (just Flask)
pip install -r requirements.txt

# 2. Point it at your own LLM key (any OpenAI-compatible endpoint)
export STORYWRIGHT_API_KEY=sk-xxxx
export STORYWRIGHT_BASE_URL=https://api.deepseek.com/v1   # optional, defaults to OpenAI
export STORYWRIGHT_MODEL=deepseek-chat                    # optional

# 3. Launch, then open http://127.0.0.1:5178 in your browser
python3 server_local.py
```

On Windows PowerShell use `$env:STORYWRIGHT_API_KEY="sk-xxxx"` instead of `export`. DeepSeek, Zhipu GLM, and Qwen all expose OpenAI-compatible endpoints — swap `STORYWRIGHT_BASE_URL` and pay the model vendor directly for tokens.

## Manage your expectations (read this before installing)

1. **You bring your own LLM key**, and you pay for tokens. Without a key you can only browse the UI; generation stays disabled.
2. **Quality depends on the model you pick.** A DeepSeek scene and a GPT-4 scene are not the same level. We do not choose for you, and we do not sugarcoat it.
3. **The local edition stops at "shootable screenplay."** Image generation, dubbing, and final compositing are outside this pipeline.
4. **QC rules depend on complete fields.** A shot that never recorded its screen-left/right position will make the axis-crossing check come back empty — it reports honestly, it does not magic-fix.
5. **Issue response is not guaranteed.** This is an open-source release of a tool we run in production, not a commercial product.
6. **The front end is a single ~620k-character file.** It looks acceptable; we have not split it yet. Use first, split later.

## Relationship with Mojinge and ShotLock

Three names, one line, each owning a segment:

- **Storywright (this repo)** — the local open-source edition. Bring your own key, data never leaves the machine.
- **ShotLock** — the shot-script continuity checker. 15 rules covering axis crossing, speech-rate overload, and character drift. MIT, at `github.com/nianjiang888/shotlock`.
- **Mojinge (墨金格)** — the cloud-hosted edition at mojinge.cloud. No key to configure, no environment to install, ships a template library and viral-template skills, pay-per-use with failed-generation refunds and a free quota. For people who do not want to tinker.

The local and cloud editions run the same pipeline; the only difference is "build it yourself" versus "someone serves it to you."

## Project layout

```
main.py            Deploy entrypoint (reads $PORT, binds 0.0.0.0); imports server_local.app
server_local.py    Flask app: serves index.html + workbench.html and the /api/* backend
workbench.html     The single-file workbench UI (all six steps + story core)
index.html         Bilingual landing / splash page
i18n.js            Translation dictionary and runtime (English / 中文)
common.js          Shared frontend helpers (API client, language toggle, modals)
.env.example       Template for the LLM key / endpoint / model env vars
requirements.txt   Flask only
data/              Local project storage (created at runtime; not committed)
```

## License

MIT. Use it, modify it, credit or not — your call.

## Roadmap

- [x] English README and docs
- [ ] Built-in ShotLock QC step (run the 15 rules automatically after stage 5)
- [ ] MCP server: let Claude Code / Cursor call the "story core" and "shot script" tools directly
- [ ] Front-end modularization (split the single-file workbench)
