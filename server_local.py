#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MojingeStory 本地后端 —— 模型在你自己的 key 后面，数据不出这台机器。

用法：
    # 1. 装依赖（仅 Flask 一个）
    pip install -r requirements.txt

    # 2. 配上你自己的 LLM key（OpenAI 兼容接口即可）
    #    Linux / macOS:
    export MOJINGESTORY_API_KEY=sk-xxxx
    export MOJINGESTORY_BASE_URL=https://api.deepseek.com/v1
    export MOJINGESTORY_MODEL=deepseek-chat
    #    Windows PowerShell:
    #    $env:MOJINGESTORY_API_KEY="sk-xxxx"; $env:MOJINGESTORY_BASE_URL="https://api.deepseek.com/v1"; $env:MOJINGESTORY_MODEL="deepseek-chat"
    #    旧变量名 STORYWRIGHT_API_KEY / STORYWRIGHT_BASE_URL / STORYWRIGHT_MODEL 仍兼容（代码已做 fallback）。

    # 3. 启动，浏览器打开 http://127.0.0.1:5178
    python3 server_local.py

环境变量全部可选，默认值见 env() 调用处。数据存在 ./data/projects/*.json。
"""
import gzip
import json
import os
import re
import time
import urllib.error
import urllib.request

from flask import Flask, Response, request

app = Flask(__name__, static_folder=".")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "projects")
os.makedirs(DATA_DIR, exist_ok=True)

LLM_TIMEOUT = 300  # 长文改编单次可能几分钟


def env(name, default=""):
    return os.environ.get(name, default).strip() or default


def safe_name(name):
    """项目名只允许安全字符，防路径穿越。"""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", (name or "").strip())
    return name[:120] or "未命名项目"


def json_resp(obj, status=200):
    return Response(json.dumps(obj, ensure_ascii=False), status=status,
                    mimetype="application/json; charset=utf-8")


# ---------------------------------------------------------------- 静态与状态

@app.route("/")
def index():
    with open(os.path.join(BASE_DIR, "index.html"), encoding="utf-8") as f:
        return Response(f.read(), mimetype="text/html; charset=utf-8")


@app.route("/workbench.html")
def workbench():
    with open(os.path.join(BASE_DIR, "workbench.html"), encoding="utf-8") as f:
        return Response(f.read(), mimetype="text/html; charset=utf-8")


@app.route("/common.js")
def common_js():
    with open(os.path.join(BASE_DIR, "common.js"), encoding="utf-8") as f:
        return Response(f.read(), mimetype="application/javascript; charset=utf-8")


@app.route("/i18n.js")
def i18n_js():
    with open(os.path.join(BASE_DIR, "i18n.js"), encoding="utf-8") as f:
        return Response(f.read(), mimetype="application/javascript; charset=utf-8")


# 前端模块化后，workbench.html 会从 js/ 与 css/ 目录引用拆出来的模块。
# 只放行这两个目录下的脚本/样式，路径穿越一律拒绝。
_ASSET_EXT = {".js": "application/javascript; charset=utf-8",
               ".css": "text/css; charset=utf-8"}


def _asset(folder, fn, fallback_mime):
    if not fn or ".." in fn.replace("\\", "/").split("/"):
        return Response("forbidden", status=403)
    ext = os.path.splitext(fn)[1].lower()
    mime = _ASSET_EXT.get(ext, fallback_mime)
    path = os.path.join(BASE_DIR, folder, fn.replace("\\", "/"))
    if not os.path.isfile(path):
        return Response("not found", status=404)
    with open(path, encoding="utf-8") as f:
        return Response(f.read(), mimetype=mime)


@app.route("/js/<path:fn>")
def js_asset(fn):
    return _asset("js", fn, "application/javascript; charset=utf-8")


@app.route("/css/<path:fn>")
def css_asset(fn):
    return _asset("css", fn, "text/css; charset=utf-8")


@app.route("/api/me")
def api_me():
    return json_resp({"ok": True, "email": "local@storywright",
                      "nickname": "本地创作者", "uid": "local", "avatar": "",
                      "is_admin": False, "balance": 0, "free_mode": True})


@app.route("/api/price_info")
def api_price_info():
    return json_resp({"ok": True, "free_mode": True, "prices": {}})


@app.route("/api/ping")
def api_ping():
    return json_resp({"ok": True, "local": True})


# ---------------------------------------------------------------- LLM 转发

@app.route("/api/llm", methods=["POST"])
def api_llm():
    try:
        raw = request.get_data()
        if request.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        body = json.loads(raw.decode("utf-8"))
    except Exception as e:
        return json_resp({"ok": False, "error": "请求体解析失败: %s" % e})

    messages = body.get("messages") or []
    if not messages:
        return json_resp({"ok": False, "error": "messages 不能为空"})

    # 优先用请求体里带的（用户在「设置」面板填的），否则回落环境变量
    key = body.get("api_key") or env("MOJINGESTORY_API_KEY") or env("STORYWRIGHT_API_KEY") or env("OPENAI_API_KEY")
    if not key:
        return json_resp({"ok": False, "noKey": True, "error":
                          "未配置 LLM key。请在界面右上角头像 → 设置 里填写你的 API Key"
                          "（也可设置环境变量 MOJINGESTORY_API_KEY 后重启服务，旧名 STORYWRIGHT_API_KEY 仍兼容）。"})

    base = (body.get("base_url") or env("MOJINGESTORY_BASE_URL") or env("STORYWRIGHT_BASE_URL") or env("OPENAI_BASE_URL")
            or "https://api.deepseek.com/v1").rstrip("/")
    model = body.get("model") or env("MOJINGESTORY_MODEL") or env("STORYWRIGHT_MODEL") or env("OPENAI_MODEL") or "deepseek-chat"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": body.get("temperature", 0.7),
        "stream": False,
    }
    if body.get("max_tokens"):
        payload["max_tokens"] = body["max_tokens"]

    req = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        return json_resp({"ok": True, "text": text, "model": model})
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:400]
        if e.code in (401, 403):
            msg = "LLM key 无效或无权访问（%d）。请检查 MOJINGESTORY_API_KEY（旧名 STORYWRIGHT_API_KEY 亦兼容）。" % e.code
        elif e.code == 429:
            msg = "触发限流（429）。稍候重试，或换一个 key / 降并发。"
        else:
            msg = "上游返回 %d: %s" % (e.code, detail)
        return json_resp({"ok": False, "error": msg})
    except Exception as e:
        return json_resp({"ok": False, "error": "LLM 调用失败: %s" % e})


# ---------------------------------------------------------------- 项目存取

@app.route("/api/save_state", methods=["POST"])
def api_save_state():
    try:
        raw = request.get_data()
        if request.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        body = json.loads(raw.decode("utf-8"))
    except Exception as e:
        return json_resp({"ok": False, "error": "请求体解析失败: %s" % e})

    data = body.get("data") or {}
    projects = data.get("projects") or {}
    if not projects:
        return json_resp({"ok": False, "error": "没有可保存的项目"})

    saved = []
    for name, proj in projects.items():
        fn = safe_name(name) + ".json"
        with open(os.path.join(DATA_DIR, fn), "w", encoding="utf-8") as f:
            json.dump(proj, f, ensure_ascii=False)
        saved.append(name)
    return json_resp({"ok": True, "saved": saved})


@app.route("/api/load_state")
def api_load_state():
    name = request.args.get("project", "")
    projects = {}
    if name:
        path = os.path.join(DATA_DIR, safe_name(name) + ".json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                projects[name] = json.load(f)
        else:
            return json_resp({"ok": False, "error": "项目不存在: %s" % name})
    else:
        for fn in os.listdir(DATA_DIR):
            if fn.endswith(".json"):
                try:
                    with open(os.path.join(DATA_DIR, fn), encoding="utf-8") as f:
                        projects[fn[:-5]] = json.load(f)
                except Exception:
                    pass
    return json_resp({"ok": True, "data": {"projects": projects}})


@app.route("/api/list_projects")
def api_list_projects():
    items = []
    for fn in os.listdir(DATA_DIR):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(DATA_DIR, fn)
        try:
            with open(path, encoding="utf-8") as f:
                proj = json.load(f)
            items.append({
                "name": proj.get("name") or fn[:-5],
                "updated": int(os.path.getmtime(path) * 1000),
            })
        except Exception:
            items.append({"name": fn[:-5], "updated": 0})
    items.sort(key=lambda x: x["updated"], reverse=True)
    return json_resp({"ok": True, "projects": items, "current": items[0]["name"] if items else ""})


@app.route("/api/rename_project", methods=["POST"])
def api_rename_project():
    body = request.get_json(force=True, silent=True) or {}
    old, new = safe_name(body.get("old")), safe_name(body.get("new"))
    if not old or not new:
        return json_resp({"ok": False, "error": "old / new 不能为空"})
    src, dst = os.path.join(DATA_DIR, old + ".json"), os.path.join(DATA_DIR, new + ".json")
    if not os.path.exists(src):
        return json_resp({"ok": False, "error": "项目不存在: %s" % old})
    if os.path.exists(dst):
        return json_resp({"ok": False, "error": "目标名已存在: %s" % new})
    os.rename(src, dst)
    return json_resp({"ok": True})


@app.route("/api/delete_project", methods=["POST"])
def api_delete_project():
    body = request.get_json(force=True, silent=True) or {}
    name = safe_name(body.get("name"))
    path = os.path.join(DATA_DIR, name + ".json")
    if os.path.exists(path):
        os.remove(path)
    return json_resp({"ok": True})


# ---------------------------------------------------------------- 本地版不含的端点

@app.route("/api/img_proxy", methods=["GET", "POST"])
@app.route("/api/generate", methods=["POST"])
@app.route("/api/audio_gen", methods=["POST"])
@app.route("/api/charge", methods=["POST"])
def api_charge_local():
    # 本地开源版无计费：所有操作免费放行，避免阻塞生成流程。
    return json_resp({"ok": True, "cost": 0, "free": True, "needRecharge": False})


# ---------------------------------------------------------------- 分镜连续性检查（内置 ShotLock）

@app.route("/api/continuity_check", methods=["POST"])
def api_continuity_check():
    """把当前项目交给内置 ShotLock 引擎跑分镜连续性 15 条规则。

    请求体：{"project": <完整项目 dict>, "lang": "zh"|"en"}
    返回：双语报告 dict（verdict / counts / issues / data_gaps / html）。
    lang 决定报告语言——英文界面不能拿到中文报告。
    """
    try:
        raw = request.get_data()
        if request.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        body = json.loads(raw.decode("utf-8"))
    except Exception as e:
        return json_resp({"ok": False, "error": "请求体解析失败: %s" % e})

    project = body.get("project") or {}
    if not (project.get("episodes") or project.get("shots")):
        return json_resp({"ok": False, "error": "项目还没有分镜（步骤⑤未跑），无可校验内容。"})

    lang = str(body.get("lang") or "zh").lower()
    if lang not in ("zh", "en"):
        lang = "zh"

    try:
        from continuity_report import build_report, render_html
        rpt = build_report(project, lang=lang)
        rpt["html"] = render_html(rpt)
        return json_resp(rpt)
    except Exception as e:
        return json_resp({"ok": False, "error": "连续性检查失败: %s" % e})


if __name__ == "__main__":
    port = int(env("PORT", "5178"))
    print("=" * 56)
    print("  MojingeStory 本地版  →  http://127.0.0.1:%d" % port)
    print("  数据目录: %s" % DATA_DIR)
    if not (env("MOJINGESTORY_API_KEY") or env("STORYWRIGHT_API_KEY") or env("OPENAI_API_KEY")):
        print("  [警告] 未配置 MOJINGESTORY_API_KEY（旧名 STORYWRIGHT_API_KEY 亦兼容），生成功能不可用")
    print("=" * 56)
    app.run(host="0.0.0.0", port=port, debug=False)
