#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mcp_server.py — Storywright 的 MCP server（stdio 传输）。

让 Claude Code / Cursor / 任何 MCP 客户端直接读写本地项目、跑一致性检查。

协议：JSON-RPC 2.0，走 stdio，每行一条消息（MCP stdio 传输规范）。
stdout 只走协议，日志一律走 stderr —— 往 stdout 打脏东西会把协议打断。

支持的方法：
    initialize / notifications/initialized / ping
    tools/list
    tools/call

工具：
    list_projects        列出本地项目
    get_project          读取项目（可按 section 取：summary/bible/episodes/shots/script）
    create_project       用标题 + 原文建一个新项目（workbench 里能直接接手）
    delete_project       删除项目
    run_continuity_check 跑内置 ShotLock 15 条规则，返回双语报告

用法：
    python3 mcp_server.py          # 走 stdio（给 MCP 客户端拉起）
    python3 mcp_server.py --selftest   # 本地自检，不进协议循环
"""

from __future__ import annotations

import json
import os
import re
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "projects")

SERVER_NAME = "storywright"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")


# ---------------------------------------------------------------- 小工具

def _safe_name(name: str) -> str:
    """项目名 -> 文件名。与 server_local.safe_name 保持一致。"""
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", (name or "").strip())
    return s[:120] or "untitled"


def _project_path(name: str) -> str:
    return os.path.join(DATA_DIR, _safe_name(name) + ".json")


def _load_project(name: str):
    path = _project_path(name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_project(proj: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    name = proj.get("name") or "untitled"
    with open(_project_path(name), "w", encoding="utf-8") as f:
        json.dump(proj, f, ensure_ascii=False)


def _all_projects():
    if not os.path.isdir(DATA_DIR):
        return []
    items = []
    for fn in os.listdir(DATA_DIR):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(DATA_DIR, fn)
        try:
            with open(path, encoding="utf-8") as f:
                proj = json.load(f)
        except Exception:
            proj = {}
        shots = proj.get("shots") or {}
        bible = proj.get("bible") or {}
        items.append({
            "name": proj.get("name") or fn[:-5],
            "title": proj.get("title") or proj.get("name") or fn[:-5],
            "episodes": len(proj.get("episodes") or []),
            "shots": sum(len(v or []) for v in shots.values()),
            "characters": len(bible.get("characters") or []),
            "has_bible": bool(bible.get("characters")),
            "updated": int(os.path.getmtime(path) * 1000) if os.path.exists(path) else 0,
        })
    items.sort(key=lambda x: x["updated"], reverse=True)
    return items


def _summary(proj: dict) -> dict:
    shots = proj.get("shots") or {}
    bible = proj.get("bible") or {}
    script = proj.get("script") or {}
    return {
        "name": proj.get("name") or "",
        "title": proj.get("title") or proj.get("name") or "",
        "step": proj.get("step", 1),
        "characters": len(bible.get("characters") or []),
        "scenes": len(bible.get("scenes") or []),
        "episodes": len(proj.get("episodes") or []),
        "shots": sum(len(v or []) for v in shots.values()),
        "source_chars": script.get("charCount") or 0,
        "central_ready": bool(proj.get("centralReady")),
    }


# ---------------------------------------------------------------- 工具实现

def _t_list_projects(args: dict) -> str:
    items = _all_projects()
    if not items:
        return "No local projects yet. Use create_project to import a source text."
    lines = [f"{len(items)} project(s) in {DATA_DIR}:", ""]
    for it in items:
        lines.append(
            "- %s  (episodes=%d, shots=%d, characters=%d, updated=%s)"
            % (it["name"], it["episodes"], it["shots"], it["characters"],
               time.strftime("%Y-%m-%d %H:%M", time.localtime(it["updated"] / 1000)) if it["updated"] else "-")
        )
    return "\n".join(lines)


def _t_get_project(args: dict) -> str:
    name = (args.get("name") or "").strip()
    if not name:
        return "Error: 'name' is required."
    proj = _load_project(name)
    if proj is None:
        return "Error: project '%s' does not exist." % name
    section = (args.get("section") or "summary").lower()
    if section == "summary":
        return json.dumps(_summary(proj), ensure_ascii=False, indent=2)
    if section == "all":
        return json.dumps(proj, ensure_ascii=False, indent=2)
    if section == "bible":
        out = {
            "world": proj.get("bible", {}).get("world", {}),
            "characters": proj.get("bible", {}).get("characters", []),
            "scenes": proj.get("bible", {}).get("scenes", []),
            "outline": proj.get("bible", {}).get("outline", []),
        }
        return json.dumps(out, ensure_ascii=False, indent=2)
    if section == "episodes":
        eps = proj.get("episodes") or []
        out = [{
            "index": i, "id": e.get("id"), "title": e.get("title"),
            "summary": e.get("summary"), "seconds": e.get("seconds"),
            "chars": e.get("chars"),
            "event_card": e.get("eventCard"),
        } for i, e in enumerate(eps)]
        return json.dumps(out, ensure_ascii=False, indent=2)
    if section == "shots":
        out = {}
        for ep_id, shots in (proj.get("shots") or {}).items():
            out[ep_id] = [{
                "index": i, "scene": s.get("scene"), "chars": s.get("chars"),
                "action": s.get("action"), "dialogue": s.get("dialogue"),
                "size": s.get("size"), "camera": s.get("camera"),
                "mood": s.get("mood"), "dur": s.get("dur"),
            } for i, s in enumerate(shots or [])]
        return json.dumps(out, ensure_ascii=False, indent=2)
    if section == "script":
        script = proj.get("script") or {}
        return json.dumps({
            "title": script.get("title"),
            "char_count": script.get("charCount"),
            "raw": script.get("raw", ""),
        }, ensure_ascii=False, indent=2)
    return "Error: unknown section '%s'. Use summary / bible / episodes / shots / script / all." % section


def _t_create_project(args: dict) -> str:
    name = (args.get("name") or args.get("title") or "").strip()
    text = args.get("text") or args.get("raw") or ""
    if not name:
        return "Error: 'name' is required."
    if not text.strip():
        return "Error: 'text' is required (the source novel passage)."
    if _load_project(name) is not None:
        return "Error: project '%s' already exists. Delete it first or pick another name." % name
    now = int(time.time() * 1000)
    title = (args.get("title") or name).strip()
    proj = {
        "name": name,
        "title": title,
        "step": 1,
        "stepMigrated": True,
        "createdAt": now,
        "updatedAt": now,
        "script": {
            "raw": text,
            "charCount": len(re.sub(r"\s", "", text)),
            "title": title,
        },
        "segConfig": {},
        "shotDur": 5,
        "curEp": 0,
        "centralReady": False,
        "centralMode": "llm",
        "episodes": [],
        "shots": {},
        "bible": {"world": {}, "characters": [], "scenes": [], "outline": []},
        "styleCard": None,
        "audit": {"lastRun": 0, "ruleVerdicts": {}, "ruleEvidence": {}, "ignoredKeys": []},
    }
    _save_project(proj)
    return ("Created project '%s' (%d characters of source text). Open it in the "
            "Storywright workbench to build the story core, episodes and shots."
            % (name, proj["script"]["charCount"]))


def _t_delete_project(args: dict) -> str:
    name = (args.get("name") or "").strip()
    if not name:
        return "Error: 'name' is required."
    path = _project_path(name)
    if not os.path.exists(path):
        return "Error: project '%s' does not exist." % name
    os.remove(path)
    return "Deleted project '%s'." % name


def _t_run_continuity_check(args: dict) -> str:
    name = (args.get("name") or "").strip()
    if not name:
        return "Error: 'name' is required."
    proj = _load_project(name)
    if proj is None:
        return "Error: project '%s' does not exist." % name
    if not (proj.get("episodes") or proj.get("shots")):
        return ("Project '%s' has no shot script yet — run the shot stage in the "
                "workbench first, then check again." % name)
    lang = (args.get("lang") or "zh").lower()
    if lang not in ("zh", "en"):
        lang = "zh"
    from continuity_report import build_report, render_html
    rpt = build_report(proj, lang=lang)
    if args.get("format") == "html":
        return render_html(rpt)
    counts = rpt.get("counts_by_level") or {}
    lines = [
        "Continuity report — %s" % (rpt.get("title") or name),
        "Verdict: %s" % rpt.get("verdict"),
        "Blocker %d / Serious %d / Suggestion %d  (shots=%d, characters=%d, scenes=%d)"
        % (counts.get("P0", 0), counts.get("P1", 0), counts.get("P2", 0),
           rpt.get("shot_count", 0), rpt.get("character_count", 0), rpt.get("scene_count", 0)),
        "",
    ]
    if not rpt.get("issues"):
        lines.append("No issues found.")
    for it in rpt.get("issues") or []:
        lines.append("[%s] %s %s | %s" % (it["level"], it["rule_id"], it["rule_name"], it["message"]))
        if it.get("hint"):
            lines.append("      → %s" % it["hint"])
    gaps = rpt.get("data_gaps") or []
    if gaps:
        lines.append("")
        lines.append("Coverage notes:")
        for g in gaps:
            lines.append("- %s" % g)
    return "\n".join(lines)


# ---------------------------------------------------------------- 工具清单

TOOLS = [
    {
        "name": "list_projects",
        "description": "List every local Storywright project with episode/shot counts.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "_fn": _t_list_projects,
    },
    {
        "name": "get_project",
        "description": ("Read a project. section=summary|bible|episodes|shots|script|all "
                        "(default: summary)."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name."},
                "section": {"type": "string",
                            "description": "Which part to read. Default summary."},
            },
            "required": ["name"],
        },
        "_fn": _t_get_project,
    },
    {
        "name": "create_project",
        "description": ("Create a project from a source passage so it can be opened in the "
                        "Storywright workbench."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name (also the file name)."},
                "title": {"type": "string", "description": "Display title."},
                "text": {"type": "string", "description": "The source novel passage."},
            },
            "required": ["name", "text"],
        },
        "_fn": _t_create_project,
    },
    {
        "name": "delete_project",
        "description": "Delete a local project. Irreversible.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
        "_fn": _t_delete_project,
    },
    {
        "name": "run_continuity_check",
        "description": ("Run the 15 built-in ShotLock consistency rules over a project's shot "
                        "script and report axis crossings, speech-rate overloads, appearance "
                        "drift and scene-lighting conflicts."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name."},
                "lang": {"type": "string", "description": "zh (default) or en."},
                "format": {"type": "string", "description": "text (default) or html."},
            },
            "required": ["name"],
        },
        "_fn": _t_run_continuity_check,
    },
]


# ---------------------------------------------------------------- JSON-RPC

def _result(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _error(req_id, code, message):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def handle(req: dict):
    method = req.get("method")
    req_id = req.get("id")
    params = req.get("params") or {}

    if method == "initialize":
        want = params.get("protocolVersion")
        version = want if want in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
        return _result(req_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })
    if method in ("notifications/initialized", "initialized"):
        return None
    if method == "ping":
        return _result(req_id, {})
    if method == "tools/list":
        return _result(req_id, {"tools": [
            {k: v for k, v in t.items() if k != "_fn"} for t in TOOLS
        ]})
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        tool = next((t for t in TOOLS if t["name"] == name), None)
        if tool is None:
            return _result(req_id, {
                "content": [{"type": "text", "text": "Unknown tool: %s" % name}],
                "isError": True,
            })
        try:
            text = tool["_fn"](args)
            is_error = text.startswith("Error:")
        except Exception as exc:  # 工具崩了也要回一条合法响应，不能把客户端挂死
            text = "Error: %s" % exc
            is_error = True
        return _result(req_id, {
            "content": [{"type": "text", "text": text}],
            "isError": is_error,
        })
    if method in ("resources/list", "prompts/list"):
        key = method.split("/")[0]
        return _result(req_id, {key: []})
    if req_id is None:
        return None
    return _error(req_id, -32601, "Method not found: %s" % method)


def serve_stdio():
    """stdio 主循环：每行一条 JSON-RPC 消息。"""
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as exc:
            out.write(json.dumps(_error(None, -32700, "Parse error: %s" % exc),
                                 ensure_ascii=False) + "\n")
            out.flush()
            continue
        try:
            resp = handle(req)
        except Exception as exc:
            resp = _error(req.get("id"), -32603, "Internal error: %s" % exc)
        if resp is not None:
            out.write(json.dumps(resp, ensure_ascii=False) + "\n")
            out.flush()


# ---------------------------------------------------------------- 自检

def _selftest():
    os.makedirs(DATA_DIR, exist_ok=True)
    test_name = "__mcp_selftest__"
    path = _project_path(test_name)
    print("data dir:", DATA_DIR)
    print("list_projects ->", _t_list_projects({})[:120])
    print("create ->", _t_create_project({
        "name": test_name, "title": "Self Test",
        "text": "The bells ring noon. Chen Feng folds the letter twice." * 3,
    }))
    print("get(summary) ->", _t_get_project({"name": test_name})[:200])
    print("continuity ->", _t_run_continuity_check({"name": test_name, "lang": "en"})[:200])
    # 协议层：initialize / tools/list / tools/call
    r1 = handle({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                 "params": {"protocolVersion": "2024-11-05"}})
    print("initialize ->", r1["result"]["protocolVersion"], r1["result"]["serverInfo"])
    r2 = handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    print("tools/list ->", [t["name"] for t in r2["result"]["tools"]])
    r3 = handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                 "params": {"name": "run_continuity_check", "arguments": {"name": test_name, "lang": "en"}}})
    print("tools/call ->", r3["result"]["content"][0]["text"][:160].replace("\n", " | "))
    r4 = handle({"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                 "params": {"name": "nope", "arguments": {}}})
    print("unknown tool -> isError =", r4["result"].get("isError"))
    print("delete ->", _t_delete_project({"name": test_name}))
    if os.path.exists(path):
        os.remove(path)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        serve_stdio()
