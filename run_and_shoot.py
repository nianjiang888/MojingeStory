#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""同进程起 Flask 线程 + 截 MojingeStory 界面图；并抓控制台报错、确认界面已无墨金格残留字样、验证「设置」面板与去计费、验证「关于」弹窗。"""
import os
import sys
import time
import threading
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from server_local import app  # noqa: E402

srv = threading.Thread(
    target=lambda: app.run(host="127.0.0.1", port=5178, debug=False, use_reloader=False),
    daemon=True,
)
srv.start()

up = False
for _ in range(40):
    try:
        urllib.request.urlopen("http://127.0.0.1:5178/", timeout=2)
        up = True
        break
    except Exception:
        time.sleep(0.5)
if not up:
    print("FAIL: server not up")
    sys.exit(1)

from playwright.sync_api import sync_playwright  # noqa: E402

out_landing = os.path.join(HERE, "preview_landing.png")
out_workbench = os.path.join(HERE, "preview_workbench.png")
out_menu = os.path.join(HERE, "preview_menu.png")
out_settings = os.path.join(HERE, "preview_settings.png")
out_about = os.path.join(HERE, "preview_about.png")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.add_init_script(
        "try{localStorage.setItem('mg_seen_app_version','0.1.0')}catch(e){}")
    errors = []
    pg.on("console", lambda m: errors.append("CONSOLE:%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR:%s" % e))

    # 0) 首页（门面页）
    pg.goto("http://127.0.0.1:5178/", wait_until="load", timeout=30000)
    time.sleep(1.2)
    pg.screenshot(path=out_landing)
    home_txt = pg.evaluate("document.body.innerText || ''")
    print("首页含门面文案:", "命中" if ("开源本地剧本工作台" in home_txt and "不外流" in home_txt) else "缺失!")
    print("首页进入工作台入口:", "命中" if pg.evaluate("!!document.querySelector('.cta')") else "缺失!")

    # 工作台（/workbench.html）
    pg.goto("http://127.0.0.1:5178/workbench.html", wait_until="load", timeout=30000)
    time.sleep(2.2)
    pg.screenshot(path=out_workbench)

    # 1) 打开用户菜单
    pg.click("#mgAvatar", timeout=8000)
    pg.wait_for_selector("#umuSettings", timeout=8000)
    time.sleep(0.4)
    pg.screenshot(path=out_menu)
    menu_txt = pg.evaluate("document.querySelector('.mg-umenu') ? document.querySelector('.mg-umenu').innerText : ''")
    for present in ["设置 · API Key", "关于 MojingeStory"]:
        print("菜单含[%s]: %s" % (present, "命中" if present in menu_txt else "缺失!"))
    for absent in ["个人中心", "消费账单", "充值", "退出登录", "UID"]:
        print("菜单无[%s]: %s" % (absent, "OK(无)" if absent not in menu_txt else "残留!"))

    # 2) 「关于」弹窗（原 404 修复验证）
    pg.click("#umuAbout", timeout=8000)
    pg.wait_for_selector("#swAboutOv", timeout=8000)
    time.sleep(0.4)
    pg.screenshot(path=out_about)
    about_txt = pg.evaluate("(document.getElementById('swAboutOv')||{innerText:''}).innerText")
    print("关于弹窗含版本/MIT/数据不出本机:", "命中" if ("MIT" in about_txt and "0.1.0" in about_txt and "这台电脑" in about_txt) else "缺失!")

    # 3) 设置面板
    pg.click("#swAboutClose", timeout=8000)
    pg.click("#mgAvatar", timeout=8000)
    pg.wait_for_selector("#umuSettings", timeout=8000)
    pg.click("#umuSettings", timeout=8000)
    pg.wait_for_selector("#swKey", timeout=8000)
    time.sleep(0.4)
    pg.screenshot(path=out_settings)
    pg.fill("#swKey", "sk-test-abc123")
    pg.fill("#swBase", "https://api.deepseek.com/v1")
    pg.fill("#swModel", "deepseek-chat")
    pg.click("#swSaveBtn", timeout=8000)
    time.sleep(0.6)
    stored = pg.evaluate("({k: localStorage.getItem('storywright_api_key'), b: localStorage.getItem('storywright_base_url'), m: localStorage.getItem('storywright_model')})")
    print("localStorage 落盘:", stored)
    banner_gone = pg.evaluate("!document.getElementById('swKeyBanner')")
    print("保存后底部提示已移除:", banner_gone)

    # 4) 残留检查（整页）
    txt = pg.evaluate("document.body.innerText || ''")
    for bad in ["墨金格", "金格", "剧本大师", "交付中心", "进入视频工作台", "创意引流", "爆款模板", "消费账单", "余额不足"]:
        print("残留检查[%s]: %s" % (bad, "命中!" if bad in txt else "无"))

    print("控制台 error/warning 条数:", len(errors))
    for e in errors[:15]:
        print("  ", e[:160])
    b.close()
print("DONE")
