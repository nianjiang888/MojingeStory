#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MojingeStory 部署入口。本地开发与部署共用 server_local.py 里的 Flask app，
这里只负责用环境变量 PORT + 0.0.0.0 拉起它，满足发布平台的启动约定。"""
import os

from server_local import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5178"))
    app.run(host="0.0.0.0", port=port, debug=False)
