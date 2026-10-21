#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Storywright 端到端真实 LLM 测试：从 ~/.dsh/.credentials.yaml 读 DeepSeek key，
用工作台里真实的 system prompt 打 /api/llm，验证整条链路。"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

cred_path = os.path.expanduser("~/.dsh/.credentials.yaml")
cred = open(cred_path, encoding="utf-8").read()
m = re.search(r"DEEPSEEK_API_KEY:\s*(\S+)", cred)
if not m:
    print("FAIL: .credentials.yaml 里没找到 DEEPSEEK_API_KEY")
    sys.exit(1)
key = m.group(1)
print("key 已读取: %s...%s（%d 位，不回显完整值）" % (key[:6], key[-4:], len(key)))

os.environ["STORYWRIGHT_API_KEY"] = key
os.environ["STORYWRIGHT_BASE_URL"] = "https://api.deepseek.com/v1"
os.environ["STORYWRIGHT_MODEL"] = "deepseek-chat"

from server_local import app  # noqa: E402

client = app.test_client()
fails = []


def check(name, cond, detail=""):
    print("%s %s %s" % ("PASS" if cond else "FAIL", name, str(detail)[:200]))
    if not cond:
        fails.append(name)


# 1. 最简对话：验证 key、网络、转发、解析全链路
r = client.post("/api/llm", json={"messages": [
    {"role": "user", "content": "只回复两个字：收到"}]})
j = r.get_json()
check("DeepSeek 最简对话", j.get("ok") is True and j.get("text"), j.get("error") or j.get("text"))

# 2. 工作台真实场景：小说片段压缩摘要（前端 3674 行同款 system prompt）
r = client.post("/api/llm", json={"messages": [
    {"role": "system", "content": "你是专业的剧本改编策划。把用户给的小说片段压缩成 400 字以内的剧情摘要。必须保留：出现的所有人物及关系、关键事件、转折点、每条故事线的进展。只输出摘要正文，不要任何解释。"},
    {"role": "user", "content": "林晚第一次走进陈峙的钟表店，是为了修一块停走的旧表。陈峙没抬头，只说三天后来取。临走时林晚回头，看见陈峙正把另一块表的齿轮拆下来，装进她的表壳里——那是她母亲留给她的表，全城只有他一个人会修。三年后店铺迁址，林晚再找到他时，他已经不修表了，只说：有些东西修好了，反而留不住。"}]})
j = r.get_json()
t = j.get("text") or ""
check("真实改编 prompt 调用", j.get("ok") is True and len(t) > 50, j.get("error") or t[:80])
check("摘要含关键人物", "林晚" in t and "陈峙" in t, t[:100])

# 3. 模型参数透传校验（用 deepseek-reasoner 不合适，跳过；验证默认模型落点）
check("模型落点 deepseek-chat", j.get("model") == "deepseek-chat", j.get("model"))

print("\n结果: %d 通过, %d 失败" % (4 - len(fails), len(fails)))
sys.exit(1 if fails else 0)
