#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Storywright 本地后端进程内自测（不经网络，用 Flask test_client）。"""
import gzip
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.pop("STORYWRIGHT_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)

from server_local import app  # noqa: E402

client = app.test_client()
fails = []


def check(name, cond, detail=""):
    print("%s %s %s" % ("PASS" if cond else "FAIL", name, detail[:120]))
    if not cond:
        fails.append(name)


# 静态
r = client.get("/")
check("GET / 返回 HTML", r.status_code == 200 and "Storywright" in r.get_data(as_text=True))
r = client.get("/common.js")
check("GET /common.js", r.status_code == 200 and "Storywright" in r.get_data(as_text=True))

# 状态类
r = client.get("/api/ping")
check("GET /api/ping", r.status_code == 200 and r.get_json().get("local") is True)
r = client.get("/api/me")
check("GET /api/me 本地身份", r.get_json().get("ok") and r.get_json()["user"]["email"] == "local@storywright")
r = client.get("/api/price_info")
check("GET /api/price_info free_mode", r.get_json().get("free_mode") is True)

# 项目存取
r = client.post("/api/save_state", json={"data": {"projects": {"自测项目": {"name": "自测项目", "episodes": {"1": "内容"}}}}})
check("POST /api/save_state", r.get_json().get("ok"))
r = client.get("/api/list_projects")
projs = r.get_json().get("projects") or []
check("GET /api/list_projects 含自测项目", any(p["name"] == "自测项目" for p in projs))
r = client.get("/api/load_state?project=自测项目")
check("GET /api/load_state?project=", r.get_json()["ok"] and "自测项目" in r.get_json()["data"]["projects"])
r = client.post("/api/rename_project", json={"old": "自测项目", "new": "自测项目2"})
check("POST /api/rename_project", r.get_json().get("ok"))
r = client.post("/api/delete_project", json={"name": "自测项目2"})
check("POST /api/delete_project", r.get_json().get("ok"))

# gzip 大请求体
body = json.dumps({"data": {"projects": {"大项目": {"name": "大项目", "big": "x" * 50000}}}}).encode()
r = client.post("/api/save_state", data=gzip.compress(body),
                headers={"Content-Type": "application/json", "Content-Encoding": "gzip"})
check("POST /api/save_state gzip 20KB+", r.get_json().get("ok"))
client.post("/api/delete_project", json={"name": "大项目"})

# LLM 无 key 友好报错
r = client.post("/api/llm", json={"messages": [{"role": "user", "content": "hi"}]})
j = r.get_json()
check("POST /api/llm 无 key 报错可读", j.get("ok") is False and "STORYWRIGHT_API_KEY" in j.get("error", ""))

# stub 端点
r = client.post("/api/generate")
check("POST /api/generate stub 明确错误", r.get_json().get("ok") is False and "云端" in r.get_json().get("error", ""))

# 路径穿越防护
r = client.get("/api/load_state?project=../../etc/passwd")
check("路径穿越被 safe_name 拦截", r.get_json().get("ok") is False)

print("\n结果: %d 通过, %d 失败" % (16 - len(fails) if not fails else 16 - len(fails), len(fails)))
sys.exit(1 if fails else 0)
