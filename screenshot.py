#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""启动后等服务器就绪，用 chromium 截一张 Storywright 界面图。"""
import os
import sys
import time
import urllib.request

URL = "http://127.0.0.1:5178/"
HERE = os.path.dirname(os.path.abspath(__file__))

# 等服务器起来（最多 20s）
up = False
for _ in range(40):
    try:
        urllib.request.urlopen(URL, timeout=2)
        up = True
        break
    except Exception:
        time.sleep(0.5)
if not up:
    print("FAIL: 服务器未在 20s 内就绪")
    sys.exit(1)

from playwright.sync_api import sync_playwright

out1 = os.path.join(HERE, "preview_landing.png")
out2 = os.path.join(HERE, "preview_workbench.png")

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(URL, wait_until="load", timeout=30000)
    time.sleep(2.0)
    page.screenshot(path=out1)
    print("saved", out1)
    # 试着进入工作台主区（点主导航第一项或等待渲染）
    try:
        page.wait_for_timeout(800)
        page.screenshot(path=out2)
        print("saved", out2)
    except Exception as e:
        print("second shot skip:", e)
    browser.close()
print("DONE")
