#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""continuity.py — Storywright 内置的 ShotLock 分镜连续性检查桥接。

把 Storywright 当前项目（与墨金格同构：bible / episodes / shots）映射成
ShotSpec v0.1，交给嵌入的 shotlock 引擎跑 15 条规则，返回报告。

ShotLock 引擎源码来自同仓 ./shotlock/（MIT），此处只做数据映射与调用，
不重写规则，保证「单一事实源」。

用法（后端调用）：
    from continuity import check_continuity
    report = check_continuity(project_dict)        # -> dict（verdict/counts/issues）
    html   = check_continuity_html(project_dict)   # -> HTML 报告字符串
"""

from __future__ import annotations

import json
import re

from shotlock import validate, to_text, to_html
from shotlock.schema import Script

__all__ = ["check_continuity", "check_continuity_html", "project_to_script"]


# ---------------------------------------------------------------- 映射层
# 与 mojinge_to_shotlock.py 同源，去掉网络/登录部分，直接吃项目 dict。

SIZE_MAP = {
    "大远景": "EXTREME_WIDE", "远景": "WIDE", "全景": "WIDE", "中景": "MEDIUM",
    "近景": "CLOSE_UP", "特写": "CLOSE_UP", "大特写": "EXTREME_CLOSE_UP",
    # 英文项目里 LLM 会直接写英文景别（界面语言决定输出语言），这里一并认。
    "extreme wide shot": "EXTREME_WIDE", "extreme long shot": "EXTREME_WIDE",
    "wide shot": "WIDE", "long shot": "WIDE", "full shot": "WIDE",
    "medium shot": "MEDIUM", "medium close shot": "MEDIUM",
    "close-up": "CLOSE_UP", "close up": "CLOSE_UP", "close shot": "CLOSE_UP",
    "extreme close-up": "EXTREME_CLOSE_UP", "extreme close up": "EXTREME_CLOSE_UP",
    "insert shot": "INSERT",
}

CAMERA_MAP = [
    ("手持", "HANDHELD"), ("环绕", "ORBIT"), ("固定", "STATIC"), ("静", "STATIC"),
    ("推", "DOLLY"), ("拉", "DOLLY"), ("摇", "PAN"), ("移", "TRACK"),
    ("跟", "FOLLOW"), ("升", "CRANE"), ("降", "CRANE"), ("变焦", "ZOOM"), ("倾", "TILT"),
]

# 英文机位/情绪：按词边界匹配，避免 "companion" 命中 "pan" 这类误伤。
CAMERA_EN = [
    ("handheld", "HANDHELD"), ("hand-held", "HANDHELD"), ("orbit", "ORBIT"),
    ("static", "STATIC"), ("locked off", "STATIC"), ("dolly", "DOLLY"),
    ("pan", "PAN"), ("track", "TRACK"), ("tracking", "TRACK"),
    ("follow", "FOLLOW"), ("crane", "CRANE"), ("zoom", "ZOOM"), ("tilt", "TILT"),
]

EMOTION_MAP = [
    ("紧张", "tense"), ("危急", "tense"), ("怒", "angry"), ("气", "angry"),
    ("悲", "sad"), ("哭", "sad"), ("伤", "sad"), ("喜", "joy"), ("开心", "joy"),
    ("怕", "fear"), ("惧", "fear"), ("恐", "fear"), ("惊", "surprised"),
    ("厌", "disgusted"), ("恶", "disgusted"), ("温", "affectionate"),
    ("甜", "affectionate"), ("爱", "affectionate"), ("平静", "calm"), ("缓", "calm"),
]

EMOTION_EN = [
    ("tense", "tense"), ("urgent", "tense"), ("anxious", "tense"),
    ("angry", "angry"), ("furious", "angry"), ("rage", "angry"),
    ("sad", "sad"), ("sorrow", "sad"), ("grief", "sad"), ("weeping", "sad"),
    ("joy", "joy"), ("happy", "joy"), ("delighted", "joy"),
    ("fear", "fear"), ("afraid", "fear"), ("terror", "fear"), ("scared", "fear"),
    ("surprised", "surprised"), ("shocked", "surprised"),
    ("disgusted", "disgusted"), ("contempt", "disgusted"),
    ("affectionate", "affectionate"), ("tender", "affectionate"), ("warm", "affectionate"),
    ("calm", "calm"), ("serene", "calm"), ("neutral", "neutral"),
]

INTEXT_RE = re.compile(r"^([^：:]{1,8})[：:]")

# 画面左右线索：只认显式写出来的方位词，认不出来就留 center（宁可少报也不误报）。
_LEFT_CUES = ("左", "left")
_RIGHT_CUES = ("右", "right")
# 道具线索：角色名后紧跟「拿着/手持/握着 + 名词」时认为该角色持此道具。
_HOLDING_RE = re.compile(r"(.{1,12}?)(拿着|手持|握着|攥着|捧着|抱起)([^，。！？；,.!?;]{1,12})")


def _derive_screen_dirs(text: str, names: list[str]) -> dict[str, str]:
    """从镜头文本里的显式方位词推导角色左右位置。找不到就留空（= 不参与 SL008）。"""
    out: dict[str, str] = {}
    if not text:
        return out
    for nm in names:
        if not nm:
            continue
        for m in re.finditer(re.escape(nm), text):
            head = text[max(0, m.start() - 10):m.start()]
            tail = text[m.end():m.end() + 16]
            if any(c in tail for c in _RIGHT_CUES) and not any(c in head for c in _RIGHT_CUES):
                out[nm] = "right"
                break
            if any(c in tail for c in _LEFT_CUES) and not any(c in head for c in _LEFT_CUES):
                out[nm] = "left"
                break
    return out


def _derive_holding(text: str, names: list[str]) -> dict[str, str]:
    """从镜头文本里推「谁拿着什么」，只认显式的拿/持动词。"""
    out: dict[str, str] = {}
    if not text:
        return out
    for m in _HOLDING_RE.finditer(text):
        holder, _verb, obj = m.group(1), m.group(2), m.group(3)
        obj = obj.strip()
        if not obj:
            continue
        for nm in names:
            if nm and nm in holder:
                out.setdefault(nm, obj)
                break
    return out


def _appearance_note(text: str, name: str) -> str:
    """取角色名附近的一段文本当本镜头的外貌描述。

    只在角色名出现处取窗口，避免环境描写（墙上的黑外套之类）污染判定；
    角色名可能出现多次（动作里一次、画面提示词里一次），逐个窗口试，
    取第一个能命中外貌维度的窗口——描述通常紧跟在名字后面。
    名字没出现就返回空：没有证据就不报，宁可漏报不误报。
    """
    if not text or not name:
        return ""
    from shotlock.rules import APPEARANCE_DIMENSIONS, _dim_value

    fallback = ""
    for m in re.finditer(re.escape(name), text):
        win = text[max(0, m.start() - 30): m.end() + 60]
        for dim in APPEARANCE_DIMENSIONS:
            if _dim_value(win, dim):
                return win
        if not fallback:
            fallback = win
    return fallback


# 时间档位：判断「光线描述」是不是真的换了时间。
# 场景表写「skylight noon」、镜头写「noon daylight through skylight」——同一件事换了说法，
# 字符串不等但不是连续性冲突。只在两边都落在明确时间档、且档位不同的时候才判冲突。
_TIME_BUCKETS = [
    ("dawn", ("黎明", "拂晓", "破晓", "dawn", "daybreak", "early morning")),
    ("morning", ("清晨", "早晨", "早上", "上午", "morning")),
    ("noon", ("正午", "中午", "noon", "midday")),
    ("afternoon", ("下午", "午后", "afternoon")),
    ("dusk", ("黄昏", "傍晚", "日落", "暮色", "dusk", "sunset", "golden hour", "twilight")),
    ("night", ("深夜", "午夜", "夜晚", "晚上", "夜里", "夜", "月光", "月色",
                "night", "midnight", "evening", "moonlight")),
]


def _time_bucket(text: str) -> str:
    """从一段光线/时间描述里提取时间档位；判断不出就返回空（= 没有证据）。"""
    t = str(text or "").lower()
    if not t:
        return ""
    for bucket, words in _TIME_BUCKETS:
        for w in words:
            if w in t:
                return bucket
    return ""


def _slug(s: str) -> str:
    s = re.sub(r"\s+", "", str(s or ""))
    s = re.sub(r"[^\w一-龥]", "", s)
    return s[:24] or "x"


def _norm(s: str) -> str:
    return re.sub(r"[^\w一-龥]", "", str(s or ""))


def _map_size(cn: str) -> str:
    key = (cn or "").strip().lower()
    if not key:
        return ""
    if key in SIZE_MAP:
        return SIZE_MAP[key]
    # 容忍带修饰的写法："a medium shot" / "medium shot, slight push in"
    for k, v in SIZE_MAP.items():
        if " " in k and k in key:
            return v
    return ""


def _map_camera(text: str) -> str:
    t = (text or "").lower()
    if not t:
        return ""
    for kw, move in CAMERA_EN:
        if re.search(r"\b" + re.escape(kw) + r"\b", t):
            return move
    for kw, move in CAMERA_MAP:
        if kw in t:
            return move
    return ""


def _map_emotion(text: str) -> str:
    t = (text or "").lower()
    if not t:
        return "neutral"
    for kw, emo in EMOTION_EN:
        if re.search(r"\b" + re.escape(kw) + r"\b", t):
            return emo
    for kw, emo in EMOTION_MAP:
        if kw in t:
            return emo
    return "neutral"


def _char_appearance(item: dict) -> dict:
    ap = item.get("appearance")
    if isinstance(ap, dict):
        return {str(k): str(v) for k, v in ap.items()}
    if isinstance(ap, str) and ap.strip():
        return {"appearance": ap.strip()}
    out = {}
    for k in ("look", "desc", "description", "外貌", "外形", "形象", "外表"):
        v = item.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()
    return out


def _split_dialogue(raw: str, chars: list[str], char_ids: dict) -> list[dict]:
    lines = []
    for ln in (raw or "").split("\n"):
        ln = ln.strip()
        if not ln:
            continue
        m = INTEXT_RE.match(ln)
        speaker, text = "", ln
        if m and m.group(1).strip() in chars:
            nm = m.group(1).strip()
            speaker, text = char_ids.get(nm, nm), ln[m.end():].strip()
        elif chars:
            speaker = char_ids.get(chars[0], chars[0])
        else:
            speaker = "旁白"
        lines.append({"speaker": speaker, "text": text})
    return lines


def project_to_script(p: dict) -> dict:
    """Storywright / 墨金格项目 dict -> ShotSpec Script dict。"""
    bible = p.get("bible") or {}
    episodes = p.get("episodes") or []
    shots_by_ep = p.get("shots") or {}

    characters, char_ids = [], {}
    for item in bible.get("characters") or []:
        name = (item.get("name") or item.get("role") or "").strip()
        if not name or name in char_ids:
            continue
        cid = "c_" + _slug(name)
        char_ids[name] = cid
        characters.append({
            "id": cid, "name": name,
            "appearance": _char_appearance(item),
            "traits": [str(item.get("role") or "")] if item.get("role") else [],
        })

    scenes, scene_ids, scene_names = [], {}, []
    for item in bible.get("scenes") or []:
        name = (item.get("name") or item.get("scene") or item.get("title") or "").strip()
        if not name:
            continue
        sid = "s_" + _slug(name)
        if sid in scene_ids:
            continue
        scene_ids[sid] = True
        scene_names.append((name, sid))
        loc = name
        ie = ""
        if any(k in loc for k in ("内", "室", "房", "店")):
            ie = "INT"
        elif any(k in loc for k in ("外", "街", "路", "野")):
            ie = "EXT"
        scenes.append({
            "id": sid, "location": loc,
            "time_of_day": str(item.get("time") or item.get("timeOfDay") or ""),
            "lighting": str(item.get("lightSource") or ""),
            "int_ext": ie,
        })

    out_shots, auto_scene_n = [], 0
    auto_seen: dict[str, str] = {}
    for ei, ep in enumerate(episodes):
        for i, s in enumerate(shots_by_ep.get(str(ep.get("id")), []) or []):
            title = (s.get("scene") or "").strip()
            ntitle = _norm(title)
            scene_id = ""
            for nm, sid in scene_names:
                nn = _norm(nm)
                if nn and (nn in ntitle or ntitle in nn):
                    scene_id = sid
                    break
            if not scene_id:
                if ntitle in auto_seen:
                    scene_id = auto_seen[ntitle]
                else:
                    auto_scene_n += 1
                    scene_id = f"s_auto{auto_scene_n}"
                    auto_seen[ntitle] = scene_id
                    scenes.append({"id": scene_id, "location": title or f"未命名场景{auto_scene_n}",
                                   "time_of_day": "", "lighting": str(s.get("light") or ""), "int_ext": ""})
            scs = []
            for nm in s.get("chars") or []:
                nm = (nm or "").strip()
                if not nm or nm in scs:
                    continue
                if nm not in char_ids:
                    cid = "c_" + _slug(nm)
                    char_ids[nm] = cid
                    characters.append({"id": cid, "name": nm, "appearance": {}, "traits": []})
                scs.append(nm)
            # 镜头自身描述（动作 + 画面提示词）：方位词 / 持物 / 外貌漂移都从这里取。
            shot_text = " ".join([
                str(s.get("action") or ""),
                str(s.get("prompt") or ""),
                str(s.get("videoPrompt") or ""),
            ]).strip()
            dirs = _derive_screen_dirs(shot_text, scs)
            holdings = _derive_holding(shot_text, scs)
            chars = []
            for nm in scs:
                cid = char_ids[nm]
                item = {"id": cid, "screen_dir": dirs.get(nm, "center")}
                if nm in holdings:
                    item["holding"] = holdings[nm]
                if len(scs) == 1:
                    note = _appearance_note(shot_text, nm)
                    if note:
                        item["appearance_note"] = note
                chars.append(item)
            notes_bits = []
            if s.get("size"):
                notes_bits.append(f"景别:{s['size']}")
            if s.get("camera"):
                notes_bits.append(f"机位:{s['camera']}")
            if s.get("mood"):
                notes_bits.append(f"情绪:{s['mood']}")
            if s.get("pace"):
                notes_bits.append(f"节奏:{s['pace']}")
            if s.get("sound"):
                notes_bits.append(f"音效:{s['sound']}")
            # 连续性 override：镜头自带的光线与场景表定义冲突时如实上报（SL005）
            # 只在两边时间档位明确不同才算冲突——同一时间的两种写法不算。
            overrides: dict[str, str] = {}
            scene_obj = next((sc for sc in scenes if sc["id"] == scene_id), None)
            shot_light = str(s.get("light") or "").strip()
            base_light = str((scene_obj or {}).get("lighting") or "").strip()
            if shot_light and base_light and shot_light != base_light:
                b_base = _time_bucket(base_light)
                b_shot = _time_bucket(shot_light)
                if b_base and b_shot and b_base != b_shot:
                    overrides["lighting"] = shot_light
            out_shots.append({
                "id": f"E{ei + 1}-{i + 1}",
                "scene_id": scene_id,
                "duration_sec": float(s.get("dur") or 5),
                "shot_size": _map_size(s.get("size") or ""),
                "camera_move": _map_camera(s.get("camera") or ""),
                "transition_in": "CUT",
                "characters": chars,
                "dialogue": _split_dialogue(s.get("dialogue") or "", scs, char_ids),
                "emotion": _map_emotion(s.get("mood") or ""),
                "action": str(s.get("action") or ""),
                "props": [],
                "notes": " | ".join(notes_bits),
                "continuity_override": overrides,
            })

    target = 0.0
    for ep in episodes:
        target += float(ep.get("seconds") or ep.get("target") or 0)

    return {
        "meta": {
            "title": str(p.get("name") or "未命名项目"),
            "target_duration_sec": target,
            "source": "storywright",
            "episode_count": len(episodes),
        },
        "characters": characters,
        "scenes": scenes,
        "shots": out_shots,
    }


def check_continuity(project: dict, return_html: bool = False):
    """跑 ShotLock 15 条规则，返回报告 dict；return_html=True 时多带 html 字段。"""
    spec = project_to_script(project)
    script = Script.from_dict(spec)
    report = validate(script)
    out = report.to_dict()
    out["ran_rules"] = report.ran_rules
    if return_html:
        out["html"] = to_html(report)
        out["text"] = to_text(report)
    return out


def check_continuity_html(project: dict) -> str:
    spec = project_to_script(project)
    script = Script.from_dict(spec)
    report = validate(script)
    return to_html(report)


if __name__ == "__main__":
    # 自测：构造一个最小项目，确认映射+引擎可用
    sample = {
        "name": "自测项目",
        "bible": {
            "characters": [{"name": "阿宝", "role": "男主"}],
            "scenes": [{"name": "码头", "lightSource": "正午"}],
        },
        "episodes": [{"id": "ep1", "title": "第一集", "seconds": 90}],
        "shots": {"ep1": [
            {"scene": "码头", "chars": ["阿宝"], "action": "叠信", "dialogue": "他想要你回去。",
             "sound": "", "light": "", "camera": "固定", "size": "中景", "mood": "平静",
             "pace": "normal", "dur": 5},
        ]},
    }
    r = check_continuity(sample, return_html=True)
    print(json.dumps(r, ensure_ascii=False, indent=2))
