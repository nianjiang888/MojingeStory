/* ============================================================
 * Storywright common.js —— 三页面共用：后端地址 / 统一顶栏 / 登录 / 请求封装
 * 全新项目，与旧项目零关系。
 * 统一产品壳：Storywright 故事匠，含 剧本工作台 / 视频工作台 / 素材库 三个功能页
 * 登录统一为「邮箱 + 密码」，Storywright与工作台共用同一账号。
 * ============================================================ */
(function () {
  'use strict';

  var BACKEND = (function () {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin;
    }
    return localStorage.getItem('storywright_backend') || 'http://127.0.0.1:5178';
  })();

  /* 全站唯一版本号。每次部署由 deploy.sh 自动 bump，四个页面同时更新，
     避免出现「首页说 A 版、编辑器说 B 版」这种对不上账的情况。 */
  var BUILD = '20261019-1';

  /* 用户可见的产品版本（≠ BUILD）。BUILD 是构建流水号，APP_VERSION 才是产品版本。每次产品版本变化，用户进入时弹一次更新说明。 */
  var APP_VERSION = '0.1.0';

  /* 更新日志：一个版本一条，数组最前为最新。checkUpgrade 只展示「比用户上次看到的版本新」的条目。
     条目用纯文本，避免 emoji / 星级等 AI 味表达。 */
  var CHANGELOG = [
    {
      v: '0.1.0', date: '2026-10-19',
      title: 'Storywright 0.1.0 · 首个开源版本',
      items: [
        '本地开源版首发：导入小说 → 故事中枢 → 分集大纲 → 改编剧本 → 分镜脚本 → 导出资产包，全流程在本机完成',
        '模型跑在你自己的 key 后面（OpenAI 兼容接口均可，如 DeepSeek / 智谱 / 通义），数据不出这台机器',
        '无需注册登录；项目保存在本机 data/projects 目录，导出为 .md 直接拿去即梦 / 可灵 / Midjourney 等平台出图出视频'
      ]
    }
  ];

  var TOKEN_KEY = 'storywright_token';

  /* 本地模式：没有登录体系，给一个固定本地身份，让保存/加载等需要登录态的分支正常走通 */
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || 'local'; } catch (e) { return 'local'; } }
  function setToken(t) { try { if (t && t !== 'local') localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // 大请求体（如 save_state 的整份账号 state 可达数 MB）现在在客户端先 gzip 再上传：
  // 服务端 _read_body 已支持 Content-Encoding: gzip 解压（2026-09-01 性能复盘确认），
  // 上传体积降 5~7 倍，"保存中"卡顿从 30+ 秒降到与加载同级的几秒。
  // 采用 ReadableStreamDefaultReader 手动收块收集 gzip 字节，不再用 Response(stream).arrayBuffer()
  //（那个在部分环境会令 Promise 永久 pending 导致卡死）；任何异常或不支持时降级回明文上传。
  function _gzipString(str) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var cs = new CompressionStream('gzip');
      var writer = cs.writable.getWriter();
      writer.write(new TextEncoder().encode(str));
      writer.close();
      var reader = cs.readable.getReader();
      var chunks = [];
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var len = 0, i;
            for (i = 0; i < chunks.length; i++) len += chunks[i].length;
            var out = new Uint8Array(len), off = 0;
            for (i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
            return out;
          }
          chunks.push(r.value);
          return pump();
        });
      }
      return pump().catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function _swStoredConfig() {
    try {
      var k = localStorage.getItem('storywright_api_key');
      var b = localStorage.getItem('storywright_base_url');
      var m = localStorage.getItem('storywright_model');
      if (!k && !b && !m) return null;
      return { api_key: k || '', base_url: b || '', model: m || '' };
    } catch (e) { return null; }
  }

  // 本地开源版 i18n：英文界面时给模型注入「用英文输出」指令。
  // 根因：所有 system 提示词都是中文写的，模型默认吐中文——用户导入英文小说，
  // 拿到的大纲/剧本/关系/分镜全是中文（2026-10-20 用户实测截图）。
  // 判定只看界面语言：用户切到英文界面就是要英文，无条件注入。
  // 【2026-10-20 二次翻车教训】曾经按「正文是否中文」决定是否注入，结果旧项目里
  // 修复前产生的中文数据（中文概要/中文关系/中文大纲）让请求看起来是中文内容 →
  // 规则被跳过 → 模型继续吐中文 → 新数据又是中文，死循环。
  // 界面语言是唯一可靠的用户意图信号；内容语言不可信（可能是历史脏数据）。
  function _swLangRule(messages) {
    try {
      if (!window.SW_I18N || !SW_I18N.getLang || SW_I18N.getLang() === 'zh') return '';
      if (!Array.isArray(messages) || !messages.length) return '';
      return 'LANGUAGE REQUIREMENT — this overrides any language implied by the instructions above: '
        + 'Your entire reply must be written in English. Every field name, label, key, heading, '
        + 'option value, description and paragraph you output must be English. '
        + 'Never output Chinese characters. Keep proper nouns, titles and quoted lines that appear '
        + 'in the source text exactly as they are.';
    } catch (e) { return ''; }
  }

  function api(path, method, body, timeoutMs, signal) {
    var opt = { method: method || 'GET', headers: {} };
    var tok = getToken();
    if (tok) opt.headers['X-Token'] = tok;
    // 本地开源版：把「设置」里填的 key/base/model 注入 /api/llm 请求体（可被显式参数覆盖）
    if (path === '/api/llm' && body && typeof body === 'object' && !(body instanceof FormData)) {
      var _swc = _swStoredConfig();
      if (_swc) {
        if (!body.api_key && _swc.api_key) body.api_key = _swc.api_key;
        if (!body.base_url && _swc.base_url) body.base_url = _swc.base_url;
        if (!body.model && _swc.model) body.model = _swc.model;
      }
      // 英文界面：给所有 /api/llm 请求注入语言指令（一处覆盖全部调用点）
      if (Array.isArray(body.messages)) {
        var _rule = _swLangRule(body.messages);
        if (_rule) {
          var _hasSys = false;
          body.messages = body.messages.map(function (m) {
            if (m && m.role === 'system') { _hasSys = true; return { role: 'system', content: String(m.content || '') + '\n\n' + _rule }; }
            return m;
          });
          if (!_hasSys) body.messages = [{ role: 'system', content: _rule }].concat(body.messages);
        }
      }
    }
    var bodyReady = Promise.resolve();
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      var raw = JSON.stringify(body);
      // 仅对较大请求体 gzip（小请求 gzip 反而略增体积且耗 CPU），阈值 8KB。
      if (raw.length > 8192 && typeof CompressionStream !== 'undefined') {
        bodyReady = _gzipString(raw).then(function (bytes) {
          if (bytes && bytes.length) { opt.body = bytes; opt.headers['Content-Encoding'] = 'gzip'; }
          else { opt.body = raw; }
        }).catch(function () { opt.body = raw; });
      } else {
        opt.body = raw;
      }
    }
    // 前端超时兜底：默认 360s；调用方可传第4参覆盖（如精修 60s）。
    // 之前 fetch 无超时，后端慢时 .then/.catch 永不触发 → 转圈卡死（用户反复反馈"精修转不停"）。
    // 后端视频轮询最长 300s（MiniMax/万相/Seedance），120s 会提前误杀视频请求，故拉高到 360s。
    var t = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 360000;
    var ctrl = null;
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      opt.signal = ctrl.signal;
      setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, t);
    }
    // 允许调用方注入外部 AbortSignal（如分镜生成的共享取消控制器），实现「在飞请求即时中断」；
    // 外部 abort 触发时一并 abort 内部兜底 ctrl，使 fetch 立即 reject（不再干等最长 360s）。
    if (signal && typeof signal.addEventListener === 'function') {
      if (ctrl) { signal.addEventListener('abort', function () { try { ctrl.abort(); } catch (e) {} }); }
      else { opt.signal = signal; }
    }
    var fetchPromise = bodyReady.then(function () {
      return fetch(BACKEND + path, opt).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, err: '响应解析失败 (HTTP ' + (r.status || '?') + ' ' + (r.statusText || '') + ')' };
      });
    }).catch(function (e) {
      var msg = (e && e.name === 'AbortError') ? ('请求超时（> ' + Math.round(t / 1000) + 's），请重试') : '网络错误，请确认已从服务器地址打开页面';
      return { ok: false, err: msg, timeout: (e && e.name === 'AbortError') };
    });
    });
    // 双重兜底：某些浏览器/容器里 AbortController 不真正 abort 在飞 fetch，导致 .then/.catch 永不触发。
    // 用 Promise.race 再加一层纯 setTimeout 兜底，保证最迟 t+5 秒内一定返回，杜绝永久转圈。
    return Promise.race([
      fetchPromise,
      new Promise(function (resolve) {
        setTimeout(function () {
          try { if (ctrl) ctrl.abort(); } catch (e) {}
          resolve({ ok: false, err: '请求超时（> ' + Math.round(t / 1000) + 's），请重试', timeout: true });
        }, t + 5000);
      })
    ]);
  }

  /* ---------- 统一顶栏样式（只注入一次） ---------- */
  var TOPBAR_CSS = '' +
    '.mg-topbar{position:fixed;top:0;left:0;right:0;height:56px;z-index:1000;display:flex;align-items:center;' +
    'justify-content:space-between;padding:0 24px;background:#0A0B0E;' +
    'border-bottom:1px solid #24272E;font-family:Inter,"Noto Sans SC",system-ui,sans-serif;}' +
    'body.mg-top{padding-top:56px;}' +
    '.mg-logo{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;}' +
    '.mg-logo .mark{width:28px;height:28px;border-radius:8px;background:#F5A623;border:1px solid #F5A623;' +
    'display:flex;align-items:center;justify-content:center;font-weight:600;color:#0A0B0E;font-size:14px;}' +
    '.mg-logo .name{font-size:15px;font-weight:500;color:#F4F5F7;letter-spacing:.02em;}' +
    '.mg-logo .name b{color:#F5A623;font-weight:600;}' +
    '.mg-tabs{display:flex;align-items:center;gap:4px;margin-left:24px;}' +
    '.mg-tab{padding:7px 13px;border-radius:8px;font-size:13px;color:#A6ACB8;cursor:pointer;border:1px solid transparent;transition:color .15s,background .15s;}' +
    '.mg-tab:hover{color:#F4F5F7;background:#101216;}' +
    '.mg-tab.active{color:#F5A623;background:transparent;border-color:transparent;font-weight:600;box-shadow:inset 0 -2px 0 #F5A623;}' +
    '.mg-right{display:flex;align-items:center;gap:12px;}' +
    '.mg-center{flex:1;display:flex;align-items:center;justify-content:center;gap:12px;min-width:0;}' +
    '.mg-bal{display:flex;align-items:center;gap:6px;font-size:13px;color:#F5A623;cursor:pointer;padding:6px 10px;border-radius:8px;border:1px solid #4A3A18;}' +
    '.mg-bal:hover{background:rgba(245,166,35,0.08);}' +
    '.mg-bal .lbl{color:#6B7280;font-size:11px;}' +
    '.mg-avatar{width:28px;height:28px;border-radius:50%;background:#16181D;border:1px solid rgba(245,166,35,.45);color:#F5A623;' +
    'display:flex;align-items:center;justify-content:center;font-weight:500;font-size:13px;cursor:pointer;}' +
    '.mg-btn{background:transparent;border:1px solid #24272E;color:#A6ACB8;padding:7px 15px;border-radius:8px;font-size:13px;cursor:pointer;transition:color .15s,border-color .15s;}' +
    '.mg-btn:hover{color:#F4F5F7;border-color:#343845;}' +
    '.mg-btn.solid{background:#F5A623;border-color:#F5A623;color:#0A0B0E;font-weight:500;}' +
    '.mg-btn.solid:hover{background:#FFB84D;border-color:#FFB84D;}' +
    '.mg-admin-btn{display:flex;align-items:center;gap:6px;font-size:12px;color:#F5A623;cursor:pointer;padding:6px 10px;border-radius:8px;border:1px solid #4A3A18;background:rgba(245,166,35,0.06);}' +
    '.mg-admin-btn:hover{background:rgba(245,166,35,0.12);}' +
    '.mg-admin-btn svg{width:14px;height:14px;fill:currentColor;}' +
    '.mg-ico-btn{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #24272E;color:#A6ACB8;font-size:13px;font-weight:500;transition:color .15s,border-color .15s;}' +
    '.mg-ico-btn:hover{color:#F4F5F7;border-color:#343845;background:#101216;}' +
    '.mg-ico-btn svg{width:16px;height:16px;fill:currentColor;}' +
    '.mg-modal-ov{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;font-family:Inter,"Noto Sans SC",system-ui,sans-serif;}' +
    '.mg-modal{background:#16181D;padding:26px 24px;border-radius:16px;width:420px;max-width:92%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid #24272E;color:#F4F5F7;}' +
    '.mg-modal h3{font-size:17px;font-weight:500;margin-bottom:4px;}' +
    '.mg-modal p.sub{font-size:12px;color:#A6ACB8;margin:0 0 18px;}' +
    '.mg-input{width:100%;padding:11px 12px;margin-bottom:12px;background:#0d1322;border:1px solid #2a3650;color:#fff;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;}' +
    '.mg-input:focus{border-color:#2DD4A8;}' +
    '.mg-err{display:none;margin-bottom:12px;padding:8px 10px;background:#3a1414;border:1px solid #6e2626;border-radius:8px;font-size:12px;color:#fca5a5;}' +
    '.mg-pkgs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}' +
    '.mg-pkg{border:1px solid #2a3650;border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:all .15s;}' +
    '.mg-pkg:hover{border-color:#F5A623;background:rgba(245,166,35,0.06);}' +
    '.mg-pkg .amt{font-size:20px;font-weight:700;color:#F5A623;}' +
    '.mg-pkg .bon{font-size:11px;color:#2DD4A8;margin-top:4px;}' +
    '.mg-wx{text-align:center;padding:6px 0 2px;}' +
    '.mg-wx .mg-wx-amt{font-size:22px;font-weight:700;color:#F5A623;margin-bottom:12px;}' +
    '.mg-wx .mg-wx-amt .bon{font-size:12px;color:#2DD4A8;font-weight:500;}' +
    '.mg-wx .mg-wx-qr{width:200px;height:200px;border-radius:10px;background:#fff;padding:8px;box-sizing:border-box;}' +
    '.mg-wx .mg-wx-code{font-size:12px;color:#8b98b3;word-break:break-all;background:#0d1322;border:1px solid #2a3650;border-radius:8px;padding:10px;margin-bottom:10px;}' +
    '.mg-wx .mg-wx-code code{color:#2DD4A8;}' +
    '.mg-wx .mg-wx-tip{font-size:12px;color:#8b98b3;margin:12px 0 6px;}' +
    '.mg-wx .mg-wx-status{font-size:13px;color:#9fb0c9;}' +
    '.mg-asset{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;}' +
    '.mg-asset .thumb{width:64px;height:36px;border-radius:6px;object-fit:cover;background:#0d1322;flex:0 0 auto;}' +
    '.mg-asset .meta{font-size:12px;color:#9fb0c9;overflow:hidden;}' +
    '.mg-asset .meta b{color:#E8EDF6;}' +
    '.mg-toast{position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:2147483647;background:#16181D;border:1px solid #24272E;color:#F4F5F7;padding:10px 18px;border-radius:8px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,0.4);font-family:Inter,"Noto Sans SC",system-ui,sans-serif;}' +
    '.mg-umenu-ov{position:fixed;inset:0;z-index:2147483646;}' +
    '.mg-umenu{position:absolute;top:62px;right:18px;width:236px;background:#16181D;border:1px solid #24272E;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,0.55);overflow:hidden;font-family:Inter,"Noto Sans SC",system-ui,sans-serif;}' +
    '.mg-umenu .head{padding:14px 16px;border-bottom:1px solid #24272E;display:flex;align-items:center;gap:12px;cursor:pointer;}' +
    '.mg-umenu .head .av{width:42px;height:42px;border-radius:50%;flex:0 0 auto;overflow:hidden;background:#101216;border:1px solid #24272E;color:#F4F5F7;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:18px;}' +
    '.mg-umenu .head .av img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.mg-umenu .head .info{flex:1 1 auto;min-width:0;}' +
    '.mg-umenu .head .edit{font-size:10px;color:#A6ACB8;margin-top:3px;opacity:.85;}' +
    '.mg-umenu .head .nm{font-size:15px;font-weight:500;color:#F4F5F7;display:flex;align-items:center;gap:8px;}' +
    '.mg-umenu .head .em{font-size:11px;color:#A6ACB8;margin-top:3px;word-break:break-all;}' +
    '.mg-umenu .head .uid{font-size:11px;color:#F5A623;margin-top:2px;}' +
    '.mg-umenu .item{display:flex;align-items:center;gap:8px;padding:11px 16px;font-size:13px;color:#A6ACB8;cursor:pointer;transition:background .12s;}' +
    '.mg-umenu .item:hover{background:rgba(255,255,255,0.05);color:#F4F5F7;}' +
    '.mg-umenu .item svg{width:14px;height:14px;fill:currentColor;opacity:.7;}' +
    '.mg-umenu .item.danger{color:#fca5a5;}' +
    '.mg-umenu .item.danger:hover{background:rgba(252,165,165,0.08);}' +
    '.mg-umenu .sep{height:1px;background:#24272E;margin:2px 0;}' +
    '.mg-modal .mg-mtabs{display:flex;gap:6px;margin-bottom:14px;}' +
    '.mg-modal .mg-mtab{padding:6px 14px;border-radius:8px;font-size:13px;color:#A6ACB8;cursor:pointer;border:1px solid #24272E;}' +
    '.mg-modal .mg-mtab.on{background:#16181D;color:#F4F5F7;font-weight:500;border-color:#343845;}' +
    '.mg-price{max-height:54vh;overflow:auto;font-size:12px;}' +
    '.mg-price h4{font-size:13px;color:#F5A623;margin:14px 0 6px;}' +
    '.mg-price table{width:100%;border-collapse:collapse;margin-bottom:6px;}' +
    '.mg-price th,.mg-price td{text-align:left;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#c9d3e3;}' +
    '.mg-price th{color:#8b98b3;font-weight:500;}' +
    '.mg-price td .pr{color:#2DD4A8;font-weight:600;}' +
    '.mg-price .note{font-size:11px;color:#8b98b3;margin:4px 0 8px;line-height:1.5;}' +
    '.mg-rc-modal{width:520px;max-width:92%;padding:28px;}' +
    '.mg-rc-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;}' +
    '.mg-rc-head h3{font-size:19px;font-weight:700;color:#E8EDF6;margin:0;}' +
    '.mg-rc-balance{font-size:12px;color:#8b98b3;text-align:right;}' +
    '.mg-rc-balance b{display:block;font-size:20px;color:#F5A623;font-weight:700;margin-top:2px;}' +
    '.mg-rc-modal p.sub{font-size:12px;color:#8b98b3;margin:0 0 18px;line-height:1.5;}' +
    '.mg-rc-fee{background:#101216;border:1px solid #24272E;border-radius:12px;padding:14px 16px;margin-bottom:18px;}' +
    '.mg-rc-fee-title{font-size:13px;font-weight:700;color:#2DD4A8;margin-bottom:6px;display:flex;align-items:center;gap:6px;}' +
    '.mg-rc-fee p{font-size:12px;color:#c9d3e3;margin:0;line-height:1.7;}' +
    '.mg-rc-fee p b{color:#F5A623;font-weight:600;}' +
    '.mg-rc-label{font-size:12px;color:#8b98b3;margin-bottom:10px;font-weight:500;}' +
    '.mg-rc-pkgs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}' +
    '.mg-rc-pkg{border:1px solid #2a3650;border-radius:12px;padding:14px 6px;text-align:center;cursor:pointer;transition:all .15s;background:#0d1322;position:relative;}' +
    '.mg-rc-pkg:hover{border-color:#F5A623;background:rgba(245,166,35,0.08);}' +
    '.mg-rc-pkg.sel{border-color:#F5A623;background:rgba(245,166,35,0.12);box-shadow:0 0 0 1px #F5A623;}' +
    '.mg-rc-pkg .amt{font-size:18px;font-weight:700;color:#E8EDF6;}' +
    '.mg-rc-pkg .bon{font-size:11px;color:#2DD4A8;margin-top:5px;font-weight:600;}' +
    '.mg-rc-pkg .tag{position:absolute;top:-8px;right:6px;background:#F5A623;color:#0A0D14;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;}' +
    '.mg-rc-custom{border:1px solid #2a3650;border-radius:12px;padding:14px;background:#0d1322;margin-bottom:16px;}' +
    '.mg-rc-custom label{font-size:12px;color:#8b98b3;display:block;margin-bottom:10px;}' +
    '.mg-rc-cwrap{display:flex;gap:10px;align-items:center;}' +
    '.mg-rc-csign{font-size:18px;color:#F5A623;font-weight:600;}' +
    '.mg-rc-cwrap input{flex:1;min-width:0;padding:11px 12px;background:#070B12;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#E8EDF6;font-size:16px;font-weight:600;outline:none;}' +
    '.mg-rc-cwrap input:focus{border-color:#2DD4A8;}' +
    '.mg-rc-cwrap input::placeholder{color:#5c6b7f;font-weight:400;}' +
    '.mg-rc-paybtn{width:100%;padding:13px;background:#F5A623;color:#0A0B0E;border:none;border-radius:10px;font-size:15px;font-weight:500;cursor:pointer;margin-bottom:16px;}' +
    '.mg-rc-paybtn:hover{background:#FFB84D;}' +
    '.mg-rc-paybtn:disabled{opacity:.5;cursor:not-allowed;}' +
    '.mg-rc-guard{display:flex;gap:14px;align-items:center;background:#0d1322;border:1px solid #2a3650;border-radius:12px;padding:14px;margin-bottom:4px;}' +
    '.mg-rc-qr{width:72px;height:72px;border-radius:8px;overflow:hidden;background:#fff;padding:4px;flex:0 0 auto;}' +
    '.mg-rc-qr img{width:100%;height:100%;object-fit:contain;display:block;}' +
    '.mg-rc-guard-text{flex:1;}' +
    '.mg-rc-guard-text b{font-size:13px;color:#E8EDF6;display:block;margin-bottom:4px;}' +
    '.mg-rc-guard-text p{font-size:11px;color:#8b98b3;margin:0;line-height:1.6;}' +
    '.mg-rc-wx{text-align:center;padding:10px 0;}' +
    '.mg-rc-wx .mg-rc-wx-amt{font-size:22px;font-weight:700;color:#F5A623;margin-bottom:12px;}' +
    '.mg-rc-wx .mg-rc-wx-amt .bon{font-size:12px;color:#2DD4A8;font-weight:500;display:block;margin-top:4px;}' +
    '.mg-rc-wx .mg-rc-wx-qr{width:260px;height:260px;border-radius:10px;background:#fff;padding:2px;}' +
    '.mg-rc-wx .mg-rc-wx-code{font-size:12px;color:#8b98b3;word-break:break-all;background:#0d1322;border:1px solid #2a3650;border-radius:8px;padding:10px;margin-bottom:10px;}' +
    '.mg-rc-wx .mg-rc-wx-code code{color:#2DD4A8;}' +
    '.mg-rc-wx .mg-rc-wx-tip{font-size:12px;color:#8b98b3;margin:12px 0 6px;}' +
    '.mg-rc-wx .mg-rc-wx-status{font-size:13px;color:#9fb0c9;}' +
    '.mg-rc-wx-cancel{width:100%;padding:11px;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#9fb0c9;border-radius:10px;cursor:pointer;margin-top:12px;}' +
    '.mg-rc-wx-cancel:hover{border-color:rgba(255,255,255,0.3);color:#E8EDF6;}' +
    '.mg-rc-wx-confirm{width:100%;padding:11px;background:#F5A623;color:#0A0B0E;border:none;border-radius:10px;cursor:pointer;margin-top:10px;font-weight:500;font-size:14px;}' +
    '.mg-rc-wx-confirm:disabled{opacity:0.6;cursor:default;}';

  var _cssInjected = false;
  function injectCss() {
    if (_cssInjected) return;
    var s = document.createElement('style');
    s.textContent = TOPBAR_CSS;
    document.head.appendChild(s);
    _cssInjected = true;
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'mg-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function resolveUrl(url) {
    if (location.protocol === 'http:' || location.protocol === 'https:') return '/' + url;
    if (/\/pages\//.test(location.pathname)) return '../' + url;
    return url;
  }

  // pivot 定稿：四条主线——剧本生成（对话出剧本）/ 剧本工作台（长文改编全流程）/ 广告视频（几秒广告小口）/ 模板中心
  // quick.html 已从导航退役（能力折进 script.html 的快速骨架模式），文件保留可逆
  /* 本地开源版仅分发剧本工作台一个页面，其余导航项不随开源包走 */
  var TABS = [
    { key: 'workbench', label: '剧本工作台', url: 'workbench.html' },
  ];

  /* ---------- 统一顶栏 ---------- */
  // opts: { active, getProject:fn()->string|null, onBeforeNavigate:fn(target)->Promise|void }
  /* 本地开源版没有帮助中心页（pages/help-center.html 未随包分发），「关于」改为应用内弹窗 */
  function openHelp() { openAbout(); }

  function openAbout() {
    if (document.getElementById('swAboutOv')) return;
    injectCss();
    var ov = document.createElement('div');
    ov.id = 'swAboutOv';
    ov.className = 'mg-modal-ov';
    ov.innerHTML =
      '<div class="mg-modal" style="width:480px;max-width:94%;padding:28px;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
      '<div style="width:40px;height:40px;border-radius:10px;background:#F5A623;color:#0A0B0E;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;">S</div>' +
      '<div><div style="font-size:18px;font-weight:700;color:#E8EDF6;">Storywright</div>' +
      '<div style="font-size:12px;color:#8b98b3;">v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.1.0') + ' · build ' + (typeof BUILD !== 'undefined' ? BUILD : '') + ' · MIT ' + (window.SW_I18N && SW_I18N.getLang && SW_I18N.getLang() !== 'zh' ? 'open source' : '开源') + '</div></div>' +
      '</div>' +
      '<div style="font-size:13px;color:#c9d3e3;line-height:1.9;">' +
      '开源本地剧本工作台：导入小说 → 故事中枢 → 分集大纲 → 改编剧本 → 分镜脚本 → 导出资产包。<br>' +
      '数据只保存在这台电脑上（data/projects 目录），不上传、不外流。<br>' +
      '模型跑在你自己的 Key 后面，在「设置 · API Key」里配置（DeepSeek / 智谱 / 通义等 OpenAI 兼容接口均可）。<br>' +
      '生成完成后，在第 6 步「导出资产包」一键带走全部剧本与提示词（.md 文件）。' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:20px;">' +
      '<button id="swAboutClose" style="background:#F5A623;color:#0A0B0E;border:none;border-radius:9px;padding:9px 20px;font-size:14px;font-weight:500;cursor:pointer;">知道了</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('swAboutClose').onclick = close;
  }

  function renderTopbar(opts) {
    opts = opts || {};
    injectCss();
    document.body.classList.add('mg-top');
    var bar = document.getElementById('mgTopbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mgTopbar';
      bar.className = 'mg-topbar';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    var me0 = MG.isLoggedIn() ? MG.me() : {};
    var initial = me0.nickname ? me0.nickname.slice(0, 1) : (MG.currentEmail() || '').slice(0, 1).toUpperCase();
    var avatarUrl = me0.avatar || '';
    var tabsHtml = TABS.map(function (t) {
      return '<div class="mg-tab ' + (t.key === opts.active ? 'active' : '') + '" data-url="' + t.url + '">' + t.label + '</div>';
    }).join('');
    var helpBtn = '<div class="mg-ico-btn" id="mgHelpBtn" title="使用帮助 · 说明书">?</div>';
    var toggleBtns =
      helpBtn +
      '<div class="mg-ico-btn" id="mgThemeBtn" title="黑白主题切换（即将上线）">' +
        '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '</div>' +
      '<div class="mg-ico-btn" id="mgLangBtn" title="' + (window.SW_I18N && SW_I18N.getLang() === 'zh' ? 'Switch to English' : '切换为中文') + '">' + (window.SW_I18N && SW_I18N.getLang() === 'zh' ? 'EN' : '中') + '</div>';
    var rightHtml = MG.isLoggedIn()
      ? toggleBtns +
        '<div class="mg-avatar" id="mgAvatar" title="点击查看账户菜单">' + (avatarUrl ? '<img src="' + avatarUrl + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">' : (initial || 'S')) + '</div>'
      : toggleBtns + '<button class="mg-btn solid" id="mgLogin">开始使用</button>';
    bar.innerHTML =
      '<div style="display:flex;align-items:center;flex:0 0 auto;">' +
      '<div class="mg-logo" id="mgLogo"><div class="mark">S</div>' +
      '<div class="name">Storywright · <b>专注剧本创作</b></div></div>' +
      '<div class="mg-tabs">' + tabsHtml + '</div>' +
      '</div>' +
      (opts.centerHtml ? '<div class="mg-center">' + opts.centerHtml + '</div>' : '') +
      '<div class="mg-right" style="flex:0 0 auto;">' + rightHtml + '</div>';

    // 本地开源版：未配置 Key 时底部提示（已配置则自动移除）
    _swKeyBanner();

    // 页面级绑定钩子：每次（含 refreshMe 拉取资料后的重渲染）innerHTML 重建后，
    // 让页面重新绑定顶栏中心按钮。否则 refreshMe 重渲染会销毁 jinge.html 里 bindTopbar
    // 绑的事件，导致顶栏中心按钮（比例/风格/同步/合成/成片库）刷新后点不开。
    if (typeof opts.onTopbarReady === 'function') {
      try { opts.onTopbarReady(); } catch (e) {}
    }

    function navTo(url) {
      var before = opts.onBeforeNavigate;
      var go = function () {
        var proj = opts.getProject ? opts.getProject() : null;
        location.href = resolveUrl(url) + (proj ? ('?project=' + encodeURIComponent(proj)) : '');
      };
      if (before) {
        var r = before(url);
        if (r && typeof r.then === 'function') r.then(go).catch(go);
        else go();
      } else {
        go();
      }
    }

    bar.querySelectorAll('.mg-tab').forEach(function (el) {
      el.onclick = function () {
        var url = el.getAttribute('data-url');
        if (!MG.isLoggedIn()) { MG.openLogin(function () { navTo(url); }); return; }
        navTo(url);
      };
    });
    /* 点 logo 回宣传首页：若工作台嵌在首页 iframe 里，则就地显示父页门面（不导航，避免被自动进入逻辑弹回）；
       直接打开 workbench.html 时（非 iframe）才跳转 / */
    document.getElementById('mgLogo').style.cursor = 'pointer';
    document.getElementById('mgLogo').onclick = function () {
      try {
        if (window.self !== window.top && window.parent && window.parent.document) {
          var sp = window.parent.document.getElementById('splash');
          var fr = window.parent.document.getElementById('appFrame');
          if (sp && fr) { sp.style.display = ''; fr.style.display = 'none'; return; }
        }
      } catch (e) {}
      location.href = '/';
    };
    var loginBtn = document.getElementById('mgLogin');
    if (loginBtn) loginBtn.onclick = function () { MG.openLogin(function () { renderTopbar(opts); }); };
    var avatar = document.getElementById('mgAvatar');
    if (avatar) avatar.onclick = function (e) { e.stopPropagation(); openUserMenu(opts); };
    /* 本地版无余额/计费，余额入口已移除 */
    var themeBtn = document.getElementById('mgThemeBtn');
    if (themeBtn) themeBtn.onclick = function () { toast('黑白主题切换即将上线'); };
    var langBtn = document.getElementById('mgLangBtn');
    if (langBtn) langBtn.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (window.SW_I18N) SW_I18N.toggle();
    };
    var helpBtnEl = document.getElementById('mgHelpBtn');
    if (helpBtnEl) helpBtnEl.onclick = function () { MG.openHelp(); };

    if (MG.isLoggedIn()) {
      // 登录态下按需拉取 nickname/uid 缓存并据以刷新一次顶栏。
      // 注意：服务端 token 是随机串而非 JWT，currentEmail() 恒为空，不能用它做守卫，
      // 否则会无限重渲染（顶栏闪烁、按钮点不了、余额被反复重置）。
      // 用一次性标志确保整个页面生命周期内只触发一次「拉取→重渲染」。
      if (!_meFetchStarted) {
        _meFetchStarted = true;
        refreshMe().then(function () { renderTopbar(opts); }).catch(function () {});
      }
    }

    // 管理员入口已收进头像下拉菜单（umuAdmin），顶栏不再单独放置，避免入口冲突。
  }

  function refreshBalance() { return; }

  /* ---------- 登录弹窗（邮箱 + 密码，统一账号） ---------- */
  var _loginCb = null;

  function openLogin(cb) {
    _loginCb = (typeof cb === 'function') ? cb : null;
    closeLogin();
    injectCss();
    var ov = document.createElement('div');
    ov.id = 'swLogin';
    ov.className = 'mg-modal-ov';
    ov.innerHTML =
      '<div id="mgLoginCard" class="mg-modal">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
      '<div style="width:28px;height:28px;border-radius:8px;background:#101216;border:1px solid #24272E;display:flex;align-items:center;justify-content:center;font-weight:500;color:#F4F5F7;font-size:14px;">S</div>' +
      '<span style="font-size:19px;font-weight:500;">开始使用 Storywright</span></div>' +
      '<p class="sub">邮箱 + 密码（≥6 位），注册即用。快速创作免费体验，爆款模板首单免费；按次付费。</p>' +
      '<input id="mgEmail" placeholder="邮箱（如 you@example.com）" style="width:100%;padding:12px;margin-bottom:12px;background:#101216;border:1px solid #24272E;color:#F4F5F7;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;">' +
      '<input id="mgPwd" type="password" placeholder="密码" style="width:100%;padding:12px;margin-bottom:6px;background:#101216;border:1px solid #24272E;color:#F4F5F7;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;">' +
      '<p style="margin:0 0 12px;font-size:12px;color:#A6ACB8;line-height:1.5;">密码是唯一证明您身份的凭证，请妥善保管密码，暂不支持自助找回。若不慎遗忘，可联系客服沟通！！</p>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:14px;font-size:12px;color:#A6ACB8;line-height:1.5;cursor:pointer;">' +
      '<input id="mgAgreeCb" type="checkbox" style="margin-top:2px;flex:0 0 auto;accent-color:#F5A623;">' +
      '<span>我已阅读并同意 <a href="/pages/terms.html" target="_blank" style="color:#F5A623;text-decoration:none;">《用户协议》</a> 与 <a href="/pages/privacy.html" target="_blank" style="color:#F5A623;text-decoration:none;">《隐私政策》</a></span>' +
      '</label>' +
      '<div id="mgErr" class="mg-err"></div>' +
      '<button id="mgSubmit" style="width:100%;padding:13px;background:#F5A623;border:none;color:#0A0B0E;border-radius:8px;cursor:pointer;font-size:15px;font-weight:500;">开始使用</button>' +
      '<a id="mgForgotLink" style="display:block;text-align:center;margin-top:10px;color:#A6ACB8;font-size:12px;text-decoration:none;cursor:pointer;">忘记密码？加客服微信重置</a>' +
      '<button id="mgClose" style="margin-top:10px;width:100%;padding:11px;background:transparent;border:1px solid #24272E;color:#A6ACB8;border-radius:8px;cursor:pointer;font-size:13px;">关闭</button>' +
      '</div>' +
      // 忘记密码引导弹窗（#758）：不提供自助找回，引导加客服企业微信人工重置
      '<div id="mgForgot" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center;">' +
        '<div style="background:#16181D;border:1px solid #24272E;border-radius:12px;padding:22px;width:320px;max-width:90vw;text-align:center;">' +
          '<h3 style="margin:0 0 6px;font-size:16px;font-weight:500;color:#F4F5F7;">忘记密码？</h3>' +
          '<p style="margin:0 0 14px;font-size:13px;color:#A6ACB8;line-height:1.6;">为保障账号安全，Storywright暂不提供自助找回，密码是您身份的唯一凭证。请添加下方企业微信客服，由客服与您沟通处理。</p>' +
          '<img src="/static/img/wxkf_qr.png" alt="客服企业微信二维码" style="width:170px;height:170px;object-fit:cover;border-radius:8px;border:1px solid #24272E;cursor:zoom-in;" onclick="MG.showImgLightbox(\'/static/img/wxkf_qr.png\')" title="点击放大">' +
          '<p style="margin:12px 0 16px;font-size:12px;color:#A6ACB8;">长按或截图保存，用微信扫一扫添加客服</p>' +
          '<button id="mgForgotBack" style="width:100%;padding:11px;background:transparent;border:1px solid #24272E;color:#A6ACB8;border-radius:8px;cursor:pointer;font-size:13px;">返回登录</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var errEl = ov.querySelector('#mgErr');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }

    function submit() {
      var email = ov.querySelector('#mgEmail').value.trim().toLowerCase();
      var pwd = ov.querySelector('#mgPwd').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showErr('请输入有效的邮箱地址'); return; }
      if (pwd.length < 6) { showErr('密码至少 6 位'); return; }
      var agreeCb = ov.querySelector('#mgAgreeCb');
      if (agreeCb && !agreeCb.checked) { showErr('请先阅读并勾选同意用户协议与隐私政策'); return; }
      var btn = ov.querySelector('#mgSubmit');
      btn.disabled = true; btn.textContent = '稍等…';
      api('/api/login', 'POST', { email: email, password: pwd }).then(function (r) {
        if (r.ok) return r;
        return api('/api/register', 'POST', { email: email, password: pwd });
      }).then(function (r) {
        btn.disabled = false; btn.textContent = '登录 / 注册';
        if (!r.ok) { showErr(r.err || '登录失败'); return; }
        setToken(r.token);
        closeLogin();
        if (_loginCb) { var cb = _loginCb; _loginCb = null; cb(); }
        checkUpgrade();   // 仅在完成登录后弹一次升级提示
      });
    }

    ov.querySelector('#mgSubmit').onclick = submit;
    ov.querySelector('#mgPwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    ov.querySelector('#mgClose').onclick = function () { closeLogin(); };
    ov.querySelector('#mgForgotLink').onclick = function () { document.getElementById('mgForgot').style.display = 'flex'; };
    ov.querySelector('#mgForgotBack').onclick = function () { document.getElementById('mgForgot').style.display = 'none'; };
    setTimeout(function () { ov.querySelector('#mgEmail').focus(); }, 80);
  }

  function closeLogin() {
    var ov = document.getElementById('swLogin');
    if (ov) ov.remove();
  }

  // 图片灯箱：点击 img 放大显示，再点/点遮罩/按 Esc 关闭
  function showImgLightbox(src) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px;';
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:min(360px,92vw);max-height:min(360px,92vh);width:auto;height:auto;border-radius:12px;box-shadow:0 12px 50px rgba(0,0,0,.7);background:#fff;';
    ov.appendChild(img);
    ov.onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
    function onKey(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('keydown', onKey);
  }

  /* ============ 版本升级提醒 ============ */
  var SEEN_VER_KEY = 'mg_seen_app_version';
  function versionGt(a, b) {
    var pa = String(a).split('.'), pb = String(b).split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i] || '0', 10) || 0, y = parseInt(pb[i] || '0', 10) || 0;
      if (x !== y) return x > y;
    }
    return false;
  }
  function esc4(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function closeUpgradeModal() {
    var ov = document.getElementById('swUpgrade');
    if (ov) ov.remove();
  }
  function showUpgradeModal(entries) {
    closeUpgradeModal();
    injectCss();
    var body = '';
    entries.forEach(function (e) {
      body += '<div style="margin-bottom:6px;">' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#2DD4A8;">' +
        esc4(e.title || ('版本 ' + e.v)) +
        ' <span style="color:#A6ACB8;font-weight:400;font-size:12px;">' + esc4(e.v) + ' · ' + esc4(e.date || '') + '</span></div>' +
        '<ul style="margin:0;padding-left:18px;color:#A6ACB8;font-size:13px;line-height:1.85;">' +
        (e.items || []).map(function (t) { return '<li>' + esc4(t) + '</li>'; }).join('') +
        '</ul></div>';
    });
    var ov = document.createElement('div');
    ov.id = 'swUpgrade';
    ov.className = 'mg-modal-ov';
    ov.innerHTML =
      '<div class="mg-modal" style="max-width:420px;width:92%;max-height:84vh;display:flex;flex-direction:column;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex:0 0 auto;">' +
      '<div style="width:28px;height:28px;border-radius:8px;background:#101216;border:1px solid #24272E;display:flex;align-items:center;justify-content:center;font-weight:500;color:#F4F5F7;font-size:14px;">S</div>' +
      '<span style="font-size:18px;font-weight:500;">Storywright 近期更新</span></div>' +
      '<div style="overflow-y:auto;margin:2px 0 14px;flex:1 1 auto;-webkit-overflow-scrolling:touch;">' +
      '<p class="sub" style="margin:0 0 12px;">以下是最近一次更新的内容，点「知道了」即可进入。</p>' + body + '</div>' +
      '<button id="mgUpOk" style="width:100%;padding:13px;flex:0 0 auto;background:#F5A623;border:none;color:#0A0B0E;border-radius:8px;cursor:pointer;font-size:15px;font-weight:500;">知道了，进入</button>' +
      '</div>';
    document.body.appendChild(ov);
    var btn = ov.querySelector('#mgUpOk');
    if (btn) btn.onclick = function () {
      try { localStorage.setItem(SEEN_VER_KEY, APP_VERSION); } catch (e) {}
      closeUpgradeModal();
    };
  }
  function checkUpgrade() {
    try {
      if (!MG.isLoggedIn()) return;            // 未登录不弹，登录成功后由 requireLogin 触发
      var seen = localStorage.getItem(SEEN_VER_KEY) || '';
      if (seen === APP_VERSION) return;         // 本版本已看过，不再弹
      // 只展示最近一次版本（CHANGELOG 按时间倒序，第一条即最新）
      var latest = CHANGELOG[0];
      if (!latest) { try { localStorage.setItem(SEEN_VER_KEY, APP_VERSION); } catch (e) {} return; }
      showUpgradeModal([latest]);
    } catch (e) {}
  }

  /* 强制登录入口：未登录时显示登录弹窗，登录成功后执行回调；已登录直接执行。
     两类进入路径都会触发 checkUpgrade —— 既覆盖「本次刚登录」，也覆盖「已登录直接刷新进入」。 */
  function requireLogin(onReady) {
    function enter() {
      if (typeof onReady === 'function') onReady();
    }
    if (isLoggedIn()) { enter(); return; }
    openLogin(enter);
  }

  function currentEmail() {
    var tok = getToken();
    if (!tok) return '';
    try { return atob(tok.split('.')[1] || '') || ''; } catch (e) { return ''; }
  }

  /* 账户档案缓存（nickname / uid / is_admin）：登录后首次 /api/me 拉取，存 localStorage，
     避免每次渲染顶栏都打 /api/me。refreshMe 强制刷新（改昵称后调用）。 */
  var ME_KEY = 'mg_me';
  var _meFetchStarted = false; /* 防止 renderTopbar 内 refreshMe 触发无限重渲染 */
  function _saveMe(m) { try { localStorage.setItem(ME_KEY, JSON.stringify(m || {})); } catch (e) {} }
  function me() {
    try { return JSON.parse(localStorage.getItem(ME_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function refreshMe() {
    if (!MG.isLoggedIn()) { _saveMe({}); return Promise.resolve({}); }
    return MG.api('/api/me').then(function (r) {
      if (r.ok) {
        var m = { email: r.email || '', nickname: r.nickname || '', uid: r.uid || '', avatar: r.avatar || '', is_admin: !!r.is_admin, free_understand_used: !!r.free_understand_used };
        _saveMe(m);
        return m;
      }
      return me();
    }).catch(function () { return me(); });
  }

  function logout() {
    MG.api('/api/logout', 'POST').then(function () {}).catch(function () {});
    setToken('');
    _saveMe({});
    location.href = '/index.html';
  }

  /* ---------- 充值弹窗 ---------- */
  var RECHARGE_PACKAGES = [
    { amount: 30 },
    { amount: 100 },
    { amount: 300 },
    { amount: 1000 },
  ];

  function openRecharge() {
    if (!MG.isLoggedIn()) { MG.openLogin(function () { openRecharge(); }); return; }
    injectCss();
    var me = MG.me() || {};
    var ov = document.createElement('div');
    ov.id = 'mgRecharge';
    ov.className = 'mg-modal-ov';
    var pkgs = RECHARGE_PACKAGES.map(function (p) {
      return '<div class="mg-rc-pkg" data-amt="' + p.amount + '">' +
        '<div class="amt">¥' + p.amount + '</div></div>';
    }).join('');
    ov.innerHTML =
      '<div class="mg-modal mg-rc-modal">' +
      '<div class="mg-rc-head">' +
      '  <h3>账户与计费说明</h3>' +
      '  <div class="mg-rc-balance">当前余额<b id="mgRBal">' + (me.balance != null ? Number(me.balance).toFixed(2) : '—') + '</b></div>' +
      '</div>' +
      '<div id="mgRechargeBody">' +
        '<div class="mg-rc-fee">' +
          '<div class="mg-rc-fee-title">充值说明</div>' +
          '<p>Storywright所有生成任务均调用 可灵、万相、百炼、火山、豆包、DeepSeek 等第三方大模型，你账户里的余额按每次实际调用量实时结算给大模型厂商，Storywright仅按 API 成本计价。充值后实时到账，未消费部分可随时申请退款。</p>' +
        '</div>' +
        '<div class="mg-rc-label">选择充值套餐</div>' +
        '<div class="mg-rc-pkgs">' + pkgs + '</div>' +
        '<div class="mg-rc-custom">' +
          '<label>自定义充值金额</label>' +
          '<div class="mg-rc-cwrap">' +
            '<span class="mg-rc-csign">¥</span>' +
            '<input id="mgRCustom" type="number" min="1" max="50000" placeholder="输入 1-50000">' +
          '</div>' +
        '</div>' +
        '<button id="mgRPayBtn" class="mg-rc-paybtn">微信扫码充值</button>' +
        '<div class="mg-rc-guard">' +
          '<div class="mg-rc-qr"><img src="/static/img/wxkf_qr.png" alt="Storywright客服" style="cursor:zoom-in;" onclick="MG.showImgLightbox(\'/static/img/wxkf_qr.png\')" title="点击放大"></div>' +
          '<div class="mg-rc-guard-text">' +
            '<b>随时退款 · 人工客服</b>' +
            '<p>充值后不想用了、算错账、或需要开票，扫码加Storywright客服微信，未消费余额随时全额退款。</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<button id="mgRClose" class="mg-btn" style="width:100%;margin-top:14px;">关闭</button>' +
      '</div>';
    document.body.appendChild(ov);

    var selectedAmt = null;
    var pkgEls = ov.querySelectorAll('.mg-rc-pkg');
    var payBtn = ov.querySelector('#mgRPayBtn');
    var customInput = ov.querySelector('#mgRCustom');

    function setSelected(amt, fromInput) {
      selectedAmt = amt;
      pkgEls.forEach(function (el) {
        el.classList.toggle('sel', !fromInput && Number(el.getAttribute('data-amt')) === amt);
      });
    }

    pkgEls.forEach(function (el) {
      el.onclick = function () {
        var amt = Number(el.getAttribute('data-amt'));
        setSelected(amt, false);
        customInput.value = '';
      };
    });

    function readCustom() {
      var v = customInput.value.trim();
      if (!v) return null;
      var n = Number(v);
      if (!isFinite(n) || n < 1 || n > 50000) return null;
      return Math.round(n * 100) / 100;
    }

    customInput.oninput = function () {
      var n = readCustom();
      setSelected(n, true);
    };
    customInput.onkeydown = function (e) { if (e.key === 'Enter') doPay(); };

    function doPay() {
      if (!selectedAmt || selectedAmt <= 0) {
        toast('请选择套餐或输入自定义金额');
        customInput.focus();
        return;
      }
      startWechatRecharge(selectedAmt, ov);
    }
    if (payBtn) payBtn.onclick = doPay;

    ov.querySelector('#mgRClose').onclick = function () { ov.remove(); };

    MG.api('/api/balance').then(function (r) {
      var b = document.getElementById('mgRBal');
      if (b && r && r.ok) b.textContent = Number(r.balance || 0).toFixed(2);
    }).catch(function () {});
  }

  function startWechatRecharge(amt, ov) {
    var body = ov.querySelector('#mgRechargeBody');
    MG.api('/api/recharge/wechat', 'POST', { amount: amt }).then(function (r) {
      if (!r.ok) {
        toast((r.err || '下单失败') + '（上线前可临时用后台补余额）');
        return;
      }
      var qr = r.qr || '';
      var html = '<div class="mg-rc-wx">' +
        '<div class="mg-rc-wx-amt">应付 ¥' + r.amount + '<span class="bon">到账本金 ¥' + r.amount + '</span></div>' +
        (qr ? '<img class="mg-rc-wx-qr" src="' + qr + '" alt="微信扫码支付">' : '<div class="mg-rc-wx-code">请使用微信扫一扫：<br><code>' + (r.codeUrl || '') + '</code></div>') +
        '<div class="mg-rc-wx-tip">请用微信扫描上方二维码完成支付，支付成功后自动到账（通常几秒内），无需其他操作</div>' +
        '<div class="mg-rc-wx-status" id="mgWxStatus">等待支付…</div>' +
        '<button class="mg-rc-wx-cancel" id="mgWxCancel">取消支付</button>' +
        '<button class="mg-rc-wx-confirm" id="mgWxConfirm">我已支付，点此确认</button>' +
        '</div>';
      if (body) body.innerHTML = html;
      var cancelled = false;
      var cancelBtn = ov.querySelector('#mgWxCancel');
      if (cancelBtn) cancelBtn.onclick = function () { cancelled = true; ov.remove(); };
      var confirmBtn = ov.querySelector('#mgWxConfirm');
      if (confirmBtn) confirmBtn.onclick = function () {
        confirmBtn.disabled = true; confirmBtn.textContent = '查询中…';
        MG.api('/api/recharge/wechat/confirm', 'POST', { outTradeNo: r.outTradeNo }).then(function (c) {
          if (c && c.ok && c.status === 'paid') {
            succeed(c.amount || r.amount);
            return;
          }
          confirmBtn.disabled = false; confirmBtn.textContent = '我已支付，点此确认';
          var st = ov.querySelector('#mgWxStatus');
          if (st) {
            st.textContent = ((c && c.err) ? c.err : '未查询到支付结果') + '（若已扣款请联系管理员补记，钱不会丢）';
            st.style.color = '#F5A623';
          }
        }).catch(function () {
          confirmBtn.disabled = false; confirmBtn.textContent = '我已支付，点此确认';
        });
      };
      var succeed = function (amt) {
        var st = ov.querySelector('#mgWxStatus');
        if (st) { st.textContent = '支付成功，已到账'; st.style.color = '#2DD4A8'; }
        toast('充值成功：到账本金 ¥' + amt);
        refreshBalance();
        setTimeout(function () { ov.remove(); }, 900);
      };
      var poll = function () {
        if (cancelled) return;
        // 双通道：① 本地订单状态（微信回调到达后秒变 paid）
        MG.api('/api/order/' + r.outTradeNo).then(function (o) {
          if (cancelled) return;
          if (o && o.ok && o.status === 'paid') { succeed(r.amount); return; }
          // ② 本地未到账时主动向微信核实（自动查单，无需人工点按钮）
          MG.api('/api/recharge/wechat/confirm', 'POST', { outTradeNo: r.outTradeNo }).then(function (c) {
            if (cancelled) return;
            if (c && c.ok && c.status === 'paid') { succeed(c.amount || r.amount); return; }
            setTimeout(poll, 5000);
          }).catch(function () { if (!cancelled) setTimeout(poll, 5000); });
        }).catch(function () { if (!cancelled) setTimeout(poll, 5000); });
      };
      setTimeout(poll, 2500);
    }).catch(function () {
      toast('网络异常，请稍后重试');
    });
  }

  /* ---------- 右上角头像下拉快捷菜单 ---------- */
  function closeUserMenu() {
    var ov = document.getElementById('mgUserMenu');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _umenuKey);
  }
  function _umenuKey(e) { if (e.key === 'Escape') closeUserMenu(); }

  function openUserMenu(opts) {
    if (!MG.isLoggedIn()) { MG.openLogin(function () { openUserMenu(opts); }); return; }
    injectCss();
    closeUserMenu();
    var me = MG.me();
    var email = me.email || MG.currentEmail();
    var nick = me.nickname || ('创作者' + String(me.uid || '').slice(-4));
    var uid = me.uid || '';
    var ov = document.createElement('div');
    ov.id = 'mgUserMenu';
    ov.className = 'mg-umenu-ov';
    var adminItem = me.is_admin
      ? '<div class="item" id="umuAdmin"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>管理后台</div>' +
        '<div class="item" id="umuReview"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.4-1.4L10 14.2l4.6-4.6L16 11l-6 6z"/></svg>审核台</div>' +
        '<div class="sep"></div>'
      : '';
    ov.innerHTML =
      '<div class="mg-umenu">' +
      '<div class="head" style="cursor:default;">' +
      '<div class="av">S</div>' +
      '<div class="info">' +
      '<div class="nm">本地创作者</div>' +
      '<div class="em">数据只保存在这台电脑</div>' +
      '</div>' +
      '</div>' +
      '<div class="item" id="umuSettings"><svg viewBox="0 0 24 24"><path d="M19.4 13a7.8 7.8 0 000-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1l-.4-2.5H10.1l-.4 2.5a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4L3.6 11a7.8 7.8 0 000 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 001.7 1l.4 2.5h3.8l.4-2.5a7.6 7.6 0 001.7-1l2.4 1 2-3.4-2-1.6zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>设置 · API Key</div>' +
      '<div class="item" id="umuAbout"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>关于 Storywright</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', _umenuKey);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { closeUserMenu(); return; }
    });
    ov.querySelector('#umuSettings').onclick = function () { closeUserMenu(); openSettings(); };
    ov.querySelector('#umuAbout').onclick = function () { closeUserMenu(); if (typeof MG.openHelp === 'function') MG.openHelp(); };
  }

  function openSettings() {
    closeUserMenu();
    injectCss();
    var ov = document.createElement('div');
    ov.id = 'swSettings';
    ov.className = 'mg-modal-ov';
    ov.innerHTML =
      '<div class="mg-modal" style="width:520px;max-width:94%;padding:26px;">' +
      '<div style="font-size:18px;font-weight:700;color:#E8EDF6;margin-bottom:8px;">设置 · API Key</div>' +
      '<div style="font-size:12px;color:#8b98b3;line-height:1.6;margin-bottom:14px;">把你的模型 Key 填在这里，只存在你这台浏览器里，调用时只发往对应服务商，我们收不到。<b style="color:#c9d3e3;">用 DeepSeek（最常用）的话，只填 Key 就够了，下面两项留空。</b></div>' +
      '<label style="display:block;font-size:12px;color:#8b98b3;margin-bottom:6px;">API Key</label>' +
      '<input id="swKey" type="password" placeholder="sk-..." style="width:100%;box-sizing:border-box;padding:11px 12px;background:#070B12;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#E8EDF6;font-size:14px;outline:none;margin-bottom:14px;">' +
      '<label style="display:block;font-size:12px;color:#8b98b3;margin-bottom:6px;">服务商快捷填入（可选，点了就不用手动填下面两项）</label>' +
      '<div id="swProviderRow" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;"></div>' +
      '<label style="display:block;font-size:12px;color:#8b98b3;margin-bottom:6px;">接口地址（留空 = DeepSeek 官方）</label>' +
      '<input id="swBase" placeholder="留空 = https://api.deepseek.com/v1" style="width:100%;box-sizing:border-box;padding:11px 12px;background:#070B12;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#E8EDF6;font-size:14px;outline:none;margin-bottom:14px;">' +
      '<label style="display:block;font-size:12px;color:#8b98b3;margin-bottom:6px;">模型名</label>' +
      '<input id="swModel" placeholder="deepseek-chat" style="width:100%;box-sizing:border-box;padding:11px 12px;background:#070B12;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#E8EDF6;font-size:14px;outline:none;margin-bottom:6px;">' +
      '<div id="swTestMsg" style="font-size:12px;color:#8b98b3;min-height:18px;margin:10px 0;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
      '<button id="swTestBtn" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:#9fb0c9;border-radius:9px;padding:10px 16px;font-size:14px;cursor:pointer;">测试连接</button>' +
      '<button id="swSaveBtn" style="background:#F5A623;color:#0A0B0E;border:none;border-radius:9px;padding:10px 18px;font-size:14px;font-weight:500;cursor:pointer;">保存</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(ov);
    try {
      document.getElementById('swKey').value = localStorage.getItem('storywright_api_key') || '';
      document.getElementById('swBase').value = localStorage.getItem('storywright_base_url') || '';
      document.getElementById('swModel').value = localStorage.getItem('storywright_model') || '';
    } catch (e) {}
    function val(id) { return document.getElementById(id).value.trim(); }
    function closeSettings() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    /* 服务商快捷填入：一键带出接口地址与模型名，普通用户不用理解 Base URL */
    var PROVIDERS = [
      { name: 'DeepSeek（推荐）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      { name: '智谱', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
      { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      { name: 'Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' }
    ];
    var prow = document.getElementById('swProviderRow');
    PROVIDERS.forEach(function (pv, i) {
      var chip = document.createElement('button');
      chip.textContent = pv.name;
      chip.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);color:#c9d3e3;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;';
      chip.onmouseenter = function () { chip.style.borderColor = 'rgba(245,166,35,0.6)'; };
      chip.onmouseleave = function () { if (!chip._on) chip.style.borderColor = 'rgba(255,255,255,0.14)'; };
      chip.onclick = function () {
        document.getElementById('swBase').value = pv.base;
        document.getElementById('swModel').value = pv.model;
        Array.prototype.forEach.call(prow.children, function (c) { c._on = false; c.style.borderColor = 'rgba(255,255,255,0.14)'; c.style.background = 'rgba(255,255,255,0.05)'; });
        chip._on = true; chip.style.borderColor = '#F5A623'; chip.style.background = 'rgba(245,166,35,0.12)';
        document.getElementById('swKey').focus();
      };
      prow.appendChild(chip);
    });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSettings(); });
    document.getElementById('swSaveBtn').onclick = function () {
      try {
        localStorage.setItem('storywright_api_key', val('swKey'));
        localStorage.setItem('storywright_base_url', val('swBase'));
        localStorage.setItem('storywright_model', val('swModel'));
      } catch (e) {}
      toast('已保存'); closeSettings(); _swKeyBanner();
    };
    document.getElementById('swTestBtn').onclick = function () {
      var msg = document.getElementById('swTestMsg');
      msg.style.color = '#8b98b3'; msg.textContent = '测试中…';
      MG.api('/api/llm', 'POST', {
        messages: [{ role: 'user', content: 'ping' }],
        api_key: val('swKey'), base_url: val('swBase'), model: val('swModel')
      }, 30000).then(function (r) {
        if (r && r.ok) { msg.style.color = '#2DD4A8'; msg.textContent = '连接成功（模型：' + (r.model || '?') + '）'; }
        else if (r && r.noKey) { msg.style.color = '#fca5a5'; msg.textContent = 'Key 为空，先填写 Key。'; }
        else { msg.style.color = '#fca5a5'; msg.textContent = '连接失败：' + ((r && r.error) || '未知'); }
      }).catch(function () { msg.style.color = '#fca5a5'; msg.textContent = '连接失败：网络错误'; });
    };
  }

  function _swKeyBanner() {
    try {
      var existing = document.getElementById('swKeyBanner');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      var k = '';
      try { k = localStorage.getItem('storywright_api_key') || ''; } catch (e) {}
      if (k) return;
      var b = document.createElement('div');
      b.id = 'swKeyBanner';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1b2030;border-top:1px solid #2a3650;color:#c9d3e3;font-size:13px;padding:10px 16px;display:flex;align-items:center;gap:12px;justify-content:center;';
      b.innerHTML = '<span>尚未配置 API Key，生成功能不可用。</span><button id="swKeyBannerBtn" style="background:#F5A623;color:#0A0B0E;border:none;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">去设置</button>';
      document.body.appendChild(b);
      document.getElementById('swKeyBannerBtn').onclick = function () { openSettings(); };
    } catch (e) {}
  }

  function uploadAvatar(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('请选择 PNG/JPG/WEBP 图片'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('图片不能超过 2MB'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var dataUrl = rd.result;
      toast('头像上传中…');
      MG.api('/api/avatar', 'POST', { avatar: dataUrl }).then(function (r) {
        if (r && r.ok) {
          var url = r.avatar || (MG.me() && MG.me().avatar) || '';
          refreshMe().then(function () {
            _applyAvatar(url);
            toast('头像已更新');
          }).catch(function () { _applyAvatar(url); toast('头像已更新'); });
        } else {
          toast('上传失败：' + ((r && r.err) || '未知错误'));
        }
      }).catch(function () { toast('上传失败，网络错误'); });
    };
    rd.onerror = function () { toast('读取图片失败'); };
    rd.readAsDataURL(file);
  }
  function _applyAvatar(url) {
    if (!url) return;
    var a = document.getElementById('mgAvatar');
    if (a) {
      var img = a.querySelector('img');
      if (img) img.src = url;
      else a.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
    }
    var ma = document.getElementById('mgMenuAvatar');
    if (ma) {
      var mi = ma.querySelector('img');
      if (mi) mi.src = url;
      else ma.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
    }
  }
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 统一底部状态栏（剧本工作台 / 素材库共用；Storywright编辑器有自己的 .jg-status） ----------
     items: [{id:'stFoo', label:'当前项目', value:'—'}, ...]
     返回一个 set(id, value) 函数，页面拿去更新数值即可。 */
  var STATUSBAR_CSS = '' +
    '.mg-status{position:fixed;left:0;right:0;bottom:var(--mg-footer-height,34px);height:28px;z-index:900;display:flex;align-items:center;' +
    'justify-content:center;gap:18px;padding:0 16px;font-size:11px;color:#5A6B85;background:#0F1420;' +
    'border-top:1px solid rgba(255,255,255,0.07);font-family:inherit;}' +
    '.mg-status b{color:#B8C6DC;font-weight:600;}' +
    '.mg-status .mg-st-build{opacity:.75;}' +
    '@media (max-width:820px){.mg-status{gap:10px;font-size:10px;}}' +
    'body.mg-has-status{padding-bottom:calc(28px + var(--mg-footer-height,34px));}';

  function mountStatusBar(items, pageName) {
    if (!document.getElementById('mgStatusCss')) {
      var st = document.createElement('style');
      st.id = 'mgStatusCss';
      st.textContent = STATUSBAR_CSS;
      document.head.appendChild(st);
    }
    var old = document.getElementById('mgStatusBar');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.className = 'mg-status';
    bar.id = 'mgStatusBar';
    bar.innerHTML = (items || []).map(function (it) {
      return '<span>' + it.label + ' <b id="' + it.id + '">' + (it.value === undefined ? '—' : it.value) + '</b></span>';
    }).join('') +
      '<span class="mg-st-build">Storywright · ' + (pageName || '') + '</span>';
    document.body.appendChild(bar);
    document.body.classList.add('mg-has-status');
    return function set(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = (value === undefined || value === null || value === '') ? '—' : value;
    };
  }

  /* 暴露全局 */
  /* ---------- 音色库（声音与锁脸同构：角色板一等公民） ----------
     来源：百炼 qwen-audio-3.0-tts-flash 官方系统音色（中文），已实测可用。
     flash 模型官方系统音色仅这 9 个；所谓「几百种」来自基础克隆音色（500+）+ 声音复刻（免费，阶段二）
     + 火山预设（阶段五），后续都通过 openVoicePicker 的 extra 注入同一个弹窗，前端不重复写死。 */
  var VOICE_CATALOG = [
    { id:'longanhuan_v3.6',   name:'龙安欢',   gender:'女',   age:25, trait:'知性温和', provider:'baiyan', type:'system' },
    { id:'longanfengyue',     name:'龙安风悦', gender:'女',   age:30, trait:'自然亲切', provider:'baiyan', type:'system' },
    { id:'longanyuanfei',     name:'龙安元妃', gender:'女',   age:30, trait:'高傲御姐', provider:'baiyan', type:'system' },
    { id:'longanlingxi',      name:'龙安灵希', gender:'女',   age:25, trait:'可爱甜美', provider:'baiyan', type:'system' },
    { id:'longanxiaoxin',     name:'龙安小昕', gender:'女',   age:22, trait:'活泼灵动', provider:'baiyan', type:'system' },
    { id:'longchuanshu_v3.6', name:'龙川蜀',   gender:'男',   age:40, trait:'中年川普', provider:'baiyan', type:'system' },
    { id:'longjielidou_v3.6', name:'龙杰力豆', gender:'男童', age:5,  trait:'天真男童', provider:'baiyan', type:'system' },
    { id:'longpaopao_v3.6',   name:'龙泡泡',   gender:'女童', age:5,  trait:'软萌女童', provider:'baiyan', type:'system' },
    { id:'longhuohuo_v3.6',   name:'龙火火',   gender:'男童', age:8,  trait:'调皮男孩', provider:'baiyan', type:'system' },
    { id:'qwen-audio-3.0-tts-plus-longanlingxin', name:'龙安灵心·旗舰', gender:'女', age:28, trait:'知性旗舰·plus免费额度', provider:'baiyan', type:'system', free:true }
  ];
  var VOICE_MAP = {};
  VOICE_CATALOG.forEach(function (v) { VOICE_MAP[v.id] = v; });

  // 火山（豆包）语音合成大模型 2.0 预设音色（阶段五）。id 以 volcano: 前缀，后端 _tts_dispatch 路由到 v3 接口。
  // 注意：2.0 仅支持 *_uranus_bigtts 结尾的音色（seed-tts-2.0 资源）。老年音色公开预设目前只有"婆婆"（老年女性）。
  var VOICE_VOLCANO = [
    { id: 'volcano:zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0', gender: '女', age: 28, trait: '通用·爽快利落', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: '女', age: 26, trait: '多语种多方言·通用', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_xiaohe_uranus_bigtts', name: '小何 2.0', gender: '女', age: 25, trait: '甜美活泼·通用', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_qingxinnvsheng_uranus_bigtts', name: '清新女声 2.0', gender: '女', age: 24, trait: '干净清新', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_cancan_uranus_bigtts', name: '知性灿灿 2.0', gender: '女', age: 27, trait: '知性·角色扮演', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_tianmeixiaoyuan_uranus_bigtts', name: '甜美小源 2.0', gender: '女', age: 23, trait: '甜美·通用', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_kefunvsheng_uranus_bigtts', name: '暖阳女声 2.0', gender: '女', age: 30, trait: '客服·温柔', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_popo_uranus_bigtts', name: '婆婆 2.0', gender: '女', age: 65, trait: '老年女性·亲切', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_xiaoxue_uranus_bigtts', name: '儿童绘本 2.0', gender: '女', age: 8, trait: '童声·有声阅读', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: '男', age: 30, trait: '清爽沉稳·通用', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_taocheng_uranus_bigtts', name: '小天 2.0', gender: '男', age: 28, trait: '清爽磁性·通用', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_liufei_uranus_bigtts', name: '刘飞 2.0', gender: '男', age: 32, trait: '通用·指令遵循', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_jieshuoxiaoming_uranus_bigtts', name: '解说小明 2.0', gender: '男', age: 35, trait: '视频解说', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_cixingjieshuonan_uranus_bigtts', name: '磁性解说男声 2.0', gender: '男', age: 38, trait: '磁性·解说', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_baqiqingshu_uranus_bigtts', name: '霸气青叔 2.0', gender: '男', age: 45, trait: '霸气·有声阅读', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_xuanyijieshuo_uranus_bigtts', name: '悬疑解说 2.0', gender: '男', age: 40, trait: '悬疑·解说', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_naiqimengwa_uranus_bigtts', name: '奶气萌娃 2.0', gender: '男', age: 6, trait: '男童声', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_tiancaitongsheng_uranus_bigtts', name: '天才童声 2.0', gender: '男', age: 7, trait: '男童声·角色', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_qingcang_uranus_bigtts', name: '擎苍 2.0', gender: '男', age: 35, trait: '角色扮演·沧桑', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_wuzetian_uranus_bigtts', name: '武则天 2.0', gender: '女', age: 40, trait: '角色扮演·威严', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_tangseng_uranus_bigtts', name: '唐僧 2.0', gender: '男', age: 45, trait: '角色扮演', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_sunwukong_uranus_bigtts', name: '猴哥 2.0', gender: '男', age: 30, trait: '角色扮演·活泼', provider: 'volcano', type: 'preset' },
    { id: 'volcano:en_female_dacey_uranus_bigtts', name: 'Dacey', gender: '女', age: 28, trait: '美式英语', provider: 'volcano', type: 'preset' },
    { id: 'volcano:en_male_tim_uranus_bigtts', name: 'Tim', gender: '男', age: 30, trait: '美式英语', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_sajiaoxuemei_uranus_bigtts', name: '撒娇学妹 2.0', gender: '女', age: 22, trait: '撒娇·活泼', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0', gender: '女', age: 23, trait: '甜美·可爱', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0', gender: '男', age: 18, trait: '少年·清朗', provider: 'volcano', type: 'preset' },
    { id: 'volcano:zh_female_sophie_uranus_bigtts', name: '魅力苏菲 2.0', gender: '女', age: 30, trait: '成熟魅力·多语', provider: 'volcano', type: 'preset' }
  ];

  // 克隆音色（阶段二）持久化：本地 localStorage 作即时渲染快路径，
  // 服务端 accounts.json 作权威副本（换设备 / 清缓存不丢）。自动并入「我的克隆」组。
  var CLONED_VOICE_KEY = 'mg_cloned_voices';
  function getClonedVoices() {
    try { return JSON.parse(localStorage.getItem(CLONED_VOICE_KEY) || '[]'); } catch (e) { return []; }
  }
  function _setClonedVoices(list) {
    try { localStorage.setItem(CLONED_VOICE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  // 与服务端同步。失败一律静默：本地副本仍可用，不打断用户操作。
  function _syncCloneToServer(action, payload, cb) {
    try {
      if (!api) { if (cb) cb(null); return; }
      var body = { action: action };
      if (payload && payload.id) body.id = payload.id;
      if (payload && payload.voice) body.voice = payload.voice;
      api('/api/my_cloned_voices', 'POST', body).then(function (r) {
        if (cb) cb(r && r.ok ? (r.list || null) : null);
      }, function () { if (cb) cb(null); });
    } catch (e) { if (cb) cb(null); }
  }
  function addClonedVoice(v) {
    if (!v || !v.id) return;
    var list = getClonedVoices().filter(function (x) { return x.id !== v.id; });
    list.push(v);
    _setClonedVoices(list);
    _syncCloneToServer('add', { voice: v });
  }
  function clearClonedVoice(id) {
    _setClonedVoices(getClonedVoices().filter(function (x) { return x.id !== id; }));
    _syncCloneToServer('remove', { id: id });
  }
  // 登录后从账号拉取并合并：服务端为权威，本地独有的（离线期间克隆的）回填上去。
  function fetchClonedVoices(cb) {
    _syncCloneToServer('list', null, function (list) {
      if (!list) { if (cb) cb(getClonedVoices()); return; }
      var merged = list.slice();
      var have = {};
      merged.forEach(function (x) { if (x && x.id) have[x.id] = 1; });
      getClonedVoices().forEach(function (x) {
        if (x && x.id && !have[x.id]) { merged.push(x); _syncCloneToServer('add', { voice: x }); }
      });
      _setClonedVoices(merged);
      if (cb) cb(merged);
    });
  }

  function voiceLabel(id) {
    if (!id) return '';
    var v = VOICE_MAP[id];
    if (v) return (v.gender + '声 · ' + v.name + '（' + v.trait + '）');
    if (id.indexOf('volcano:') === 0) return '火山预设 · ' + id.slice('volcano:'.length);
    if (id.indexOf('qwen-audio-3.0-tts-plus-') === 0) return '百炼旗舰·免费（' + id.slice('qwen-audio-3.0-tts-plus-'.length) + '）';
    if (id.indexOf('qwen-audio-3.0-tts-flash-') === 0) return '我的复刻声（' + id.slice('qwen-audio-3.0-tts-flash-'.length) + '）';
    // 复刻音色现由 CosyVoice enrollment 产出，形如 cosyvoice-v3-plus-<prefix>-<hash>
    if (id.indexOf('cosyvoice-') === 0) {
      var tail = id.slice('cosyvoice-'.length).split('-');
      return '我的复刻声（' + (tail[2] || tail[0] || id) + '）';
    }
    return id;
  }

  var _voiceCssInjected = false;
  var VOICE_CSS = '' +
    '.vp-modal{max-width:560px;width:92%;max-height:82vh;display:flex;flex-direction:column;}' +
    '.vp-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);}' +
    '.vp-head h3{margin:0;font-size:15px;color:#eaf1ff;}' +
    '.vp-clear{margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--t4,#8b98b3);' +
    'font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer;}' +
    '.vp-clear:hover{border-color:rgba(245,166,35,0.5);color:#F5A623;}' +
    '.mg-x{background:transparent;border:none;color:#8b98b3;font-size:20px;cursor:pointer;line-height:1;}' +
    '.vp-search{padding:10px 16px;}' +
    '.vp-search input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);' +
    'background:#0d1322;color:#eaf1ff;font-size:13px;}' +
    '.vp-body{overflow:auto;padding:4px 16px 8px;}' +
    '.vp-group{margin-bottom:10px;}' +
    '.vp-gt{font-size:12px;color:#8b98b3;margin:8px 0 6px;font-weight:600;}' +
    '.vp-list{display:flex;flex-direction:column;gap:6px;}' +
    '.vp-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#0d1322;border:1px solid rgba(255,255,255,0.08);' +
    'border-radius:8px;padding:9px 12px;cursor:pointer;color:#eaf1ff;}' +
    '.vp-item:hover{border-color:rgba(45,212,168,0.5);}' +
    '.vp-item.on{border-color:#2DD4A8;background:rgba(45,212,168,0.08);}' +
    '.vp-dot{width:8px;height:8px;border-radius:50%;flex:none;}' +
    '.vp-dot.f{background:#F5A623;}' + '.vp-dot.m{background:#5AA0FF;}' +
    '.vp-name{font-size:13px;font-weight:600;}' +
    '.vp-meta{font-size:12px;color:#8b98b3;}' +
    '.vp-cur{margin-left:auto;font-size:11px;color:#2DD4A8;}' +
    '.vp-foot{padding:10px 16px;font-size:11px;color:#8b98b3;border-top:1px solid rgba(255,255,255,0.08);line-height:1.6;}' +
    '.vp-clone{margin-top:8px;width:100%;background:#F5A623;border:none;color:#0A0B0E;' +
    'font-weight:500;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;}' +
    '.vp-clone:hover{background:#FFB84D;}' +
    '.vp-item{position:relative;}' +
    '.vp-prev{margin-left:10px;background:#16203a;border:1px solid rgba(45,212,168,0.4);color:#2DD4A8;' +
    'font-size:11px;padding:4px 9px;border-radius:6px;cursor:pointer;white-space:nowrap;}' +
    '.vp-prev:hover{border-color:#2DD4A8;background:rgba(45,212,168,0.12);}' +
    '.vp-prev:disabled{opacity:.5;cursor:default;}' +
    '.vp-free{margin-left:6px;font-size:10px;color:#2DD4A8;border:1px solid rgba(45,212,168,0.45);border-radius:8px;padding:0 6px;}';

  function openVoicePicker(opts) {
    opts = opts || {};
    var cur = opts.current || '';
    var extra = opts.extra || [];
    var onPick = opts.onPick || function () {};
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    if (!_voiceCssInjected) {
      var st = document.createElement('style'); st.textContent = VOICE_CSS; document.head.appendChild(st);
      _voiceCssInjected = true;
    }
    var ov = document.createElement('div');
    ov.className = 'mg-modal-ov';
    ov.id = 'mgVoicePicker';
    function rows(list) {
      return list.map(function (v) {
        var free = v.free ? '<span class="vp-free">免费</span>' : '';
        return '<div class="vp-item' + (v.id === cur ? ' on' : '') + '" data-id="' + esc(v.id) + '">' +
          '<span class="vp-dot ' + esc((v.gender === '男' || v.gender === '男童') ? 'm' : 'f') + '"></span>' +
          '<span class="vp-name">' + esc(v.name) + free + '</span>' +
          '<span class="vp-meta">' + esc(v.gender) + ' · ' + esc(String(v.age)) + '岁 · ' + esc(v.trait || '') + '</span>' +
          (v.id === cur ? '<span class="vp-cur">当前</span>' : '') +
          '<button type="button" class="vp-prev" data-prev="' + esc(v.id) + '">▶ 试听</button>' +
        '</div>';
      }).join('');
    }
    function previewVoice(voiceId) {
      if (!voiceId) return;
      var btn = ov.querySelector('.vp-prev[data-prev="' + voiceId + '"]');
      if (btn) { btn.disabled = true; btn.textContent = '…生成中'; }
      MG.api('/api/voice_preview', 'POST', { voice: voiceId, text: '你好，这是一段配音试听，方便你挑选合适的音色。' }, 60000)
        .then(function (r) {
          if (btn) { btn.disabled = false; btn.textContent = '▶ 试听'; }
          if (r && r.ok && r.url) {
            try { (new Audio(r.url)).play().catch(function () {}); } catch (e) {}
          } else {
            MG.toast('试听失败：' + ((r && r.err) || '未知'));
          }
        })
        .catch(function (e) {
          if (btn) { btn.disabled = false; btn.textContent = '▶ 试听'; }
          MG.toast('试听请求出错：' + (e && e.message ? e.message : e));
        });
    }
    var all = VOICE_CATALOG.concat(extra);
    var groups = {
      '女声': all.filter(function (v) { return v.gender === '女'; }),
      '男声': all.filter(function (v) { return v.gender === '男'; }),
      '童声': all.filter(function (v) { return v.gender === '男童' || v.gender === '女童'; })
    };
    if (extra && extra.length) groups['我的克隆'] = extra;
    if (VOICE_VOLCANO && VOICE_VOLCANO.length && opts.showVolcano !== false) groups['火山预设'] = VOICE_VOLCANO;
    var body = '';
    Object.keys(groups).forEach(function (g) {
      if (!groups[g].length) return;
      body += '<div class="vp-group"><div class="vp-gt">' + esc(g) + '</div><div class="vp-list">' + rows(groups[g]) + '</div></div>';
    });
    var cloneBtn = (opts.allowClone !== false)
      ? '<button type="button" class="vp-clone" id="vpClone">🎙 上传 10–20 秒样本，复刻专属声音</button>'
      : '';
    ov.innerHTML =
      '<div class="mg-modal vp-modal">' +
      '<div class="vp-head"><h3>选择配音音色</h3>' +
      '<button class="vp-clear" data-id="">清除（用旁白默认声线）</button>' +
      '<button class="mg-x" id="vpClose">×</button></div>' +
      '<div class="vp-search"><input id="vpSearch" placeholder="搜索音色名 / 特质（如 御姐、川普、清新）"/></div>' +
      '<div class="vp-body" id="vpBody">' + body + '</div>' +
      '<div class="vp-foot">声音像锁脸一样是角色的一等公民：在此绑定后，该角色在全片对白自动用这个声线对口型。' +
      '「我的克隆」是你上传样本复刻的声线；「火山预设」需配置火山语音凭证后生效。' + cloneBtn + '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('.vp-item').forEach(function (el) {
      var v = VOICE_MAP[el.getAttribute('data-id')] || (extra.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0]);
      if (v) el.setAttribute('data-search', (v.name + ' ' + (v.trait || '') + ' ' + v.gender).toLowerCase());
      el.onclick = function (e) {
        if (e.target && e.target.closest && e.target.closest('.vp-prev')) { previewVoice(el.getAttribute('data-id')); return; }
        var id = el.getAttribute('data-id');
        try { ov.remove(); } catch (e2) {}
        onPick(id);
      };
    });
    ov.querySelector('.vp-clear').onclick = function () { try { ov.remove(); } catch (e) {} onPick(''); };
    ov.querySelector('#vpClose').onclick = function () { try { ov.remove(); } catch (e) {} };
    var cloneEl = ov.querySelector('#vpClone');
    if (cloneEl) cloneEl.onclick = function () { startVoiceClone(ov, onPick); };
    ov.onclick = function (e) { if (e.target === ov) { try { ov.remove(); } catch (e) {} } };
    var sInp = ov.querySelector('#vpSearch');
    if (sInp) sInp.oninput = function () {
      var q = sInp.value.trim().toLowerCase();
      ov.querySelectorAll('.vp-item').forEach(function (el) {
        var txt = (el.getAttribute('data-search') || '').toLowerCase();
        el.style.display = (!q || txt.indexOf(q) >= 0) ? '' : 'none';
      });
    };
  }

  // 上传 10~20s 音频样本 → /api/upload 落地 → /api/voice_clone 复刻 → 存入本地克隆库并选中。
  // 复刻出的 voice id（qwen-audio-3.0-tts-flash-*）与系统音色同模型，角色绑后全片对口型。
  function startVoiceClone(closeModal, onPick) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { MG.toast('样本过大，请控制在 10MB / 20 秒内'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var ext = (f.name.split('.').pop() || 'wav').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].indexOf(ext) < 0) ext = 'wav';
        var name = (f.name || 'voice').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'voice';
        MG.toast('正在上传样本…');
        MG.api('/api/upload', 'POST', { b64: (dataUrl.split(',')[1] || ''), ext: ext }, 60000).then(function (up) {
          if (!up || !up.ok || !up.url) { MG.toast('样本上传失败：' + ((up && up.err) || '未知')); return; }
          MG.toast('正在复刻声音（约 10~20 秒样本，通常几秒）…');
          MG.api('/api/voice_clone', 'POST', { url: up.url, name: name }, 120000).then(function (r) {
            if (r && r.ok && r.voiceId) {
              addClonedVoice({ id: r.voiceId, name: r.label || name, gender: '', age: '', trait: '复刻音色', provider: 'baiyan', type: 'clone' });
              try { closeModal.remove(); } catch (e) {}
              MG.toast('复刻成功：' + (r.label || r.voiceId));
              onPick(r.voiceId);
            } else {
              MG.toast('复刻失败：' + ((r && r.err) || '未知错误'));
            }
          }).catch(function (e) { MG.toast('复刻请求出错：' + (e && e.message ? e.message : e)); });
        }).catch(function (e) { MG.toast('上传出错：' + (e && e.message ? e.message : e)); });
      };
      reader.readAsDataURL(f);
      setTimeout(function () { try { document.body.removeChild(inp); } catch (e) {} }, 0);
    };
    inp.click();
  }

  /* ---------- 圣经人物 / 场景 合法性校验（显示层自动过滤，脏数据保留在库但不显示） ----------
     人物逻辑与 workbench.html 保持一致（同源判定，避免两套漂移）；场景为新增。
     两文件共用同一份，改动只在此处。 */
  var CHAR_BLACKLIST = /^(核心冲突|反转|主线|概述|简介|旁白|备注|主题|结构|设定说明|内容概要|剧情简介|人物关系|关系图|时间线|世界观设定|背景设定|创作背景|作者|目录|正文|序章|楔子|后记|番外|创作谈|写作计划)$/;
  var NAME_SALUTATIONS = ['爷爷','奶奶','外公','外婆','爸爸','妈妈','伯父','伯母','大伯','二伯','舅舅','舅妈','阿姨','叔叔','婶婶','哥哥','姐姐','弟弟','妹妹','老爷','少爷','公子','姑娘','小姐','夫人','太太','太后','皇上','王爷','将军','大人','先生','公公','婆婆','嫂子','弟妹','表哥','表姐','表弟','表妹','师兄','师姐','师弟','师妹'];
  var NAME_STOPWORDS = ['的','了','着','过','把','让','给','叫','说','道','问','笑','看','走','来','去','对','向','在','从','到','与','和','及','但','而','因','由','并','且','我','你','他','她','它','们','这','那','哪','什','么','怎','很','太','非','一','下','突','忽','猛','都','也','全','就','才','又','再','已','经','被','将','要','会','能','想','知道','觉得','感觉','好像','似乎','什么','怎么'];
  function isValidCharacterName(nm) {
    if (!nm) return false;
    nm = String(nm).trim();
    if (!nm) return false;
    if (CHAR_BLACKLIST.test(nm)) return false;
    if (NAME_SALUTATIONS.indexOf(nm) >= 0) return false;
    // 拉丁字母人名（英文小说）：放开汉字长度上限，但要挡住句子片段
    if (/[A-Za-z]/.test(nm)) {
      if (nm.length < 2 || nm.length > 40) return false;
      if (/[。，！？；：、""''（）()【】\[\]{}]/.test(nm)) return false;   // 带句读 → 是句子不是名字
      if (/\b(the|and|but|with|from|into|said|says|asked|then|when|while|because)\b/i.test(nm)) return false;
      if (!/[A-Za-z]{2}/.test(nm)) return false;                        // 至少两个连续字母
      return true;
    }
    if (nm.length < 2 || nm.length > 8) return false;
    if (!/[一-龥]/.test(nm)) return false;
    for (var i = 0; i < NAME_STOPWORDS.length; i++) {
      if (nm.indexOf(NAME_STOPWORDS[i]) >= 0) return false;
    }
    return true;
  }
  // 场景 = 一个"地点 / 空间"，不是句子、不是序号、不是描述碎片。
  // 早 / 中 / 晚 / 午后等时间变化应作为镜头「光线 / 时间氛围」属性表达（见 jinge SHOT_FIELDS），
  // 而非新建场景名；「林家客厅续」这类延续标记按无效处理。
  var SCENE_JUNK = ['纹路','纹理','排队','蚂蚁','像是','如同','仿佛','一种','一些','几个','无数','一片','满地','到处','一缕','一层','一群','一堆','一块','一条','一张','一辆','一座','一棵','一朵','一道','一束','一旁','一侧','之内','之中','之外','之间','旁边','中间','里面','外面','上方','下方','尽头','角落','模模糊糊','隐隐约约','依稀','模糊'];
  function isValidSceneName(nm) {
    if (!nm) return false;
    nm = String(nm).trim();
    if (!nm) return false;
    if (/^(未命名|无|未知|空|待定|暂无|无场景|同上|同前|无名称|默认场景?|场景|场|镜头|地点|位置|地方|此处)$/.test(nm)) return false;
    if (/^(场景?|场|第\s*[0-9零一二三四五六七八九十百千万]+\s*场?|镜头?\s*[0-9零一二三四五六七八九十]+)$/.test(nm)) return false;
    if (/什么|怎么|怎样|如何|之类|等等|某种|某个|某些|这样|那样/.test(nm)) return false;
    if (/^(像|如|似|仿|仿佛|好似|犹如|看起来|显得)/.test(nm)) return false;
    if (/(似的|一般|一样|般地)$/.test(nm)) return false;
    for (var i = 0; i < SCENE_JUNK.length; i++) { if (nm.indexOf(SCENE_JUNK[i]) >= 0) return false; }
    if (/续$|（续）$|续[0-9一二三四五六七八九十]|[0-9]$|（[0-9]+）$/.test(nm)) return false;
    var core = nm.replace(/[（()】）]/g, '');
    // 拉丁字母场景名（英文小说）："Loading Deck" / "Warehouse" 必须放行
    if (/[A-Za-z]/.test(nm)) {
      if (core.length < 2 || core.length > 60) return false;
      if (/[。，！？；：、""''（）()【】\[\]{}]/.test(nm)) return false;
      if (!/[A-Za-z]{2}/.test(nm)) return false;
      return true;
    }
    if (core.length < 2 || core.length > 14) return false;
    if (!/[一-龥]/.test(nm)) return false;
    return true;
  }
  function filterBibleItems(sec, items) {
    if (!items || !items.length) return items || [];
    var fn = (sec === 'scenes') ? isValidSceneName : isValidCharacterName;
    // _added：故事中枢「AI 找回/补录」追回的对象（尤其爷爷/奶奶等称谓类名字，被 isValidCharacterName 判为非人物），
    // 必须强制显示，与 workbench.html 的 bibleSectionHtml 显示逻辑保持一致，否则会出现「故事中枢可见、锁脸板被静默滤掉」的漂移。
    return items.filter(function (it) { return it && (it._added || fn(it.name)); });
  }

  /* 全站底部合规条：备案号占位 + 合规页入口（后台页不挂） */
  function renderSiteFooter() {
    if (/admin\.html/.test(location.pathname)) return;
    if (document.getElementById('swSiteFooter')) return;
    var f = document.createElement('div');
    f.id = 'swSiteFooter';
    f.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:34px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:12px;color:#6B7280;background:#0A0B0E;border-top:1px solid #24272E;z-index:50;flex-wrap:wrap;padding:0 10px;box-sizing:border-box;';
    f.innerHTML =
      '<span>© 2026 Storywright Contributors</span>' +
      '<span>v' + APP_VERSION + ' · build ' + BUILD + '</span>';
    document.body.appendChild(f);
    document.body.style.paddingBottom = '34px';
    document.documentElement.style.setProperty('--sw-footer-height', '34px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSiteFooter);
  } else {
    renderSiteFooter();
  }

  /* ============ 统一弹窗（替换原生 alert / confirm / prompt 的「临时感」） ============ */
  var MG_MODAL_CSS =
    '.mg-modal-mask{position:fixed;inset:0;background:rgba(4,7,14,0.72);display:none;align-items:center;justify-content:center;z-index:2147483646;padding:20px;}'
    + '.mg-modal-mask.show{display:flex;}'
    + '.mg-modal{width:min(440px,92vw);background:#16181D;border:1px solid #24272E;border-radius:16px;padding:22px 22px 18px;box-shadow:0 18px 60px rgba(0,0,0,0.55);animation:mgmIn .16s ease-out;}'
    + '.mg-modal.wide{width:min(920px,94vw);}'
    + '@keyframes mgmIn{from{opacity:0;transform:translateY(8px) scale(.98);}to{opacity:1;transform:none;}}'
    + '.mg-modal-title{font-size:16px;font-weight:500;color:#F4F5F7;margin-bottom:10px;letter-spacing:.01em;}'
    + '.mg-modal-body{font-size:13.5px;color:#A6ACB8;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto;}'
    + '.mg-modal-input{display:block;width:100%;margin-top:14px;padding:10px 12px;background:#101216;border:1px solid #24272E;border-radius:8px;color:#F4F5F7;font-size:13px;box-sizing:border-box;}'
    + '.mg-modal-input:focus{outline:none;border-color:#F5A623;}'
    + '.mg-modal-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}'
    + '.mg-modal-btns button{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;}'
    + '.mg-modal-ok{background:#F5A623;color:#0A0B0E;border:none;}'
    + '.mg-modal-ok:hover{background:#FFB84D;}'
    + '.mg-modal-cancel{background:transparent;border:1px solid #24272E;color:#A6ACB8;}'
    + '.mg-modal-cancel:hover{border-color:#343845;color:#F4F5F7;}';

  function mgModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = document.getElementById('mgModalMask');
      if (!mask) {
        mask = document.createElement('div');
        mask.id = 'mgModalMask';
        mask.className = 'mg-modal-mask';
        mask.innerHTML =
          '<div class="mg-modal">'
          + '<div class="mg-modal-title"></div>'
          + '<div class="mg-modal-body"></div>'
          + '<input class="mg-modal-input" style="display:none">'
          + '<div class="mg-modal-btns">'
          + '<button class="mg-modal-cancel" style="display:none">取消</button>'
          + '<button class="mg-modal-ok">确定</button>'
          + '</div></div>';
        document.body.appendChild(mask);
        if (!document.getElementById('mgModalStyle')) {
          var st = document.createElement('style');
          st.id = 'mgModalStyle';
          st.textContent = MG_MODAL_CSS;
          document.head.appendChild(st);
        }
      }
      var titleEl = mask.querySelector('.mg-modal-title');
      var bodyEl = mask.querySelector('.mg-modal-body');
      var inputEl = mask.querySelector('.mg-modal-input');
      var okEl = mask.querySelector('.mg-modal-ok');
      var cancelEl = mask.querySelector('.mg-modal-cancel');
      var modalEl = mask.querySelector('.mg-modal');
      titleEl.textContent = opts.title || '提示';
      // html 模式：直接塞一段自包含 HTML（报告类内容）；普通模式仍是纯文本。
      if (opts.html) {
        bodyEl.innerHTML = opts.html;
        bodyEl.style.whiteSpace = 'normal';
        bodyEl.style.padding = '0';
        if (modalEl) modalEl.classList.add('wide');
      } else {
        bodyEl.textContent = opts.body || '';
        bodyEl.style.whiteSpace = '';
        bodyEl.style.padding = '';
        if (modalEl) modalEl.classList.remove('wide');
      }
      if (opts.prompt) {
        inputEl.style.display = '';
        inputEl.value = (opts.input != null) ? opts.input : '';
      } else {
        inputEl.style.display = 'none';
      }
      okEl.textContent = opts.okText || '知道了';
      var hasCancel = !!(opts.confirm || opts.prompt);
      cancelEl.style.display = hasCancel ? '' : 'none';
      cancelEl.textContent = opts.cancelText || '取消';
      function cleanup() { mask.classList.remove('show'); }
      function onOk() { cleanup(); resolve(opts.prompt ? inputEl.value : true); }
      function onCancel() { cleanup(); resolve(opts.prompt ? null : false); }
      okEl.onclick = onOk;
      cancelEl.onclick = onCancel;
      mask.onclick = function (e) { if (e.target === mask && !opts.prompt) onCancel(); };
      inputEl.onkeydown = function (e) { if (e.key === 'Enter') onOk(); };
      mask.classList.add('show');
      if (opts.prompt) inputEl.focus();
    });
  }

  /* ---------- 价格 / 预估（#843 P0-1a 成本透明）---------- */
  // 以服务端 /api/price_info 为唯一数据源（前端价格表从此取数，避免与 server.py 漂移）。
  var _priceInfo = null;
  function _loadPriceInfo() {
    return api('/api/price_info', 'GET').then(function (r) {
      if (r && r.ok) { _priceInfo = r; }
      return r;
    }).catch(function () { return null; });
  }
  // 模型按量预估：qty 语义随计费单位变化
  //  - 出图 / 配音 / 字幕 / BGM / 合成：unit 为 张/次/段，qty 传数量（默认 1）
  //  - 出视频（秒）：unit 为 秒，qty 传时长（秒）
  //  - 出视频（千tokens）：unit 为 千tokens，无法精确预估，返回 byToken=true
  function _estimate(modelId, qty, opts) {
    var src = (_priceInfo && _priceInfo.models) ? _priceInfo.models : null;
    if (!src) return null;
    var m = null;
    for (var i = 0; i < src.length; i++) { if (src[i].id === modelId) { m = src[i]; break; } }
    if (!m) return null;
    if (m.unit === '千tokens') return { ok: true, cost: null, unit: m.unit, model: m, byToken: true };
    var n = (typeof qty === 'number' && qty > 0) ? qty : 1;
    var cost = (typeof m.price === 'number') ? m.price * n : 0;
    return { ok: true, cost: cost, unit: m.unit, model: m, byToken: false };
  }
  function _estimateAIAction(key, wc) {
    if (!_priceInfo || !_priceInfo.aiActions) return null;
    var a = _priceInfo.aiActions[key];
    if (!a) return null;
    if (a.tiers) {
      for (var i = 0; i < a.tiers.length; i++) {
        var t = a.tiers[i];
        if (typeof t.cond === 'string' && /免费/.test(t.cond)) continue;
        if (typeof t.price === 'number') return { ok: true, cost: t.price, unit: t.unit || '次', action: a, byTier: true };
      }
      return { ok: true, cost: 0, unit: (a.tiers[0] && a.tiers[0].unit) || '次', action: a, free: true };
    }
    return { ok: true, cost: (typeof a.price === 'number' ? a.price : 0), unit: a.unit || '次', action: a };
  }
  function _fmtMoney(n) {
    n = (typeof n === 'number') ? n : 0;
    return '¥' + (Math.round(n * 100) / 100).toFixed(2);
  }

  // 缩略图代理封装：站内 /uploads/ 原图经 /api/thumb 压成指定宽度的 JPEG（服务端带缓存），
  // 避免视频工作台一次性下几十张 2MB 整图导致“图片一条条往下走”。远程 / data URL 原样返回。
  function _thumb(u, w) {
    w = w || 480;
    if (!u) return u;
    var m = ('' + u).match(/\/uploads\/[^?#]+/);
    if (!m) return u;
    return '/api/thumb?u=' + encodeURIComponent(m[0]) + '&w=' + w;
  }

  window.MG = {
    BACKEND: BACKEND,
    loadPriceInfo: _loadPriceInfo,
    estimate: _estimate,
    estimateAIAction: _estimateAIAction,
    fmtMoney: _fmtMoney,
    get priceInfo() { return _priceInfo; },
    VOICE_CATALOG: VOICE_CATALOG,
    VOICE_MAP: VOICE_MAP,
    VOICE_VOLCANO: VOICE_VOLCANO,
    voiceLabel: voiceLabel,
    openVoicePicker: openVoicePicker,
    startVoiceClone: startVoiceClone,
    isValidCharacterName: isValidCharacterName,
    isValidSceneName: isValidSceneName,
    filterBibleItems: filterBibleItems,
    getClonedVoices: getClonedVoices,
    addClonedVoice: addClonedVoice,
    clearClonedVoice: clearClonedVoice,
    fetchClonedVoices: fetchClonedVoices,
    BUILD: BUILD,
    APP_VERSION: APP_VERSION,
    CHANGELOG: CHANGELOG,
    checkUpgrade: checkUpgrade,
    mountStatusBar: mountStatusBar,
    api: api,
    thumb: _thumb,
    getToken: getToken,
    setToken: setToken,
    openLogin: openLogin,
    closeLogin: closeLogin,
    isLoggedIn: function () { return !!getToken(); },
    requireLogin: requireLogin,
    currentEmail: currentEmail,
    currentPhone: currentEmail, // 兼容别名（已统一为邮箱）
    openHelp: openHelp,
    renderTopbar: renderTopbar,
    renderSiteFooter: renderSiteFooter,
    refreshBalance: refreshBalance,
    openRecharge: openRecharge,
    openUserMenu: openUserMenu,
    uploadAvatar: uploadAvatar,
    closeUserMenu: closeUserMenu,
    showImgLightbox: showImgLightbox,
    me: me,
    refreshMe: refreshMe,
    logout: logout,
    toast: toast,
    alert: function (body, opts) { return mgModal(Object.assign({ body: body }, opts)); },
    confirm: function (body, opts) { return mgModal(Object.assign({ body: body, confirm: true }, opts)); },
    prompt: function (body, def, opts) { return mgModal(Object.assign({ body: body, prompt: true, input: def }, opts)); },
    modal: mgModal,
  };

  /* 全局替换原生 alert：除管理后台外，所有页面统一走品牌弹窗（confirm / prompt 保留 MG.confirm / MG.prompt 供新代码调用，避免破坏既有同步逻辑） */
  if (!/admin\.html/.test(location.pathname) && typeof window.alert === 'function') {
    var _origAlert = window.alert;
    window.alert = function (m) {
      try { return MG.alert(m); } catch (e) { return _origAlert(m); }
    };
  }

  /* 心跳：登录态下每 30s 上报一次活跃（供管理后台统计在线用户） */
  (function heartbeat() {
    function ping() {
      if (!MG.isLoggedIn()) return;
      MG.api('/api/ping').catch(function () {});
    }
    ping();
    setInterval(ping, 30000);
  })();
})();
