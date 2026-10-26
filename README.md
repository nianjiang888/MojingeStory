# MojingeStory · 墨金格开源剧本台

A local, precision scriptwriting workbench that weaves novels into short-form dramas. Import the source text, run it through five craft stages — story core, episode outline, adapted screenplay, shot script — and edit at every step. This is not a one-click toy; it is a workbench where you stay in control.

Your novels and scripts never leave your machine. The AI runs behind your own API key.

> 中文名：**墨金格开源剧本台**。本仓库是「墨金格」母品牌旗下的开源剧本工作台，与其云端版「墨金格剧本大师」同源，区别只是「自己搭」还是「有人伺候」。

## What it does

A five-stage pipeline. Every stage's output is editable and reversible:

1. **Import** — paste or upload the full novel text; reading windows are split automatically.
2. **Story Core** — reads the whole text and distills character cards, scene cards, and a relationship web, the anchor for everything that follows.
3. **Episode Outline** — splits episodes off the core and locks down what each episode is about and where the hook lands.
4. **Adapted Screenplay** — rewrites episode by episode; characters and scenes are forced to reference the core entities, never invented on the spot.
5. **Shot Script** — every shot carries shot size, duration, characters, dialogue, screen-left/right position, and production-ready image prompts. A built-in **continuity check** runs the 15 ShotLock rules over the finished shot list and reports axis crossings, speech-rate overloads, appearance drift, and scene-lighting conflicts, down to the shot.

Finished screenplays and shot lists are stored locally under `data/projects/*.json` and exported as an asset-pack Markdown you can take to Jimeng, Kling, Midjourney for images, and to your dubbing/subtitle pipeline by the table.

The interface is bilingual (English / 中文); the screenshots below show one locale.

## Quick start

Requires Python 3.10+ and 4 GB RAM. **No GPU needed** — the AI does not run on your machine; it runs behind your own key.

```bash
# 1. Install dependencies (just Flask)
pip install -r requirements.txt

# 2. Point it at your own LLM key (any OpenAI-compatible endpoint)
export MOJINGESTORY_API_KEY=sk-xxxx
export MOJINGESTORY_BASE_URL=https://api.deepseek.com/v1   # optional, defaults to OpenAI
export MOJINGESTORY_MODEL=deepseek-chat                    # optional

# 3. Launch, then open http://127.0.0.1:5178 in your browser
python3 server_local.py
```

On Windows PowerShell use `$env:MOJINGESTORY_API_KEY="sk-xxxx"` instead of `export`. DeepSeek, Zhipu GLM, and Qwen all expose OpenAI-compatible endpoints — swap `MOJINGESTORY_BASE_URL` and pay the model vendor directly for tokens.

> 兼容说明：旧环境变量名 `STORYWRIGHT_API_KEY` / `STORYWRIGHT_BASE_URL` / `STORYWRIGHT_MODEL` 仍可识别（代码做了 fallback），但新装请使用 `MOJINGESTORY_*`。

## Manage your expectations (read this before installing)

1. **You bring your own LLM key**, and you pay for tokens. Without a key you can only browse the UI; generation stays disabled.
2. **Quality depends on the model you pick.** A DeepSeek scene and a GPT-4 scene are not the same level. We do not choose for you, and we do not sugarcoat it.
3. **The local edition stops at "shootable screenplay."** Image generation, dubbing, and final compositing are outside this pipeline.
4. **QC rules depend on complete fields.** A shot that never recorded its screen-left/right position will make the axis-crossing check come back empty — it reports honestly, it does not magic-fix.
5. **Issue response is not guaranteed.** This is an open-source release of a tool we run in production, not a commercial product.
6. **The front end is a single ~620k-character file.** It looks acceptable; we have not split it yet. Use first, split later.

## Relationship with 墨金格剧本大师 and ShotLock

Three names, one line, each owning a segment:

- **MojingeStory (this repo, 墨金格开源剧本台)** — the local open-source edition. Bring your own key, data never leaves the machine.
- **ShotLock** — the shot-script continuity checker. 15 rules covering axis crossing, speech-rate overload, and character drift. MIT, at `github.com/nianjiang888/shotlock`. Its engine is **bundled in this repo** under `shotlock/`, so the continuity check runs offline with no extra install.
- **墨金格剧本大师 (MojingeStory Cloud)** — the cloud-hosted edition, run by the same team. No key to configure, no environment to install, ships a template library and viral-template skills, pay-per-use with failed-generation refunds and a free quota. For people who do not want to tinker.

The local and cloud editions run the same pipeline; the only difference is "build it yourself" versus "someone serves it to you."

## MCP server

`mcp_server.py` speaks MCP over stdio, so any MCP client (Claude Code, Cursor, or your own agent) can drive the workbench. No SDK, no dependencies — just JSON-RPC 2.0.

```bash
python3 mcp_server.py          # stdio transport
python3 mcp_server.py --selftest   # local self-check, no client needed
```

Client config (Claude Desktop / Cursor, adjust the paths):

```json
{
  "mcpServers": {
    "mojingestory": {
      "command": "python3",
      "args": ["/absolute/path/to/MojingeStory/mcp_server.py"]
    }
  }
}
```

> 注：MCP server 内部标识（server name、localStorage 键、全局变量）沿用小写 `storywright` 作为工程标识，不破坏你已有的本地数据与 MCP 客户端配置；对外产品名统一为 MojingeStory。

Tools it exposes:

| Tool | What it does |
| --- | --- |
| `list_projects` | Every local project with episode/shot/character counts |
| `get_project` | Read a project — `section`: `summary` / `bible` / `episodes` / `shots` / `script` / `all` |
| `create_project` | Import a source passage as a new project the workbench can open |
| `delete_project` | Remove a project (irreversible) |
| `run_continuity_check` | Run the 15 ShotLock rules over a shot script; `lang=zh\|en`, `format=text\|html` |

## Project layout

```
main.py            Deploy entrypoint (reads $PORT, binds 0.0.0.0); imports server_local.app
server_local.py    Flask app: serves index.html + workbench.html and the /api/* backend
mcp_server.py      MCP server over stdio (JSON-RPC 2.0, no SDK required)
workbench.html     The single-file workbench UI (all six steps + story core)
index.html         Bilingual landing / splash page
i18n.js            Translation dictionary and runtime (English / 中文)
common.js          Shared frontend helpers (API client, language toggle, modals)
continuity.py      Maps a project onto the ShotLock spec and calls the engine
continuity_report.py  Bilingual report layer (framework + per-issue wording)
shotlock/          Bundled ShotLock engine (MIT) — the 15 consistency rules
.env.example       Template for the LLM key / endpoint / model env vars
requirements.txt   Flask only
data/              Local project storage (created at runtime; not committed)
```

## License

MIT. Use it, modify it, credit or not — your call.

## Roadmap

- [x] English + 中文 README and docs
- [x] Built-in ShotLock QC step (run the 15 rules automatically after stage 5)
- [x] MCP server: let Claude Code / Cursor call the "story core" and "shot script" tools directly
- [ ] Front-end modularization (split the single-file workbench)
