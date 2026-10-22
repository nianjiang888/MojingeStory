#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""continuity_report.py — ShotLock 报告的双语呈现层。

ShotLock 引擎（./shotlock/）是「单一事实源」：规则怎么判、判出什么，
一律由引擎决定，本模块不重写任何判定逻辑。

但引擎的规则文案是中文写死的，Storywright 的英文界面不能直接把中文报告
甩给用户。所以本模块做两件事：

1. 框架层双语：级别标签、规则名、结论（verdict）、报告表头 —— 全部按
   界面语言输出。
2. 逐条 issue 双语：引擎给出的 message / hint 是「中文模板 + 变量」，
   这里用规则化模板表把中文模板换成英文模板，变量原样带过去；变量里若
   混了中文取值（如「黑色」），再过一遍取值词典。

改引擎会让内嵌副本和上游分叉，改前端则无法覆盖 .md / 下载场景，
所以双语放在这一层：引擎管「判什么」，本模块管「怎么说」。

用法：
    from continuity_report import build_report
    rpt = build_report(project_dict, lang="en")
    rpt["html"]   # 可直接塞进前端弹窗的自包含 HTML
    rpt["issues"] # 结构化 issue 列表（前端若要自己渲染可用）
"""

from __future__ import annotations

import re
from html import escape

from shotlock.rules import LEVEL_TEXT, P0, P1, P2, RULE_INDEX

__all__ = ["build_report", "render_html", "translate_issue"]


# ---------------------------------------------------------------- 框架双语表

LEVEL_LABEL = {
    "zh": {P0: "阻断", P1: "严重", P2: "建议"},
    "en": {P0: "Blocker", P1: "Serious", P2: "Suggestion"},
}

RULE_LABEL_EN = {
    "SL001": "Schema integrity",
    "SL002": "Shot duration bounds",
    "SL003": "Dialogue speech rate",
    "SL004": "Character appearance drift",
    "SL005": "Scene continuity",
    "SL006": "Character registration",
    "SL007": "Scene registration",
    "SL008": "Axis crossing",
    "SL009": "Total duration budget",
    "SL010": "Transition abuse",
    "SL011": "Shot size rhythm",
    "SL012": "Emotion monotony",
    "SL013": "Subtitle length",
    "SL014": "Prop flicker",
    "SL015": "Missing establishing shot",
}

# 结论：英文版不翻译引擎的中文 verdict，直接按计数重算，避免直译走样。
VERDICT_EN = {
    "blocked": "Blocked — P0 issues must be fixed first",
    "p1": "Pass (serious items to fix)",
    "p2": "Pass (with suggestions)",
    "clean": "Pass — no issues found",
}

# 变量里可能出现的中文取值 → 英文。用于外貌维度、场景时间/光线等。
VALUE_EN = {
    "发长": "hair length", "短发": "short hair", "长发": "long hair", "束发": "tied hair",
    "发色": "hair color", "黑色": "black", "棕色": "brown", "金色": "blond", "白色": "white",
    "服装色": "clothing color", "深色": "dark", "浅色": "light", "红色": "red", "蓝色": "blue",
    "年龄感": "apparent age", "青年": "young", "中年": "middle-aged", "老年": "elderly",
    "时间": "time", "光线": "lighting", "超出": "over", "不足": "under",
    "旁白": "Narrator",
}


def _tval(s: str) -> str:
    """把字符串里夹带的中文取值换成英文（长的先换，避免「黑色」被「黑色外套」抢先）。"""
    s = str(s or "")
    for k in sorted(VALUE_EN, key=len, reverse=True):
        if k in s:
            s = s.replace(k, VALUE_EN[k])
    return s


# ---------------------------------------------------------------- 逐条模板表
# (中文正则, 英文 message 模板, 英文 hint 模板)
# 捕获组用 {1} {2} 引用（正则里的第一个捕获组 = {1}）。
# 顺序有意义：先匹配更具体的模式。

_MSG_EN = [
    # ---- SL001 结构完整性 ----
    (r"^分镜序列为空，没有任何镜头$",
     "The shot sequence is empty — there are no shots at all",
     "At least one shot is required"),
    (r"^角色表为空，镜头里若有角色将无法校验一致性$",
     "The character list is empty, so character consistency cannot be checked",
     ""),
    (r"^镜头缺少 id$",
     "Shot has no id",
     "The id is the primary key used across stages"),
    (r"^镜头 id 重复：(.*)$",
     r"Duplicate shot id: {1}",
     "Duplicate ids make downstream references overwrite each other"),
    (r"^镜头未指定 scene_id$",
     "Shot does not reference a scene_id",
     ""),
    (r"^景别取值非法：(.*)$",
     r"Illegal shot size: {1}",
     r"Allowed values: {1}"),
    (r"^运镜取值非法：(.*)$",
     r"Illegal camera move: {1}",
     r"Allowed values: {1}"),
    (r"^转场取值非法：(.*)$",
     r"Illegal transition: {1}",
     r"Allowed values: {1}"),
    (r"^情绪标签未收录：(.*)$",
     r"Unrecognised emotion tag: {1}",
     r"Known tags: {1}"),
    (r"^时长缺失或不大于 0$",
     "Duration is missing or not greater than 0",
     "duration_sec must be a positive number"),
    (r"^角色 (.*) 的 screen_dir 取值非法：(.*)$",
     r"Illegal screen_dir for character {1}: {2}",
     r"Allowed values: {2}"),
    (r"^台词缺少 speaker$",
     "Dialogue line has no speaker",
     ""),
    (r"^场景 (.*) 的 int_ext 取值非法：(.*)$",
     r"Illegal int_ext for scene {1}: {2}",
     r"Allowed values: {2}"),
    (r"^角色表存在重复 id$",
     "The character list contains duplicate ids",
     ""),
    (r"^场景表存在重复 id$",
     "The scene list contains duplicate ids",
     ""),

    # ---- SL002 镜头时长 ----
    (r"^镜头时长 ([\d.]+)s 低于下限 ([\d.]+)s，实际不可剪$",
     r"Shot duration {1}s is below the {2}s floor and cannot be cut",
     "Merge it into a neighbouring shot, or extend it past 1.5s"),
    (r"^镜头时长 ([\d.]+)s 超过上限 ([\d.]+)s$",
     r"Shot duration {1}s exceeds the {2}s ceiling",
     "Split it into two shots and put a reaction or insert shot in between"),

    # ---- SL003 台词语速 ----
    (r"^台词 (\d+) 字 / ([\d.]+)s = ([\d.]+) 字每秒，超过上限 ([\d.]+)，配音念不完$",
     r"Dialogue is {1} characters over {2}s = {3} per second, above the {4} limit — the voice actor cannot finish it",
     ""),
    (r"^台词 (\d+) 字 / ([\d.]+)s = ([\d.]+) 字每秒，低于 ([\d.]+)，听着拖$",
     r"Dialogue is {1} characters over {2}s = {3} per second, below the {4} minimum — it drags",
     r"Add to at least {1} characters, or compress the shot to {2}s"),

    # ---- SL004 外貌漂移 ----
    (r"^角色 (.*) 的(.*)漂移：角色表是「(.*)」，本镜头写成了「(.*)」$",
     r"Appearance drift on {1}: the character sheet says {3}, this shot says {4}",
     "Images will drift. Either fix this shot's description or update the character sheet and sync it across the show"),

    # ---- SL005 场景连续性 ----
    (r"^场景 (.*) 的(.*)被改成「(.*)」，与场景表定义的「(.*)」冲突$",
     r"{2} of scene {1} was overridden to {3}, conflicting with the scene sheet value {4}",
     "If time is passing, split it into a new scene"),
    (r"^场景 (.*) 内(.*)在中途跳变：(.*)$",
     r"{2} jumps mid-scene in scene {1}: {3}",
     "Changing time or lighting without a transition pulls the audience out of the scene"),

    # ---- SL006 角色注册 ----
    (r"^镜头引用了未注册角色：(.*)$",
     r"Shot references an unregistered character: {1}",
     "Add that character's appearance definition to the character list so generated images stay consistent"),
    (r"^台词说话人未注册：(.*)$",
     r"Dialogue speaker is not registered: {1}",
     ""),

    # ---- SL007 场景注册 ----
    (r"^镜头引用了未注册场景：(.*)$",
     r"Shot references an unregistered scene: {1}",
     ""),

    # ---- SL008 越轴 ----
    (r"^疑似越轴：(.*) 的画面左右位置在镜头 (.*) → (.*) 之间整体对调$",
     r"Likely axis crossing: the left/right screen positions of {1} are swapped between shots {2} and {3}",
     "Insert a wide or on-axis shot to reset the axis, or set this shot's screen_dir back to the previous shot's"),

    # ---- SL009 总时长预算 ----
    (r"^总时长 ([\d.]+)s，目标 ([\d.]+)s，(超出|不足) ([\d.]+)s（偏差 (\d+)%）$",
     r"Total duration {1}s against a {2}s target — {3} by {4}s (deviation {5}%)",
     r"Keep the deviation within {1}% — the platform splits episodes on that basis"),

    # ---- SL010 转场 ----
    (r"^开场用了 (.*)，短剧开场一般用硬开或淡入$",
     r"The opening shot uses {1}; short-form drama usually opens hard or fades in",
     "Switch it to FADE_IN or CUT"),
    (r"^连续第 (\d+) 个叠化转场，节奏会被拖垮$",
     r"{1} dissolves in a row — the pacing collapses",
     "Reserve dissolves for time jumps; use CUT inside dialogue"),
    (r"^非末尾镜头出现 FADE_OUT，会把剧切断$",
     "A FADE_OUT appears before the last shot and cuts the story off",
     "Change it to CUT or DISSOLVE"),
    (r"^集尾缺少收尾转场$",
     "The episode ends without a closing transition",
     "Use FADE_OUT on the final shot"),

    # ---- SL011 景别节奏 ----
    (r"^连续 (\d+) 个 (.*)，平均单镜 ([\d.]+)s$",
     r"{1} shots in a row at {2}, averaging {3}s each",
     "Break it up with a reverse angle, an insert, or a different shot size"),

    # ---- SL012 情绪单调 ----
    (r"^连续 (\d+) 个镜头情绪都是 (.*)$",
     r"{1} shots in a row share the same emotion ({2})",
     "Change the emotion on one or two shots, or add a reaction shot"),

    # ---- SL013 字幕长度 ----
    (r"^字幕约 (\d+) 字宽，超过建议上限 (\d+)$",
     r"Subtitle is about {1} characters wide, above the recommended limit of {2}",
     "Split it into two subtitles across two shots, or tighten the copy"),

    # ---- SL014 物件闪现 ----
    (r"^角色 (.*) 的「(.*)」在 (.*) 消失、(.*) 又出现$",
     r"{1}'s {2} vanishes in {3} and reappears in {4}",
     "Keep it throughout, or add a shot of the character putting it down or picking it up"),

    # ---- SL015 建置镜头 ----
    (r"^场景「(.*)」首次出现用了 (.*)，没有建置镜头$",
     r"Scene {1} first appears at {2} with no establishing shot",
     "Short-form drama can get away with it, but a WIDE shot on every new scene is safer"),

    # ---- 引擎自身异常 ----
    (r"^规则执行异常：(.*)$",
     r"The rule engine threw an error: {1}",
     "This is an engine bug — please report it"),
]

_HINT_EN = [
    (r"^至少需要一个镜头$", "At least one shot is required"),
    (r"^id 是跨环节引用的主键$", "The id is the primary key used across stages"),
    (r"^重复 id 会让 downstream 覆盖$", "Duplicate ids make downstream references overwrite each other"),
    (r"^duration_sec 必须为正数$", "duration_sec must be a positive number"),
    (r"^合法值：(.*)$", r"Allowed values: {1}"),
    (r"^已收录：(.*)$", r"Known tags: {1}"),
    (r"^出图会串脸。要么改本镜头描述，要么改角色表并同步全剧$",
     "Images will drift. Either fix this shot's description or update the character sheet and sync it across the show"),
    (r"^如果是时间流逝，请拆成新场景$", "If time is passing, split it into a new scene"),
    (r"^插一个全景或骑轴镜头重设轴线，或把本镜头的 screen_dir 改回上一镜的配置$",
     "Insert a wide or on-axis shot to reset the axis, or set this shot's screen_dir back to the previous shot's"),
    (r"^同一场景内无过渡地换时间/光线，观众会出戏$",
     "Changing time or lighting without a transition pulls the audience out of the scene"),
    (r"^在 characters 里补上该角色的外貌定义，出图才能保持一致性$",
     "Add that character's appearance definition to the character list so generated images stay consistent"),
    (r"^合并到相邻镜头，或延长到 1\.5s 以上$",
     "Merge it into a neighbouring shot, or extend it past 1.5s"),
    (r"^拆成两个镜头，中间插 reaction 或 insert$",
     "Split it into two shots and put a reaction or insert shot in between"),
    (r"^砍到 (\d+) 字以内，或把镜头延长到 ([\d.]+)s$",
     r"Cut it to {1} characters or fewer, or extend the shot to {2}s"),
    (r"^加到 (\d+) 字以上，或把镜头压到 ([\d.]+)s$",
     r"Add to at least {1} characters, or compress the shot to {2}s"),
    (r"^把偏差压到 (\d+)% 以内，平台分集时长是按这个切的$",
     r"Keep the deviation within {1}% — the platform splits episodes on that basis"),
    (r"^改成 FADE_IN 或 CUT$", "Switch it to FADE_IN or CUT"),
    (r"^叠化只用于时间跳跃，对话段落用 CUT$", "Reserve dissolves for time jumps; use CUT inside dialogue"),
    (r"^改为 CUT 或 DISSOLVE$", "Change it to CUT or DISSOLVE"),
    (r"^最后一个镜头用 FADE_OUT$", "Use FADE_OUT on the final shot"),
    (r"^中间插入反打、insert 或换景别，打破视觉惯性$",
     "Break it up with a reverse angle, an insert, or a different shot size"),
    (r"^给其中一两个镜头换情绪，或加一个 reaction 镜头$",
     "Change the emotion on one or two shots, or add a reaction shot"),
    (r"^拆成两条字幕分到两个镜头，或精简文案$",
     "Split it into two subtitles across two shots, or tighten the copy"),
    (r"^要么保留到底，要么加一个放下/拿起的动作镜头$",
     "Keep it throughout, or add a shot of the character putting it down or picking it up"),
    (r"^短剧可以省，但换个场景时给一个 WIDE 更稳$",
     "Short-form drama can get away with it, but a WIDE shot on every new scene is safer"),
    (r"^这是引擎的问题，请提 issue$", "This is an engine bug — please report it"),
]

_MSG_COMPILED = [(re.compile(p), m, h) for p, m, h in _MSG_EN]
_HINT_COMPILED = [(re.compile(p), h) for p, h in _HINT_EN]

# 兜底：模板没命中时，把残留中文片段按词典替换；仍残留则标记出来，便于测试发现漏网。
_CJK = re.compile(r"[\u4e00-\u9fff]")


def _fmt(template: str, groups: tuple) -> str:
    """把英文模板里的 {1} {2} 换成捕获组（分组用 _tval 过一遍取值词典）。"""
    out = template
    for i, g in enumerate(groups, start=1):
        out = out.replace("{%d}" % i, _tval(g))
    return out


def _translate_msg(msg: str) -> str:
    for rx, tmpl, _h in _MSG_COMPILED:
        m = rx.match(msg)
        if m:
            return _fmt(tmpl, m.groups())
    # 未命中：词典兜底
    return _tval(msg)


def _translate_hint(hint: str) -> str:
    if not hint:
        return ""
    for rx, tmpl in _HINT_COMPILED:
        m = rx.match(hint)
        if m:
            return _fmt(tmpl, m.groups())
    return _tval(hint)


def translate_issue(issue: dict, lang: str) -> dict:
    """把一条引擎 issue 翻成目标语言（zh 原样，en 走模板表）。"""
    out = dict(issue)
    if lang != "en":
        return out
    out["message"] = _translate_msg(issue.get("message") or "")
    out["hint"] = _translate_hint(issue.get("hint") or "")
    return out


# 数据缺口说明：如实告知哪些规则因 Storywright 分镜没有对应字段而未参与，
# 免得用户以为「没报 = 全过」。
DATA_GAPS = {
    "zh": [
        "转场：分镜没有转场字段，SL010 转场合法性不参与。",
        "左右位置：只有镜头文本里显式写了方位词才判定，SL008 越轴检测覆盖有限。",
        "外貌漂移：SL004 只比对单角色镜头，多角色镜头不比对以免误报。",
        "场景光线：只比对时间档位冲突，同一时间的不同写法不算问题。",
    ],
    "en": [
        "Transitions: shots carry no transition field, so SL010 transition abuse is not evaluated.",
        "Screen direction: only explicit left/right wording in the shot text is read, so SL008 axis crossing has limited coverage.",
        "Appearance drift: SL004 compares single-character shots only, to avoid false positives on multi-character shots.",
        "Scene lighting: only time-of-day conflicts are compared; different wording for the same time is not flagged.",
    ],
}


# ---------------------------------------------------------------- 报告组装

def build_report(project: dict, lang: str = "zh") -> dict:
    """跑引擎 → 组装双语报告 dict（不含 html，html 由 render_html 生成）。"""
    from continuity import project_to_script
    from shotlock import validate
    from shotlock.schema import Script

    spec = project_to_script(project)
    script = Script.from_dict(spec)
    rep = validate(script)

    counts = rep.counts
    if rep.blocked:
        verdict_key = "blocked"
    elif counts[P1] > 0:
        verdict_key = "p1"
    elif counts[P2] > 0:
        verdict_key = "p2"
    else:
        verdict_key = "clean"

    lvl = LEVEL_LABEL.get(lang) or LEVEL_LABEL["zh"]
    issues = []
    for it in rep.issues:
        d = translate_issue(it.to_dict(), lang)
        rid = d.get("rule_id") or ""
        d["level_label"] = lvl.get(d.get("level") or "", d.get("level") or "")
        d["rule_name"] = (RULE_INDEX.get(rid) or rid) if lang != "en" else RULE_LABEL_EN.get(rid, rid)
        issues.append(d)

    if lang == "en":
        verdict = VERDICT_EN[verdict_key]
    else:
        verdict = rep.verdict

    return {
        "ok": True,
        "lang": lang,
        "title": script.title or ("" if lang == "en" else "未命名"),
        "verdict": verdict,
        "verdict_key": verdict_key,
        "blocked": rep.blocked,
        "counts": {lvl[P0]: counts[P0], lvl[P1]: counts[P1], lvl[P2]: counts[P2]},
        "counts_by_level": {P0: counts[P0], P1: counts[P1], P2: counts[P2]},
        "total_duration_sec": round(script.total_duration, 1),
        "target_duration_sec": round(script.target_duration, 1),
        "shot_count": len(script.shots),
        "character_count": len(script.characters),
        "scene_count": len(script.scenes),
        "ran_rules": rep.ran_rules,
        "data_gaps": DATA_GAPS.get(lang) or DATA_GAPS["zh"],
        "issues": issues,
    }


# ---------------------------------------------------------------- HTML 渲染

_CSS = (
    "max-width:880px;margin:0 auto;background:#14161A;border:1px solid #24272E;"
    "border-radius:12px;padding:26px;font-family:-apple-system,BlinkMacSystemFont,"
    "'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6;color:#E8EAED"
)

_BADGE = {
    "P0": ("#FF8A8A", "rgba(163,45,45,0.22)"),
    "P1": ("#F0B95C", "rgba(133,79,11,0.26)"),
    "P2": ("#7FB3E8", "rgba(24,95,165,0.26)"),
}


def render_html(rpt: dict) -> str:
    """把 build_report 的结果渲染成自包含 HTML（可直接塞进弹窗）。"""
    lang = rpt.get("lang") or "zh"
    en = lang == "en"
    L = {
        "shots": "Shots / Characters / Scenes",
        "duration": "Total / Target",
        "verdict": "Verdict",
        "dist": "Issue distribution",
        "none": "No issues found.",
        "empty": "No shots to check yet — generate shots in step 5 first.",
        "footer": "ShotLock · structured shot-script validation engine · ShotSpec v0.1",
        "level": "Level",
        "gaps": "Data coverage",
    }
    if not en:
        L = {
            "shots": "镜头 / 角色 / 场景",
            "duration": "总时长 / 目标",
            "verdict": "结论",
            "dist": "问题分布",
            "none": "没有发现问题。",
            "empty": "还没有分镜可查——先去步骤⑤生成分镜。",
            "footer": "ShotLock · 分镜脚本结构化规范与一致性校验引擎 · ShotSpec v0.1",
            "level": "级别",
            "gaps": "数据覆盖说明",
        }

    c = rpt.get("counts_by_level") or {}
    vcolor = "#FF7A7A" if rpt.get("blocked") else ("#F0B95C" if c.get("P1") else "#A9D46A")
    lv = LEVEL_LABEL.get(lang) or LEVEL_LABEL["zh"]

    rows = []
    grouped = {}
    for it in rpt.get("issues") or []:
        grouped.setdefault(it.get("rule_id") or "", []).append(it)
    for rid in sorted(grouped):
        items = grouped[rid]
        cells = []
        for it in items:
            fg, bg = _BADGE.get(it.get("level") or "P2", _BADGE["P2"])
            badge = (f'<span style="display:inline-block;padding:1px 8px;border-radius:4px;'
                     f'font-size:12px;color:{fg};background:{bg}">{escape(it.get("level") or "")} '
                     f'{escape(it.get("level_label") or "")}</span>')
            hint = (f'<div style="margin-top:4px;color:#8A90A0;font-size:12px">→ {escape(it.get("hint") or "")}</div>'
                    if it.get("hint") else "")
            cells.append(
                f'<tr><td style="padding:8px 10px;border-bottom:1px solid #23262C;'
                f'vertical-align:top;white-space:nowrap;font-family:Consolas,monospace;font-size:12px">'
                f'{escape(it.get("shot_id") or "")}</td>'
                f'<td style="padding:8px 10px;border-bottom:1px solid #23262C">'
                f'{escape(it.get("message") or "")}{hint}</td></tr>'
            )
        rows.append(
            f'<div style="margin:18px 0 0">'
            f'<div style="font-size:14px;font-weight:500;margin-bottom:6px">'
            f'{badge} &nbsp;{escape(rid)} {escape(items[0].get("rule_name") or "")} '
            f'<span style="color:#6E7480;font-size:12px">({len(items)})</span></div>'
            f'<table style="width:100%;border-collapse:collapse;font-size:13px">{"".join(cells)}</table>'
            f'</div>'
        )

    body = ("".join(rows) if rows else
            '<div style="padding:16px;background:rgba(59,109,17,0.18);border-radius:8px;color:#A9D46A">'
            + escape(L["none"]) + '</div>')

    gaps = rpt.get("data_gaps") or []
    if gaps:
        gap_li = "".join(f"<li>{escape(g)}</li>" for g in gaps)
        gap_html = (
            '<div style="margin-top:18px;padding:12px 14px;background:rgba(133,79,11,0.18);'
            'border-radius:8px;font-size:12px;color:#F0B95C">'
            f'<div style="font-weight:600;margin-bottom:4px">{escape(L["gaps"])}</div>'
            f'<ul style="margin:0;padding-left:18px">{gap_li}</ul></div>'
        )
    else:
        gap_html = ""

    tgt = rpt.get("target_duration_sec") or 0
    total = rpt.get("total_duration_sec") or 0
    dur_txt = f"{total:.1f}s" + (f" / {tgt:.1f}s" if tgt > 0 else "")

    return (
        f'<div style="{_CSS}">'
        f'<div style="font-size:13px;color:#6E7480;letter-spacing:.05em">SHOTLOCK CONSISTENCY REPORT</div>'
        f'<h1 style="font-size:20px;font-weight:500;margin:6px 0 16px;color:#F4F5F7">{escape(rpt.get("title") or "")}</h1>'
        f'<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px">'
        f'<tr><td style="padding:6px 0;color:#8A90A0;white-space:nowrap">{escape(L["shots"])}</td>'
        f'<td style="padding:6px 0">{rpt.get("shot_count", 0)} / {rpt.get("character_count", 0)} / {rpt.get("scene_count", 0)}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#8A90A0;white-space:nowrap">{escape(L["duration"])}</td>'
        f'<td style="padding:6px 0">{escape(dur_txt)}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#8A90A0;white-space:nowrap">{escape(L["verdict"])}</td>'
        f'<td style="padding:6px 0;font-weight:500;color:{vcolor}">{escape(rpt.get("verdict") or "")}</td></tr>'
        f'<tr><td style="padding:6px 0;color:#8A90A0;white-space:nowrap">{escape(L["dist"])}</td>'
        f'<td style="padding:6px 0">{escape(lv[P0])} {c.get(P0, 0)} · {escape(lv[P1])} {c.get(P1, 0)} · {escape(lv[P2])} {c.get(P2, 0)}</td></tr>'
        f'</table>'
        f'<hr style="border:none;border-top:1px solid #23262C;margin:20px 0">'
        f'{body}{gap_html}'
        f'<div style="margin-top:24px;padding-top:14px;border-top:1px solid #23262C;color:#6E7480;font-size:12px">'
        f'{escape(L["footer"])}</div>'
        f'</div>'
    )


# ---------------------------------------------------------------- 自测
if __name__ == "__main__":
    import json
    sample = {
        "name": "SelfTest",
        "bible": {
            "characters": [{"name": "A Bao", "role": "lead", "appearance": {"hair": "long black hair"}}],
            "scenes": [{"name": "Harbor", "lightSource": "noon"}],
        },
        "episodes": [{"id": "ep1", "title": "Ep1", "seconds": 90}],
        "shots": {"ep1": [
            {"scene": "Harbor", "chars": ["A Bao"], "action": "folds letter",
             "dialogue": "A Bao: You wanted me back.",
             "sound": "", "light": "", "camera": "STATIC", "size": "CLOSE_UP",
             "mood": "tense", "pace": "normal", "dur": 0.2},
        ]},
    }
    r = build_report(sample, lang="en")
    print(json.dumps(r, ensure_ascii=False, indent=2))
    h = render_html(r)
    print("---- html len:", len(h))
    leaks = [ln for ln in h.splitlines() if _CJK.search(ln)]
    print("CJK lines in html:", len(leaks))
    for ln in leaks[:5]:
        print("  ", ln[:160])
