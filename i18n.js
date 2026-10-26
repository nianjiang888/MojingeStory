/* MojingeStory i18n — 中 / 英 双语（运行时翻译引擎）
 * 设计：不侵入 render 代码。DOM 文本节点 + placeholder/title 属性按「中文原文 → 英文」字典匹配翻译，
 * MutationObserver 监听动态渲染，新增节点自动翻译。字典未命中的字符串保持原样（LLM 提示词、
 * 示例剧本等内容因此天然不会被误翻——它们只在 JS 变量里，不进 DOM）。
 * 默认英文（面向海外开源）；切换后记忆 localStorage。
 */
(function () {
  var STORE_KEY = 'storywright_lang';

  /* ===== 界面字典（中文原文 → English）===== */
  var DICT = {
    /* —— 顶栏 / 侧栏 / 步骤 —— */
    '剧本工作台': 'Workbench',
    'MojingeStory · 剧本工作台': 'MojingeStory · Screenwriting Workbench',
    '本': 'L',
    '主线流程 · 第 1 / 6 步': 'Workflow · Step 1 / 6',
    '主线流程 · 第 2 / 6 步': 'Workflow · Step 2 / 6',
    '主线流程 · 第 3 / 6 步': 'Workflow · Step 3 / 6',
    '主线流程 · 第 4 / 6 步': 'Workflow · Step 4 / 6',
    '主线流程 · 第 5 / 6 步': 'Workflow · Step 5 / 6',
    '主线流程 · 第 6 / 6 步': 'Workflow · Step 6 / 6',
    '创作范式 / 模版 ▾': 'Paradigms / Templates ▾',
    '创作范式 / 模版': 'Paradigms / Templates',
    'MojingeStory · 专注剧本创作': 'MojingeStory · Screenwriting Workbench',
    '专注剧本创作': 'Screenwriting Workbench',
    '主线流程': 'Workflow',
    '质量保障': 'Quality Guard',
    '使用帮助 · 说明书': 'Help · Manual',
    '收起 / 展开左侧流程栏': 'Collapse / expand workflow sidebar',
    '收起栏': 'Collapse',
    '展开栏': 'Expand',
    '← 项目列表': '← Projects',
    '⬇ 导出资产包（.md）': '⬇ Export Asset Pack (.md)',
    '搜索人物 / 场景 / 板块…': 'Search characters / scenes / panels…',
    '搜索集标题…': 'Search episode titles…',
    '导入': 'Import', '作品': 'Work', '创建': 'Create',
    '故事中枢': 'Story Bible', '决策': 'Decide',
    '改编蓝图': 'Adaptation Blueprint', '梳理': 'Outline',
    '分集大纲': 'Episode Outline', '改编': 'Adapt',
    '剧本': 'Script', '生成': 'Generate',
    '分镜脚本': 'Storyboard',
    '一致性审计': 'Continuity Audit', '完整性校验': 'Completeness Check',
    '当前项目': 'Current project',
    '当前步骤': 'Current step',
    '全部步骤完成 ✓': 'All steps complete ✓',

    /* —— 首页门面 —— */
    '进入工作台': 'Enter Workbench', '进入工作台 →': 'Enter Workbench →',
    '工作台': 'Workbench', '本地运行': 'Run Locally', '开源协议': 'License',
    '开源本地剧本工作台': 'Open-source Local Screenwriting Workbench',
    '数据只保存在这台电脑': 'Your data stays on this machine',
    'OPEN SOURCE · LOCAL FIRST': 'OPEN SOURCE · LOCAL FIRST',
    '把小说改编成': 'Turn any novel into ',
    '可直接开拍': 'a shoot-ready script',
    '的剧本——故事中枢、分集大纲、改编剧本、分镜脚本，': ' — story bible, episode outline, adapted script, storyboard, ',
    '全流程在这台电脑上完成': 'all done on this machine',
    '，不注册、不登录、': ' — no signup, no login, ',
    '数据零上传': 'zero data upload',
    '。': '.',
    'DeepSeek（推荐）': 'DeepSeek (recommended)',
    '智谱': 'Zhipu', '通义千问': 'Qwen', 'Kimi': 'Kimi',
    '任意 OpenAI 兼容接口': 'Any OpenAI-compatible API',
    '免费 · 开源 · MIT 协议 · 无需配置即可先逛界面': 'Free · Open source · MIT · Browse without any setup',
    '复制': 'Copy', '已复制': 'Copied',
    'Windows · macOS · Linux 均可运行（需 Python 3.9+ 与你自己的模型 Key）': 'Runs on Windows · macOS · Linux (Python 3.9+ and your own model key)',
    '# 浏览器打开 127.0.0.1:5178': '# then open http://127.0.0.1:5178 in your browser',
    '零上传': 'Zero upload', '项目文件只存本机 data 目录': 'Project files stay in your local data directory',
    '零埋点': 'Zero tracking', '我们看不到谁在用、用了什么': 'We cannot see who uses it or what they create',
    '免费导出': 'Free export', '全剧资产包一键带走（.md）': 'Take the whole asset pack with you (.md)',
    /* 页脚：© 2026 <b>…</b> 之后是独立文本节，key 必须与该文本节一致（<b> 会劈开文本节） */
    '· MIT License · 本页不收集任何访问数据': '· MIT License · This page collects no data',

    /* —— 用户菜单 / 设置 / 关于 —— */
    '设置 · API Key': 'Settings · API Key',
    '关于 MojingeStory': 'About MojingeStory',
    '把你的模型 Key 填在这里，只存在你这台浏览器里，调用时只发往对应服务商，我们收不到。': 'Your model key is stored in this browser only, and requests go straight to your provider. We never see it.',
    '用 DeepSeek（最常用）的话，只填 Key 就够了，下面两项留空。': 'With DeepSeek (most common), just fill in the Key and leave the two fields below empty.',
    'API Key': 'API Key',
    '服务商快捷填入（可选，点了就不用手动填下面两项）': 'Quick-fill provider (optional — auto-fills the two fields below)',
    '接口地址（留空 = DeepSeek 官方）': 'Base URL (empty = DeepSeek official)',
    '留空 = https://api.deepseek.com/v1': 'empty = https://api.deepseek.com/v1',
    '模型名': 'Model',
    'deepseek-chat': 'deepseek-chat',
    '测试连接': 'Test connection', '保存': 'Save',
    '测试中…': 'Testing…',
    '连接成功（模型：': 'Connected (model: ',
    'Key 为空，先填写 Key。': 'Key is empty. Please enter your key first.',
    '连接失败：': 'Connection failed: ',
    '连接失败：网络错误': 'Connection failed: network error',
    '已保存': 'Saved',
    '尚未配置 API Key，生成功能不可用。': 'API Key not configured — generation is unavailable.',
    '去设置': 'Settings',
    '头像上传中…': 'Uploading avatar…',
    '头像已更新': 'Avatar updated',
    '上传失败：': 'Upload failed: ',
    '上传失败，网络错误': 'Upload failed, network error',
    '读取图片失败': 'Failed to read image',
    '请选择 PNG/JPG/WEBP 图片': 'Please choose a PNG/JPG/WEBP image',
    '图片不能超过 2MB': 'Image must not exceed 2MB',
    '知道了': 'Got it',
    'v0.1.0': 'v0.1.0',
    'MIT 开源': 'MIT licensed',
    '本地创作者': 'Local Creator',
    '创作者': 'Creator',
    '本地版无需登录，数据只保存在这台电脑上。': 'Local version needs no login — your data stays on this machine.',
    '开源本地剧本工作台：导入小说 → 故事中枢 → 分集大纲 → 改编剧本 → 分镜脚本 → 导出资产包。': 'Open-source local screenwriting workbench: import a novel → story bible → episode outline → adapted script → storyboard → export asset pack.',
    '数据只保存在这台电脑上（data/projects 目录），不上传、不外流。': 'Data stays on this machine (data/projects), never uploaded.',
    '模型跑在你自己的 Key 后面，在「设置 · API Key」里配置（DeepSeek / 智谱 / 通义等 OpenAI 兼容接口均可）。': 'Models run behind your own key — configure it in Settings · API Key (DeepSeek / Zhipu / Qwen or any OpenAI-compatible API).',
    '生成完成后，在第 6 步「导出资产包」一键带走全部剧本与提示词（.md 文件）。': 'When done, export everything as a single .md from the Export Asset Pack button.',

    /* —— 更新日志弹窗 —— */
    'MojingeStory 0.1.0 · 首个开源版本': 'MojingeStory 0.1.0 · First open-source release',
    '本地开源版首发：导入小说 → 故事中枢 → 分集大纲 → 改编剧本 → 分镜脚本 → 导出资产包，全流程在本机完成': 'First local open-source release: import → story bible → episode outline → adapted script → storyboard → export, all on your machine',
    '模型跑在你自己的 key 后面（OpenAI 兼容接口均可，如 DeepSeek / 智谱 / 通义），数据不出这台机器': 'Models run behind your own key (any OpenAI-compatible API, e.g. DeepSeek / Zhipu / Qwen); data never leaves this machine',
    '无需注册登录；项目保存在本机 data/projects 目录，导出为 .md 直接拿去即梦 / 可灵 / Midjourney 等平台出图出视频': 'No signup or login; projects save to local data/projects; export .md straight to Jimeng / Kling / Midjourney and other tools',

    /* —— 截图复审补充（第 12 轮）—— */
    '作品': 'Work',
    '总镜头': 'Total shots',
    '在此粘贴剧本全文…（支持小说 / 剧本 / 散文 / 口述记录）': 'Paste your full script here… (novel / script / essay / transcript)',
    '全剧': 'Series',
    '全剧概览': 'Series Overview',
    '故事地图': 'Story Map',
    '总纲 · 世界设定': 'Outline · World Setting',
    '风格卡': 'Style Card',
    '结构层': 'Structure',
    '全剧大纲（幕/弧）': 'Series Outline (Acts/Arcs)',
    '情节点': 'Beats',
    '伏笔': 'Foreshadowing',
    '暗线': 'Subplots',
    '设定层': 'Setting Layer',
    '人物': 'Characters',
    '场景': 'Scenes',
    '关系': 'Relations',
    '（暂无人物）': '(no characters yet)',
    '（暂无关系）': '(no relations yet)',
    '基础信息': 'Basics',
    '审计规则': 'Audit Rules',
    '大纲条目': 'Outline Entries',
    '重新 AI 诵读 · 重建故事中枢': 'Re-read & Rebuild Story Bible',
    '重建故事中枢': 'Rebuild Story Bible',
    '情节流向图': 'Story Flow',
    '角色关系网': 'Character Relations',
    '整理故事中枢（合并重复人物/场景）': 'Tidy Story Bible (merge duplicate characters/scenes)',
    '改编蓝图是什么': 'What is the adaptation blueprint?',
    '还没有作品正文——请先回「导入作品」粘贴或上传小说。': 'No source text yet — go back to Import and paste or upload your novel.',
    '目标集数': 'Target Episodes',
    '竖屏短剧常规 30-80 集，单集 1-2 分钟': 'Vertical dramas usually run 30-80 episodes, 1-2 minutes each',
    '生成改编蓝图 →': 'Generate Blueprint →',
    '还没有剧本文本。': 'No script text yet.',
    '← 先回到步骤①导入作品': '← Back to step 1 · Import first',
    '还没有分集。': 'No episodes yet.',
    '← 先回到步骤③分集大纲': '← Back to step 3 · Episode Outline first',
    '结构校验自动完成；可自动修的「服装 / 标志物漂移」一键补画面提示词，不可自动修的（如时间线矛盾）请判断后忽略。': 'Structural check runs automatically. Auto-fixable issues (costume / signature-item drift) get one-click prompt repair; non-fixable ones (e.g. timeline conflicts) need your call — just ignore them.',
    '结构一致性（自动校验）': 'Structural consistency (auto-check)',
    '审计规则核对（来自故事中枢 · 点击展开）': 'Audit rule review (from the Story Bible · click to expand)',
    '忽略': 'Ignore',
    '未在故事中枢定义「一致性审计规则」。可在步骤②「一致性审计规则」区块添加，例如：『林小满家境清贫，全片不得出现豪车名表』『苏锦儿玉佩从第2镜起始终佩戴』。定义后这里会逐条可勾选核对。': 'No continuity audit rules defined in the Story Bible. Add them in step 2 · Audit Rules, e.g. "Lin Xiaoman is poor — no luxury items all series"; "Su Jin\'er\'s jade pendant is worn from shot 2 onward". Once defined, each rule can be ticked here.',
    '按分集顺序串联的情节流向；点节点可跳到该集工作区，点「AI 三分支」，我给你这个节点的三种走向（轻量版，可选）。': 'Story flow chained in episode order. Click a node to jump to that episode\'s workspace; click "AI Branches" and I give three possible directions for that node (lightweight, optional).',
    '还没有分集，先到步骤③分集大纲再来看情节流向。': 'No episodes yet — create the episode outline (step 3) first, then come back to see the story flow.',
    '关闭': 'Close',
    '重新布局': 'Re-layout',
    'AI 推断关系': 'Infer relations (AI)',
    '节点 = 故事中枢人物；连线 = 关系（标签为关系类型）。点角色高亮其关系，点空白取消高亮；拖动角色可手动整理关系网。': 'Nodes = Story Bible characters; edges = relations (labeled by type). Click a character to highlight its relations, click blank space to clear; drag characters to rearrange the network.',
    '故事中枢还没有人物，先到「设定层 · 人物」添加角色，关系网才有节点。': 'No characters in the Story Bible yet — add them under Setting Layer · Characters first, then the relation network has nodes.',
    '请先在设定层添加人物，再来推断关系': 'Add characters under Setting Layer first, then infer relations',
    '重复项已并入主条目（变体保留在「称谓别名 / 场景变体」中供可逆查看），分镜与大纲的引用已自动改写——编辑任一主条目即可全片生效。': 'Duplicates merged into master entries (variants kept under "Aliases / Scene Variants" for reversible lookup); references in shots and outline were rewritten — edit any master entry to apply everywhere.',
    '点任一角色可高亮它与其他人的关系；关系数据来自「设定层 · 关系」，可在那里手动增删，或点「AI 推断关系」让我补全。': 'Click any character to highlight its relations. Relation data comes from Setting Layer · Relations — edit there, or click "Infer relations (AI)" and I will fill it in.',
    '暂未登记关系，可在「设定层 · 关系」添加，或点「AI 推断关系」。': 'No relations registered yet — add them under Setting Layer · Relations, or click "Infer relations (AI)".',
    '当前没有可自动修复的项。\n\n可自动修复的只有：在故事中枢·设定层里给人物锁定的「服装 / 不可变标志物」，于对应分镜的「画面提示词」中缺失时。\n\n若想产生可修复项：步骤④ 故事中枢 → 展开「设定层」→ 人物卡填写「定妆描述 / 服装」或「不可变标志物」，再去步骤⑤ 审计即可看到「自动修复」。': 'Nothing to auto-fix right now.\n\nAuto-fix only covers: costume / must-not-change items locked on a character in the Story Bible · Setting Layer that are missing from the corresponding shot\'s image prompt.\n\nTo create fixable items: step 2 Story Bible → Setting Layer → fill in the character card\'s "Look / Costume" or "Must-not-change items", then run the audit in step 5.',
    '我在通读全作，提炼叙事弧 / 转折点 / 情绪曲线…': 'Reading the whole work, extracting narrative arc / turning points / emotion curve…',
    '故事地图 · 生成中': 'Story Map · Generating',
    '故事地图 · 全作叙事骨架': 'Story Map · Full-story skeleton',
    '本作品尚未生成故事地图，它是切集与改编的依据。可直接在此生成：': 'No story map yet — it drives episode splitting and adaptation. Generate it right here:',
    '生成故事地图': 'Generate Story Map',
    '← → 翻页 · 点击图片放大/还原 · 滚轮缩放 · Esc 关闭': '← → page · click image to zoom/restore · scroll to zoom · Esc to close',
    '← 先回到步骤①导入作品 ': '← Back to step 1 · Import first ',
    '我这边还没接上写作通道（缺少密钥），扩写不了。你可以在设置里补上密钥，或者直接在上面的文本框里自己写草稿。': 'The writing channel is not connected (missing key). Add your key in Settings, or draft manually in the box above.',
    'AI 扩写请求失败，请检查网络或稍后重试。': 'AI expansion request failed. Check your network or retry later.',
    'AI 扩写未返回有效内容，请稍后重试，或在上方文本框手动撰写。': 'AI expansion returned nothing valid. Retry later, or draft manually above.',
    'AI 扩写中…': 'AI expanding…',
    'AI 帮我扩写到 N 集 →': 'AI expand to N episodes →',
    '文本框为空或只有模板骨架，将载入「': 'The text box is empty or only a template skeleton — loading "',
    '」：示例草稿已载入上方文本框，风格已锁定。可直接改稿，或点「AI 帮我扩写」。': '": the sample draft is loaded above and the style is locked. Edit freely, or click "AI expand".',
    '请直接起草一份 ': 'Draft a ',
    '集，每集都带「第X集」标题（X 为阿拉伯数字）。': ' episodes, each titled "Episode X" (Arabic numerals).',
    '来源：原文（待改编）': 'Source: original (to adapt)',
    '来源：AI 改写': 'Source: AI rewrite',
    '来源：手动': 'Source: manual',
    '来源：规则切分（按句）': 'Source: rule split (by sentence)',
    '来源：我按本集剧本拆的': 'Source: split from this episode\'s script',
    '改写中…': 'Rewriting…',
    '精修转不停': 'Refining…',
    '确认删除项目「': 'Delete project "',

    /* —— 导入步骤 —— */
    '导入作品 · 创作起点': 'Import · Starting point',
    '粘贴或上传你的作品，这是内容的唯一入口。想套用「范式」（过亿模版 / 官方技能）点右侧「创作范式 / 模版」，它会作用于你已写的内容，而不是另起炉灶。': 'Paste or upload your work — the single entry point for content. To apply a paradigm (battle-tested templates / official skills), click "Paradigms / Templates" on the right; it reshapes what you wrote rather than starting over.',
    '上传': 'Upload', '上传 .txt / .md': 'Upload .txt / .md', '清空': 'Clear',
    '创作范式 / 模版': 'Paradigms / Templates',
    '一键全自动巡航': 'One-click auto cruise',
    '合规提醒：本平台严禁上传任何违反中华人民共和国法律法规的内容（包括但不限于色情、暴力、恐怖、毒品、赌博、诈骗及危害国家安全等信息）。系统会对上传内容进行自动审核，违规内容将被屏蔽且无法保存。': 'Compliance notice: uploading content that violates Chinese laws and regulations (including but not limited to pornography, violence, terrorism, drugs, gambling, fraud, or content endangering national security) is strictly prohibited. Uploads are auto-moderated; violations are blocked and cannot be saved.',
    '提示：导入后进「故事中枢」，我通读全稿把全剧设定建起来；再到「改编蓝图」决定这部小说怎么变短剧（保留线 / 砍线 / 每集切分点），然后才进分集大纲与分镜。': 'Tip: after import, enter the Story Bible — I read the whole draft and set up every setting. Then the Adaptation Blueprint decides how the novel becomes a short drama (kept lines / cut lines / per-episode cut points), before the episode outline and shots.',
    '提示：导入后进「故事中枢」，我通读全稿把全剧设定建起来': 'Tip: after import, enter the Story Bible — I read the whole draft and set up every setting',
    '再到「改编蓝图」决定这部小说怎么变短剧（保留线 / 砍线 / 每集切分点），然后才进分集大纲与分镜。': 'Then the Adaptation Blueprint decides how the novel becomes a short drama (kept lines / cut lines / per-episode cut points), before the episode outline and shots.',
    '测试': 'Test',
    '我的项目': 'My Projects',
    '新建项目': 'New Project',
    ' 个': '',
    '把你的故事交给我——粘贴或上传都行（小说 / 剧本 / 散文 / 口述均可），我先数清字数和段落。接着进「故事中枢」，我通读全稿，把全剧设定建起来。': 'Hand me your story — paste or upload (novel, script, essay, or transcript). I count words and paragraphs first. Then we build the Story Bible: I read everything and set up the whole world.',
    '请先回「导入作品」粘贴小说正文': 'Please go back to Import and paste your novel text',
    '请先在步骤①粘贴或上传作品': 'Please paste or upload your work in step 1 first',
    '确认清空当前剧本文本？': 'Clear the current text?',
    '字数': 'words', '段落': 'paragraphs',

    /* —— 故事中枢 —— */
    '故事中枢是我记住你世界的地方。我通读全稿，把全剧大纲（每集详情）、人物档案、场景、关系、伏笔、暗线与审计规则都记下来，后面每一步都照着它走。你随时可以改我记的东西。': 'The Story Bible is where I keep your world. I read the whole draft and record the outline (per-episode detail), character profiles, scenes, relationships, foreshadowing, subplots and audit rules. Every later step follows it — and you can edit anything I record.',
    '故事中枢暂无全剧大纲': 'No outline in the Story Bible yet',
    '故事中枢尚未生成': 'Story Bible not generated yet',
    '故事中枢已就绪，跳过': 'Story Bible ready, skipped',
    '故事中枢建好了': 'Story Bible created',
    '进入故事中枢': 'Enter Story Bible', '进入故事中枢 →': 'Enter Story Bible →',
    '创建故事中枢': 'Create Story Bible', '创建故事中枢 →': 'Create Story Bible →',
    '我在通读全作，把故事中枢建起来（人物/场景/大纲/伏笔）…': 'Reading the whole work and building the Story Bible (characters / scenes / outline / foreshadowing)…',
    '故事总纲': 'Story Outline',
    '全剧骨架': 'Full-story skeleton',
    '全剧一句话：': 'One-line logline: ',
    '目标集数：': 'Target episodes: ',
    '人物设定': 'Characters',
    '场景': 'Scenes', '场景名': 'Scene name',
    '关系': 'Relationships', '关系类型': 'Relation type',
    '关系类型（父子/暗恋/上下级/宿敌/陌路）': 'Relation type (father-son / crush / superior-subordinate / nemesis / strangers)',
    '关系要点': 'Relation notes',
    '伏笔内容': 'Foreshadowing detail',
    '埋设集数': 'Planted in episode',
    '关键节点/出现集数': 'Key beat / appears in episode',
    '暗线名': 'Subplot name',
    '暗线名（如 身世之谜）': 'Subplot name (e.g. a mystery of origin)',
    '这条暗线讲什么': 'What this subplot is about',
    '一致性硬约束清单': 'Continuity hard constraints',
    '一致性硬约束清单，如 \'林小满家境清贫，全片不得出现豪车名表等与其身份矛盾的奢侈符号\'；\'苏锦儿左腕玉佩从第2镜起始终佩戴，不得消失\'': 'Hard constraints, e.g. "Lin Xiaoman is poor — no luxury items all series"; "Su Jin\'er\'s jade pendant is worn from shot 2 onward and never disappears"',
    '朝代/时代': 'Dynasty / era',
    '年代标签，如 北宋背景·架空王朝 / 现代都市·2024 / 穿越（古代X朝+现代都市）': 'Era tag, e.g. fictional Northern Song / modern city 2024 / time-travel (ancient + modern)',
    '大环境概述：结合朝代从原剧提取+补全——时代背景、地理/社会风貌、核心冲突土壤、关键场景类型，具体到能照着搭出来；以『拍得出来戏』为下限，不展开成世界观长篇': 'World overview extracted from the source plus inferred details: era background, geography / social landscape, core conflicts, key location types — concrete enough to build and shoot, no world-building essay',
    '装束体系：结合朝代与场景，各身份（贵族/平民/军人/仕女/僧道等）人物的服饰材质·颜色·形制总纲，全片统一；现代剧写各圈层穿搭总纲；穿越剧分别给『古代侧』与『现代侧』两套装束': 'Costume system by identity (nobility / commoner / soldier / maiden / clergy): materials, colors, cuts — unified across the series; modern dramas get per-circle dress codes; time-travel gets both ancient and modern sets',
    '社会等级与物料质感体系：描述各阶层（皇室/贵族/平民/军人等）的居所与陈设应有的物料等级（如 皇室=金丝楠/云锦/鎏金/羊脂玉，贵族=紫檀/绸缎，平民=榆木/粗布），出图时场景物料必须匹配人物身份，禁止公主房出现破屋/普通木/冷灰': 'Social-grade material system: what each class (royal / noble / commoner / soldier) lives among (royal = nanmu / brocade / gilt / jade; noble = rosewood / silk; commoner = elm / coarse cloth). Scene materials must match character rank in every render',
    '导入后我会在后台建起来；也可以到「故事中枢」自己补。': 'I will build it in the background after import; you can also fill it in yourself under Story Bible.',
    '导入后我会在后台建起来': 'I will build it in the background after import',
    '到步骤②补充大纲，可让分集 / 分镜更贴合定魂结构。': 'Complete the outline in step 2 so episodes and shots stay on structure.',

    /* —— 人物 / 场景档案字段 —— */
    '人物': 'Characters', '人物A': 'Character A', '人物B': 'Character B',
    '人物全名或文中真实称呼（须与原文一致）': 'Full name or the name used in the text (must match the source)',
    '人物全名（须与文中出现一致，仅限真实人物，严禁填入叙事片段、代词、动作描述或整句，如「皱着鼻子」「有股旧旧的味」「它」「但」都不是人物）': 'Full name exactly as it appears in the text. Real characters only — never narrative fragments, pronouns, action descriptions or whole sentences',
    '主角': 'Protagonist', '反派': 'Antagonist', '配角': 'Supporting',
    '主角 / 反派 / 配角': 'Protagonist / antagonist / supporting',
    '身份': 'Identity', '年龄': 'Age', '性别': 'Gender',
    '性格': 'Personality',
    '性格形容词（全片统一，抑制漂移）': 'Personality adjectives (unified across the series to prevent drift)',
    '性格形容词（如 倔强、外冷内热、话少），全片统一，用于抑制性格漂移': 'e.g. stubborn, cold outside warm inside, taciturn — unified across the series',
    '说话风格': 'Speech style',
    '说话风格（如 简短、反问多、带方言）': 'e.g. terse, rhetorical, dialect-flavored',
    '发型发色': 'Hair style & color', '瞳色眼型': 'Eye color & shape',
    '脸型五官': 'Face shape & features', '身形气质': 'Build & demeanor',
    '服饰细节': 'Costume details', '妆造细节': 'Makeup & styling details',
    '随身物品': 'Carried items', '声音描述': 'Voice description',
    '服装锁定 token，如 灰蓝工装+黑长裤+白帆布鞋，全片统一': 'Costume lock token, e.g. grey-blue workwear + black trousers + white canvas shoes, unified all series',
    '全片不许变化的外貌/标志物': 'Appearance / signature items that must never change',
    '全片不许变化的外貌/标志物（如 左眉旧疤、常年戴银戒）': 'e.g. old scar on left brow, always-worn silver ring',
    '标志性道具': 'Signature prop',
    '标志性道具（如 枕边芙蓉石印章、半卷诗稿）': 'e.g. hibiscus-stone seal by the bed, half a manuscript',
    '生图提示词': 'Image prompt',
    '可直接粘贴进即梦 / 可灵 / Midjourney 的中文生图提示词（生成 DNA 后自动产出，可改）': 'Chinese image prompt for Jimeng / Kling / Midjourney (auto-generated with the DNA, editable)',
    '场景 / 景别（标题）': 'Scene / shot size (title)',
    '具体空间/地点（如 公主府东厢卧房·内景·清晨）': 'Specific place (e.g. princess residence east bedroom · interior · dawn)',
    '本集主要场景名': 'Main scene name this episode',
    '本集出场的主要人物姓名': 'Main characters appearing this episode',
    '本集关键情节点': 'Key beats this episode',
    '地点 / 空间': 'Location / space',
    '地点·景别': 'Location · shot size',

    /* —— 改编蓝图 —— */
    '改编蓝图': 'Adaptation Blueprint',
    '这一步我只干一件事：决定这部小说怎么变成短剧。我通读全稿后给出改编方案——保留哪些线、砍掉哪些线、哪些人物合并、每一集从原著哪里切进来、爽点怎么重排、哪些忠于原著哪些二创。每一项你都可以改，改完确认才进分集大纲。改编权在你手里。': 'This step does one thing: decide how this novel becomes a short drama. After reading everything I propose — which storylines stay, which are cut, which characters merge, where each episode cuts in from the source, how payoffs are reordered, what stays faithful and what is invention. You can edit every item; only after you confirm do we move to the outline. You hold the adaptation rights.',
    '改编蓝图已生成，逐项检查并修改吧': 'Blueprint generated — review and edit item by item',
    '改编蓝图没跑成，先跳过，不挡后面流程': 'Blueprint failed; skipped without blocking the flow',
    '改编蓝图已存在，跳过': 'Blueprint already exists, skipped',
    '蓝图生成失败：': 'Blueprint generation failed: ',
    '蓝图生成没返回内容': 'Blueprint generation returned nothing',
    '蓝图返回格式没读懂': 'Could not parse the blueprint format',
    '我在设计改编方案：保留线 / 砍线 / 人物合并 / 分集切分点…': 'Designing the adaptation: kept lines / cut lines / character merges / episode cut points…',
    '保留的故事线（3-5 条为宜）': 'Storylines to keep (3-5 works best)',
    '砍掉的故事线': 'Storylines to cut',
    '为什么保留': 'Why keep it',
    '这条线讲什么': 'What this line is about',
    '人物合并': 'Character merge',
    '分集切分点（': 'Episode cut points (',
    '爽点重排（原著节奏 → 短剧节奏）': 'Payoff reorder (novel pacing → short-drama pacing)',
    '忠实度声明（哪些忠于原著 / 哪些二创）': 'Fidelity statement (faithful vs. invented)',
    '集切分点，可回主线修改确认）': 'cut points — review and confirm in the main flow)',
    '第N集 有概括力的标题（与原文分集标题保持一致，若原文无标题则自拟）': 'Episode N with a punchy title (match the source titles if any)',
    '原著第X章/情节': 'Source chapter X / plot',
    '开场钩/冲突/反转': 'Opening hook / conflict / twist',
    '结尾钩子（L3+）': 'Closing hook (L3+)',
    /* 蓝图生成过程提示 / 已生成面板的行内控件（walk 翻译静态文本节点与 placeholder） */
    '正在通读全稿、设计改编方案…（长稿会分窗阅读，约 1-3 分钟）': 'Reading the full draft and designing the adaptation plan… (long drafts are read in windows, about 1–3 minutes)',
    '正在重新通读、重排方案…': 'Re-reading the draft and re-planning…',
    '线名': 'Line name',
    '砍掉的线': 'Cut line',
    '为什么砍（拖节奏/难视觉化/成本）': 'Why cut it (pacing / hard to visualize / cost)',
    '原人物A': 'Character A',
    '并入人物B': 'Into character B',
    '合并理由': 'Why merge',
    '删': 'Delete',
    '通读分段全部失败': 'All read-through segments failed',

    /* —— 分集大纲 —— */
    '分集大纲': 'Episode Outline',
    '我先通读全稿、画出「故事地图」（叙事弧 + 关键转折 + 情绪曲线），再按故事事件的重要程度切集——每一集都保证有足够可拍的素材，不做机械按字数切。你在评审页逐集看素材够不够，过薄的集可以舍掉。': 'I read the whole draft and draw a story map (narrative arc + key turns + emotion curve), then cut episodes by story-event weight — every episode gets enough filmable material, no mechanical word-count cutting. You review each episode for sufficient material and drop the thin ones.',
    '智能切集': 'Smart episode split',
    '开始分集': 'Split episodes',
    '重新分集': 'Re-split episodes',
    '分集规划失败：': 'Episode planning failed: ',
    '规划失败，已降级为规则切集': 'Planning failed, fell back to rule-based split',
    '我在生成，稍等一下…': 'Generating, one moment…',
    '正在通读全作并规划分集': 'Reading the whole work and planning episodes',
    '重新规划分集将覆盖当前': 'Re-planning will overwrite the current ',
    '集的分集结果（已手动改过的集名/概要会尝试保留，正文会重新生成）。确定重新规划？': 'episodes (manually edited titles/summaries are kept where possible; bodies regenerate). Re-plan?',
    '本集剧情概要（可编辑）': 'Episode synopsis (editable)',
    '本集剧情概要：2-3 句讲清核心事件、人物冲突与情绪落点': 'Episode synopsis: core event, character conflict and emotional beat in 2-3 sentences',
    '集标题': 'Episode title',
    '集数': 'Episodes',
    '集数需在 1-60 之间': 'Episodes must be between 1 and 60',
    '要扩写到几集？（默认 ': 'Expand to how many episodes? (default ',
    'AI 帮我扩写到 N 集 →': 'AI expand to N episodes →',
    'AI 扩写中…': 'AI expanding…',
    'AI 扩写未返回有效内容，请稍后重试，或在上方文本框手动撰写。': 'AI expansion returned nothing valid. Retry later, or draft manually above.',
    'AI 扩写请求失败，请检查网络或稍后重试。': 'AI expansion request failed. Check your network or retry.',
    '我这边还没接上写作通道（缺少密钥），扩写不了。你可以在设置里补上密钥，或者直接在上面的文本框里自己写草稿。': 'Writing channel not connected (missing key). Add your key in Settings, or draft manually above.',
    '我按剧情切的': 'Cut by story',
    '按字数规则切的（兜底）': 'Cut by word count (fallback)',
    '按故事中枢大纲切分': 'Split by Story Bible outline',
    '按故事地图内容规划切分': 'Plan split by story map',
    '按文档分集标题切分': 'Split by document episode headings',
    '按文档结构（章内拆场景·按时长打包）': 'Split by document structure (scenes in chapters, packed by duration)',
    '回收集数（不可空）': 'Collect episodes (required)',
    '幕 / 弧（故事单元）按多对一映射到分集，所以幕数通常少于集数，属正常结构：每集都对照所属幕创作，不会跑偏。': 'Acts/arcs map many-to-one onto episodes, so acts are usually fewer than episodes — that is normal structure: each episode follows its act.',
    '幕/阶段（如 起/承/转/合 或 第一幕/第二幕/第三幕）': 'Act / stage (e.g. setup / rise / turn / resolve, or Act I / II / III)',

    /* —— 改编剧本（第4步）—— */
    '我一集一集改写成可拍的剧本：人物、动作、对白、光线、机位、情绪，按短剧节拍铺开。右侧「本集大纲（故事中枢）」对照这一集的目标内容与目标字数，我盯着不跑偏。': 'I rewrite each episode as a shootable script: characters, action, dialogue, light, camera, emotion, on short-drama beats. The right panel shows this episode\'s target from the Story Bible, and I keep to it.',
    '剧本字数': 'Script word count',
    '改写中…': 'Rewriting…',
    '改编第 ': 'Adapt episode ',
    '集已改写为剧本格式': 'episodes rewritten as scripts',
    '集改写失败：': 'Episode rewrite failed: ',
    '集改写失败：AI 返回内容为空或太短，已退款，请重试': 'Rewrite failed: AI returned empty or too-short content. Refunded — please retry.',
    '集改写异常：': 'Episode rewrite error: ',
    '来源：原文（待改编）': 'Source: original (to adapt)',
    '来源：AI 改写': 'Source: AI rewrite',
    '来源：手动': 'Source: manual',
    '集 · 点「进入第 1 集改编剧本」': 'episodes — click "Adapt episode 1"',
    '集完整草稿（保留已有的人物与剧情走向，不要另起炉灶）：': 'episode full draft (keep existing characters and story direction; do not restart):',
    '集的完整短剧草稿（基于上述风格与节奏，自行设计人物与剧情）。': 'episode complete short-drama draft (based on the style and rhythm above; invent characters and plot).',
    '文本框为空或只有模板骨架，将载入「': 'Text box is empty or only a template skeleton — loading "',
    '」：示例草稿已载入上方文本框，风格已锁定。可直接改稿，或点「AI 帮我扩写」。': '": sample draft loaded above and style locked. Edit freely, or click "AI expand".',
    '用这个起稿': 'Start from this',
    '请直接起草一份 ': 'Draft a ',
    '集（单集 1-2 分钟竖屏短剧）': '-episode (1-2 min vertical short drama per episode)',
    '集，每集都带「第X集」标题（X 为阿拉伯数字）。': 'episodes, each titled "Episode X" (Arabic numerals).',

    /* —— 分镜脚本（第5步）—— */
    '我把剧本拆成一个个镜头：时长、节奏、景别、人物、对白、光线、机位、画面与图生视频提示词，字段全铺开。镜头时长档可选 5/10/15/30 秒（默认 5 秒），镜头数按「本集秒数 ÷ 档位」自动分配。可以整集交给我，也可以自己增删。分镜就绪后，从底部「导出资产包」一键把所有提示词带走，去即梦 / 可灵 / Midjourney 生图生视频。': 'I split the script into shots: duration, pace, shot size, characters, dialogue, light, camera, image and video prompts — all fields open. Shot length is 5/10/15/30s (default 5s), shot count auto-allocated as episode seconds ÷ length. Hand me the whole episode or edit shots yourself. When ready, export everything from the Export Asset Pack button and take it to Jimeng / Kling / Midjourney.',
    '生成分镜': 'Generate shots', '生成第 ': 'Generate episode ',
    '添加镜头': 'Add shot', '全部收起': 'Collapse all',
    '下一集 →': 'Next episode →',
    '镜头时长': 'Shot length',
    '本集 ': 'This episode ',
    ' ÷ ': ' ÷ ', ' ≈ ': ' ≈ ', ' 镜': ' shots',
    '分镜改动会自动保存。': 'Shot edits save automatically.',
    '这一集还没有分镜。点「生成分镜」，我按镜头预算拆出来；也可以自己「添加镜头」。': 'No shots yet. Click "Generate shots" and I will split by shot budget, or add shots yourself.',
    '尚未生成分镜': 'No shots generated yet',
    '尚未生成分镜，暂无可审计内容': 'No shots generated — nothing to audit yet',
    '生成中…': 'Generating…',
    '精修': 'Refine', '删除': 'Delete',
    '精修转不停': 'Refining…',
    '场景 / 景别（标题）': 'Scene / shot size (title)',
    '人物名，多个用、分隔': 'Character names, separated by commas',
    '画面中发生的动作': 'The action in frame',
    '该镜对白（可空）': 'Dialogue for this shot (optional)',
    '如：雨声 / 悬疑BGM（可空）': 'e.g. rain / suspense BGM (optional)',
    '如：黄昏暖光 / 冷调': 'e.g. dusk warm light / cold tone',
    '如：近景 / 俯拍': 'e.g. close-up / high angle',
    '如：紧张 / 温情': 'e.g. tense / tender',
    '纯视觉：人物+场景+光线+景别+画风，供出图': 'Visual only: character + scene + light + shot size + style, for image gen',
    '镜头运动+动作+时间轴+角色映射，供出视频': 'Camera move + action + timeline + character mapping, for video gen',
    '时长(秒)': 'Duration (s)', '节奏': 'Pace',
    '景别': 'Shot size',
    '分镜就绪。本地版是纯剧本工作台，不内置出图 / 出片；点「导出资产包」把所有提示词一次性带走，去即梦 / 可灵 / Midjourney 生图生视频。': 'Shots ready. This local version is a pure screenwriting workbench — no built-in image or video generation. Click "Export Asset Pack" to take all prompts to Jimeng / Kling / Midjourney.',
    '剧本已生成完毕': 'Script complete',
    '本地版是纯剧本工作台——出图、配音、成片请拿导出的提示词去你自己的即梦 / 可灵 / Midjourney 等工具完成。点右侧按钮一键导出全剧内容资产包（.md），带走即开工。': 'This local version is a pure screenwriting workbench — do image, voice and final cut with the exported prompts in your own Jimeng / Kling / Midjourney. Click the button to export the full asset pack (.md) and get to work.',

    /* —— 一致性审计 / 完整性校验 —— */
    '运行一致性审计': 'Run continuity audit',
    '我会逐条核对人物 / 时间线 / 设定有没有打架，列出问题并定位到集和镜。平时不用常看。': 'I check every rule against characters, timeline and settings, list conflicts and pinpoint episode and shot. Not needed day to day.',
    '我在逐条对人物、时间线和设定，有冲突的会标到具体集和镜。': 'Checking characters, timeline and settings rule by rule; conflicts are tagged to specific episodes and shots.',
    '正在核对审计规则': 'Checking audit rules',
    '核对中…': 'Checking…',
    '我这边还没接上核对通道，自动核对做不了。你可以在下拉框里手动勾选每条规则。': 'Audit channel not connected — auto-check unavailable. You can tick each rule manually.',
    '审计未能解析出有效结构，请重试或手动勾选。': 'Could not parse a valid audit structure. Retry or tick manually.',
    '一致性审计将校验人物 / 时间线 / 设定矛盾，列出问题并定位到集与镜，将在后续阶段实现。': 'Continuity audit checks character / timeline / setting conflicts and pinpoints episode and shot (coming in a later stage).',
    '校验人物 / 场景 / 时间线矛盾，定位到集与镜。': 'Checks character / scene / timeline conflicts and pinpoints episode and shot.',
    '全剧人物 / 场景的出场与登记未发现明显漂移。审计规则请见下方手动或自动核对。': 'No obvious drift found in character / scene appearances and registration. See rules below for manual or auto check.',
    '出片前建议跑一次步骤⑤一致性审计': 'Run a continuity audit (step 5) before locking the cut',
    '以下为「建议完善」项，': 'The following are "suggested improvements" — ',
    '不阻拦': 'they do not block',
    '你继续。核对无误即可推进；想跳过也可直接继续。': 'you. Confirm and proceed, or skip ahead.',
    '未发现明显待完善项，可以放心继续。': 'No obvious gaps — proceed with confidence.',
    '完整性校验 · 软提示': 'Completeness check · soft hints',
    '交片前我对照故事中枢和分镜做一遍完整性检查（软提示），列「建议完善」项，但不拦你出片。快速试片和正式交付都能用。': 'Before locking the cut I run a completeness check against the Story Bible and shots (soft hints): suggested improvements are listed but never block you. Works for quick tests and final delivery.',
    '请先完成步骤③分集大纲与步骤⑤生成分镜脚本，审计会自动比对全剧人物 / 场景设定与分镜画面是否一致。': 'Complete step 3 (episode outline) and step 5 (generate shots) first; the audit then compares characters / scenes against the shots automatically.',
    '一键自动修复': 'Auto-fix all',
    '自动修复': 'Auto-fix',
    '已自动修复 ': 'Auto-fixed ',
    '已自动修复该处：把缺失的服装 / 标志物补回到该镜头的「画面提示词」（剧情不变）。到步骤⑤ 生成分镜脚本可查看。': 'Fixed this spot: missing costume / signature item restored in the shot\'s image prompt (story unchanged). View it in step 5.',
    '当前没有可自动修复的项。': 'Nothing to auto-fix right now.',
    '缺失元素已在提示词中，无需修改。': 'Missing elements are already in the prompt — no change needed.',
    '该问题无需修改，或缺失元素已在提示词中。': 'No change needed, or the missing elements are already in the prompt.',
    '确认放行 · ': 'Confirm pass · ',
    '风险': 'Risk', '通过': 'Pass',
    '（仅显示首处）。可一键把该标志物补回画面提示词。': '(first occurrence only). One click restores the signature item in the image prompt.',
    '（仅显示首处）。可一键把锁定服装补回该镜画面提示词。': '(first occurrence only). One click restores the locked costume in this shot\'s image prompt.',

    /* —— 审计问题提示 —— */
    '故事中枢人物「': 'Story Bible character "',
    '故事中枢场景「': 'Story Bible scene "',
    '故事中枢锁定服装「': 'Story Bible locked costume "',
    '故事中枢要求始终保留「': 'Story Bible requires always keeping "',
    '分镜出现人物「': 'Shot shows character "',
    '分镜场景「': 'Shot scene "',
    '未在故事中枢登记': 'not registered in the Story Bible',
    '尚未出现在任何分镜': 'has not appeared in any shot yet',
    '尚未在分镜中出现': 'has not appeared in any shot yet',
    '服装可能漂移': 'costume may drift',
    '」不可变标志物可能丢失': '" signature item may be lost',
    '可能是笔误，或需在步骤②（故事中枢）补充该人物档案，否则出图无法锁定其定妆。': 'Possibly a typo, or add this character in step 2 (Story Bible), otherwise image gen cannot lock their look.',
    '建议在步骤②（故事中枢）补充该场景档案，统一其定妆与色调。': 'Consider adding this scene in step 2 (Story Bible) to unify its look and tone.',
    '若此角色已下线可忽略；否则请确认步骤⑤已为该角色生成镜头。': 'Ignore if this character is done; otherwise confirm step 5 generated shots for them.',
    '若该场景暂未用到可忽略。': 'Ignore if this scene is not used yet.',

    /* —— 巡航 —— */
    '一键巡航完成：已生成 ': 'One-click cruise complete: generated ',
    '巡航完成': 'Cruise complete',
    '巡航中断：': 'Cruise interrupted: ',
    '已取消巡航，已完成部分已保存': 'Cruise cancelled — completed parts saved',
    '一键巡航，我连着往下跑：创建故事中枢 → 改编蓝图 → 分集 → 逐集改编剧本 → 生成分镜脚本（不出图、不出片）。': 'One-click cruise runs it all: create Story Bible → adaptation blueprint → episodes → per-episode scripts → generate shots (no image, no video).',
    '预计消耗约 ': 'Estimated cost about ',
    '集估算，每日额度护栏照常）。是否开始？': 'episodes (daily quota guard still applies). Start?',
    '已请求取消，当前步骤完成后停止…': 'Cancel requested — stops after the current step…',
    '先生成故事地图（叙事弧 / 转折点 / 情绪曲线），再按故事事件重要性切集，稍候…': 'Generating the story map (arc / turns / emotion curve) first, then cutting by event weight — one moment…',
    '阶段 1/5 · 创建故事中枢': 'Stage 1/5 · Create Story Bible',
    '阶段 2/5 · 改编蓝图': 'Stage 2/5 · Adaptation Blueprint',
    '阶段 3/5 · 分集大纲': 'Stage 3/5 · Episode Outline',
    '阶段 4/5 · 改编第 ': 'Stage 4/5 · Adapt episode ',
    '阶段 5/5 · 生成分镜 第 ': 'Stage 5/5 · Generate shots, episode ',

    /* —— 通用按钮 / 提示 —— */
    '取消': 'Cancel', '继续': 'Continue', '确定': 'OK',
    '保存中…': 'Saving…', '保存失败': 'Save failed',
    '生成': 'Generate', '创建': 'Create', '删除': 'Delete',
    '确认删除项目「': 'Delete project "',
    '」？删除后不可恢复。': '"? This cannot be undone.',
    '删除失败：': 'Delete failed: ',
    '重命名失败：': 'Rename failed: ',
    '项目名称（当前：': 'Project name (current: ',
    '已存在同名项目：「': 'A project with the same name exists: "',
    '项目不存在': 'Project does not exist',
    '项目没拿到': 'Project not loaded',
    '项目没拿到：': 'Project not loaded: ',
    '已复制到剪贴板': 'Copied to clipboard',
    '复制失败，请手动选择文本': 'Copy failed — please select the text manually',
    '网络异常，请稍后重试': 'Network error, please retry',
    '网络错误，请确认已从服务器地址打开页面': 'Network error — make sure you opened the page from the server address',
    '未知': 'Unknown', '未知错误': 'Unknown error',
    '无': 'None', '未选择': 'Not selected', '（暂无）': '(none)',
    '（暂无分集）': '(no episodes)',
    '这一节还没有内容': 'This section is empty',
    '通用': 'General', '提示': 'Tip', '注意': 'Note',
    '请填写有效的替换内容': 'Please enter valid replacement text',
    '请求超时（> ': 'Request timed out (> ',
    's），请重试': 's). Please retry.',
    '超时': 'Timeout',
    '服务端拒绝': 'Server rejected',
    '响应解析失败 (HTTP ': 'Failed to parse response (HTTP ',
    '上传出错：': 'Upload error: ',
    '内容被屏蔽': 'Content blocked',
    '内容安全拦截：您提交的内容包含违反法律法规的信息（': 'Content safety filter: your submission contains information that violates laws and regulations (',
    '仍有未处理的敏感内容，确认带风险进入分集？服务端仍会最终审核，违规内容无法保存。': 'Unresolved sensitive content remains — proceed at your own risk? The server still reviews finally; violations cannot be saved.',
    '违规': 'Violation',
    '余额不足': 'Insufficient balance',
    '余额不足：需 ¥': 'Insufficient balance: need ¥',
    '。请先在右上角充值，再来下载。': '. Please top up in the top right, then download.',
    '我已支付，点此确认': 'I have paid — confirm',
    '支付成功，已到账': 'Payment successful — balance credited',
    '未查询到支付结果': 'Payment result not found',
    '下单失败': 'Order failed',
    '购买中…': 'Purchasing…', '购买失败': 'Purchase failed',
    '购买并下载': 'Buy & download',
    '购买确认': 'Confirm purchase',
    '。购买后可反复下载。确认购买？': '. Re-downloadable after purchase. Confirm?',
    '需 ¥': 'needs ¥',
    '，文件开始下载。': ' — the file download has started.',
    '，从余额扣除': ', deducted from balance',
    '（当前余额 ¥': '(current balance ¥',
    '（上线前可临时用后台补余额）': '(you can top up from the admin panel before launch)',
    '（若已扣款请联系管理员补记，钱不会丢）': '(if charged, contact the admin to credit it — no money is lost)',
    '登录 / 注册': 'Log in / Sign up',
    '登录失败': 'Login failed',
    '密码至少 6 位': 'Password must be at least 6 characters',
    '请输入有效的邮箱地址': 'Please enter a valid email address',
    '请先阅读并勾选同意用户协议与隐私政策': 'Please read and check the user agreement and privacy policy',
    '未登录': 'Not logged in',
    '用户取消': 'Cancelled by user',
    '计费校验异常：': 'Billing check error: ',
    '计费校验未通过，本次未扣费，请刷新页面重试': 'Billing check failed; nothing charged. Refresh and retry.',

    /* —— 音色 / 配音（残留入口）—— */
    '试听失败：': 'Preview failed: ',
    '试听请求出错：': 'Preview request error: ',
    '你好，这是一段配音试听，方便你挑选合适的音色。': 'Hi, this is a voice preview to help you pick a timbre.',
    '复刻音色': 'Clone voice',
    '复刻成功：': 'Voice cloned: ',
    '复刻失败：': 'Voice clone failed: ',
    '复刻请求出错：': 'Voice clone request error: ',
    '正在复刻声音（约 10~20 秒样本，通常几秒）…': 'Cloning voice (10-20s sample, usually a few seconds)…',
    '正在上传样本…': 'Uploading sample…',
    '样本上传失败：': 'Sample upload failed: ',
    '样本过大，请控制在 10MB / 20 秒内': 'Sample too large — keep it under 10MB / 20s',
    '▶ 试听': '▶ Preview',
    '我的克隆': 'My clone', '火山预设': 'Volcano preset',
    '「我的克隆」是你上传样本复刻的声线；「火山预设」需配置火山语音凭证后生效。': '"My clone" is the timbre you cloned from a sample; "Volcano preset" needs Volcano voice credentials configured first.',
    '低沉男声': 'Deep male voice', '沉稳男声': 'Steady male voice',
    '清朗少年': 'Bright young male', '阴郁男声': 'Brooding male voice',
    '女声': 'Female voice', '男声': 'Male voice',
    '温柔女声': 'Gentle female voice', '清冷女声': 'Cool female voice',
    '电子女声': 'Electronic female voice', '童声': 'Child voice',
    '（推荐音色：': '(suggested voice: ',
    '（声音：': '(voice: ',

    /* —— 交付 / 资产包 —— */
    '导出资产包': 'Export Asset Pack',
    '已购买「': 'Purchased "',
    '下载「': 'Download "',
    '由 MojingeStory 导出的全剧内容资产包：故事总纲 + 改编蓝图 + 全局风格卡 + 人物 DNA 档案（16 字段 + 生图提示词）+ 场景三段描写 + 每集剧本与分镜提示词 + 配音稿 / 字幕表 / 音效谱。拿去即梦 / 可灵 / Midjourney 等任意平台出图出视频，配音与字幕直接照表开工。': 'Full asset pack exported by MojingeStory: story outline + adaptation blueprint + style card + character DNA profiles (16 fields + image prompts) + scene descriptions + per-episode scripts and shot prompts + voice-over / subtitle / SFX sheets. Take it to Jimeng / Kling / Midjourney for image and video; voice and subs follow the sheets directly.',
    '## 人物 DNA 档案': '## Character DNA Profiles',
    '## 场景资产（三段描写 + 堪景单）': '## Scene Assets (3-tier description + scout sheet)',
    '## 故事总纲': '## Story Outline',
    '## 改编蓝图（小说 → 短剧的决策记录）': '## Adaptation Blueprint (novel → short-drama decisions)',
    '## 全局风格卡': '## Global Style Card',
    '## 分集 / 分镜': '## Episodes / Shots',
    '### 人物合并': '### Character Merges',
    '### 保留的故事线': '### Kept Storylines',
    '### 砍掉的故事线': '### Cut Storylines',
    '### 分集切分点': '### Episode Cut Points',
    '### 爽点重排': '### Payoff Reorder',
    '### 忠实度声明': '### Fidelity Statement',
    '配音稿（全剧·按集）': 'Voice-over sheet (full series, by episode)',
    '字幕表（全剧·按集）': 'Subtitle sheet (full series, by episode)',
    '音效谱（全剧·按集）': 'SFX sheet (full series, by episode)',
    '本地开源版是纯剧本工作台，不内置出图、配音、成片。后续渲染工序请把导出的资产包拿去云端托管版或你自己的出图 / 出视频工具完成。': 'This local version is a pure screenwriting workbench — no built-in image, voice or final cut. Do the rendering with the exported asset pack in a hosted version or your own image / video tools.',

    /* —— 场景三段式字段 —— */
    '- **全景（空间全貌）**：': '- **Wide (full space)**: ',
    '- **中景（结构细节）**：': '- **Medium (structural detail)**: ',
    '- **特写（氛围道具）**：': '- **Close-up (atmosphere props)**: ',
    '- **堪景单**：': '- **Scout sheet**: ',
    '- **定妆描述**：': '- **Look description**: ',
    '- **性格**：': '- **Personality**: ',
    '- **服饰**：': '- **Costume**: ',
    '- **生图提示词**：`': '- **Image prompt**: `',
    '- **生图提示词（直接粘贴用）**：`': '- **Image prompt (paste-ready)**: `',
    '**分镜（生视频）：**': '**Storyboard (for video gen):**',
    '空间布局：面积/朝向、几进几出、左右前后关系': 'Layout: area / orientation, room count, front-back relations',
    '建筑形制与材质等级（如 歇山顶木构、金丝楠梁柱、云锦帐幔、青砖墁地）': 'Architecture & material grade (e.g. gabled timber, nanmu columns, brocade drapes, brick floor)',
    '陈设清单及各自材质（如 紫檀拔步床/鎏金香炉）': 'Furnishing list with materials (e.g. rosewood canopy bed / gilt censer)',
    '主光源与时段光线（如 晨雾自南窗漫入、鎏金灯盏余晖、纱帐透柔光）': 'Key light & time-of-day (e.g. dawn fog through south window, gilt lamp afterglow, soft light through gauze)',
    '色调与氛围（如 暖金朱红，晨雾柔光）': 'Palette & mood (e.g. warm gold vermilion, soft dawn fog)',
    '整体氛围与情绪（如 华贵幽静中透孤寂）': 'Overall mood & emotion (e.g. quiet luxury with loneliness)',
    '【场景定妆·综合】把下面七项凝成一段可直接用于 AI 生图的综合描述（季节/时段/天气/地点样貌/建筑陈设/主色调/光线/道具），禁止留空或笼统': '[Scene look] Condense the seven items below into one image-gen-ready description (season / time / weather / location / furnishings / palette / light / props). Never empty or vague',
    '【定妆描述·最关键】具体到能照着画出来：性别、年龄段、发型与发色、五官特点、体型、上衣/下装/鞋的颜色与款式、随身物品、气质神态。文中没写的必须结合时代/季节/天气/身份合理补全，禁止留空或写笼统词': '[Look — most critical] Drawable detail: gender, age, hairstyle & color, features, build, top/bottom/shoe colors and cuts, carried items, demeanor. Anything unstated must be inferred from era / season / weather / identity. Never empty or vague',
    '【场景定妆·综合】把下面的堪景单七项凝成一段可直接用于 AI 生图的综合描述，禁止留空或笼统': '[Scene look] Condense the seven scout items below into one image-gen-ready description. Never empty or vague',
    '【定妆描述·最关键】具体到能照着画出来：性别、年龄段、发型与发色、五官特点、体型、上衣/下装/鞋的颜色与款式、随身物品、气质神态。文中没写的必须结合时代/季节/天气/身份合理补全，禁止留空或笼统（如「漂亮」「普通」）': '[Look — most critical] Drawable detail: gender, age, hairstyle & color, features, build, top/bottom/shoe colors and cuts, carried items, demeanor. Anything unstated must be inferred from era / season / weather / identity. Never empty or vague (e.g. "pretty", "average")',
    '材质等级与色彩，必须匹配【总纲·物料等级体系】该身份档位：公主房=金丝楠/云锦/鎏金/羊脂玉等皇家物料+暖金朱红主色，绝不可出现破屋/普通木/冷灰': 'Material grade and color must match the identity tier in the outline: princess room = royal materials + warm gold vermilion; never hovel / plain wood / cold grey',
    '材质等级与色彩，必须匹配总纲物料等级体系该身份档位：公主房=皇家物料+暖金朱红，绝不可破屋/普通木': 'Material grade and color must match the identity tier: princess room = royal materials + warm gold vermilion; never hovel / plain wood',

    /* —— 风格卡 / 题材模板 —— */
    '全片统一的视觉/美术基调：主色调、质感、光影、构图锚（供 AI 出图出视频保持一致性）': 'Unified visual direction: palette, texture, light, composition anchors (keeps AI image and video consistent)',
    '风格已锁定': 'Style locked',
    '（风格已锁定）': '(style locked)',
    '重新套用': 'Re-apply',
    '已套用「': 'Applied "',
    '」的制式（风格/镜头基调/节奏/角色蓝图）套用到当前剧本，你的故事与文本不会被替换。确定继续？': '"\'s template (style / camera tone / rhythm / character blueprint) to the current script. Your story and text are not replaced. Continue?',
    '将把「': 'Apply "',
    '」制式：风格/镜头基调/节奏已锁定，角色蓝图已合并，原剧本未改动。': '" template: style / camera tone / rhythm locked, character blueprint merged, original script untouched.',
    '古装穿越·脑洞': 'Costume time-travel · high-concept',
    '女频重生·打脸': 'Female-led rebirth · face-slapping',
    '男频逆袭·战神': 'Male-led rise · war god',
    '都市霸总·甜宠': 'Urban CEO · sweet romance',
    '东方玄幻': 'Eastern fantasy', '东方玄幻 · 剑修': 'Eastern fantasy · sword cultivation',
    '赛博废土': 'Cyber wasteland', '赛博废土 · 悬疑': 'Cyber wasteland · mystery',
    '现代言情 · 甜虐': 'Modern romance · sweet & angsty',
    '古风重生 · 短剧': 'Ancient-style rebirth · short drama',
    '现代写实': 'Modern realistic', '古风': 'Ancient style',
    '古代X朝 + 现代都市': 'Ancient dynasty X + modern city',
    '古代侧': 'Ancient side', '现代侧': 'Modern side',
    '穿越': 'Time-travel', '通用': 'General',
    '技能': 'Skill',
    '9:16 竖屏': '9:16 vertical',
    '来源：规则切分（按句）': 'Source: rule split (by sentence)',
    '来源：我按本集剧本拆的': 'Source: split from this episode\'s script',
    '穿越错位 → 降维打击 → 整顿家族+打脸': 'Time-travel mismatch → dimension-drop strike → family reckoning + face-slapping',
    '底层受辱 → 身份觉醒 → 全场碾压打脸': 'Humiliated at the bottom → identity awakening → crushing the whole room',
    '前世惨死 → 重生清醒 → 精准复仇打脸': 'Wrongful death → reborn and clear-headed → precise revenge',
    '契约开局 → 相处撒糖 → 误会与拉扯 → 追妻': 'Contract start → sweet days → misunderstanding and tug-of-war → winning her back',

    /* —— 结构校验 / 分镜节奏提示 —— */
    '钩子·0-5秒·具体动作/对白': 'Hook · 0-5s · concrete action / dialogue',
    '冲突·5-25秒·具体动作/对白': 'Conflict · 5-25s · concrete action / dialogue',
    '30~50字核心事件+情绪落点': '30-50 characters core event + emotional beat',
    '30 秒档：多数视频模型单条上限 10~15 秒，出片后窗口按实际素材时长收缩，需多镜或分轨补足': '30s tier: most video models cap at 10-15s per clip; the window shrinks to actual footage — add shots or tracks to fill',
    '弱冲突': 'Weak conflict', '纯铺垫': 'Pure setup', '重复/雷同': 'Duplicate / similar',
    '情绪定格': 'Emotion freeze', '转折': 'Turn', '卡点': 'Cliffhanger',
    '戏核': 'Story core', '微表情': 'Micro-expression',
    '起幅：近景，第一帧男主已在画面内，居画面左三分之一，背后城门虚化': 'Opening frame: close-up, male lead already in frame at the left third, city gate blurred behind',
    '摄影机从门口缓慢推至桌前': 'Camera slowly pushes from the door to the table',
    '右脚前跨半步，左手扶刀柄': 'Right foot half-step forward, left hand on the hilt',
    '距桌沿一步': 'One step from the table edge',
    '背对镜头': 'Back to camera', '背靠墙': 'Back against the wall',
    '背靠城墙': 'Back against the city wall',
    '两人视线相接': 'Their eyes meet',
    '头转向X': 'Head turns to X', '眼睛死死锁定X': 'Eyes locked on X',
    '手握门把手': 'Hand on the doorknob',
    '环绕': 'Orbit', '缓推': 'Slow push', '手持': 'Handheld',
    '平视': 'Eye level', '俯拍': 'High angle', '仰拍': 'Low angle',
    '中景': 'Medium shot', '中近景': 'Medium close-up', '中景深': 'Medium depth',
    '全景': 'Wide shot', '特写': 'Close-up', '浅景深': 'Shallow depth of field',
    '破晓': 'Dawn', '黄昏': 'Dusk', '午后': 'Afternoon', '窗光': 'Window light',
    '霓虹光': 'Neon light', '烛火': 'Candlelight', '蓝调时刻': 'Blue hour',
    '暖柔粉': 'Warm soft pink', '暖黄褐': 'Warm amber', '荧光霓虹': 'Fluorescent neon',
    '青绿金': 'Verde green & gold', '古色古香': 'Antique charm',
    '伦勃朗光': 'Rembrandt light', '电影感自然光、暖色调、浅景深；都市情感细腻；3 个核心角色自带推荐音色；每集 60 秒 8 镜、对白密集。进来即带一份 6 集"破镜重圆"草稿，直接改稿。': 'Cinematic natural light, warm palette, shallow depth; nuanced urban emotion; 3 core roles with suggested voices; 60s / 8 shots per episode, dialogue-dense. Comes with a 6-episode "reunion" draft — edit directly.',
    '仙侠水墨、流光剑气、青绿山峦；3 个核心角色自带推荐音色；每集 60 秒 9 镜、对白中等。进来即带一份 6 集"废脉少年逆袭"草稿，直接改稿。': 'Ink-wash xianxia, flowing sword light, green mountains; 3 core roles with suggested voices; 60s / 9 shots per episode, moderate dialogue. Comes with a 6-episode "wasted-talent youth rises" draft — edit directly.',
    '工笔重彩、侧逆光浅景深、黄昏暖调；3 个核心角色自带推荐音色；每集 60 秒 8 镜。进来即带一份 6 集重生权谋草稿，直接改稿。': 'Fine-brush heavy color, side-backlight shallow depth, dusk warmth; 3 core roles with suggested voices; 60s / 8 shots per episode. Comes with a 6-episode rebirth-political draft — edit directly.',
    '霓虹光、荧光色调、蓝调时刻；手持俯拍、中景深；2 个核心角色；每集 45 秒 10 镜、对白密集。进来即带一份 6 集义体侦探草稿，直接改稿。': 'Neon light, fluorescent palette, blue hour; handheld high angle, medium depth; 2 core roles; 45s / 10 shots per episode, dialogue-dense. Comes with a 6-episode cyborg-detective draft — edit directly.',

    /* —— 角色示例标签 —— */
    '女主·AI 幽灵': 'Female lead · AI ghost',
    '女主·单亲插画师': 'Female lead · single-mom illustrator',
    '女主·宗门师姐': 'Female lead · sect senior sister',
    '女主·将门孤女': 'Female lead · orphan of a general\'s house',
    '男主·义体侦探': 'Male lead · cyborg detective',
    '男主·傲娇总裁': 'Male lead · tsundere CEO',
    '男主·废脉少年': 'Male lead · wasted-meridian youth',
    '男主·重生权臣': 'Male lead · reborn power minister',
    '女儿·豆豆': 'Daughter · Doudou',
    '反派·上古魔修': 'Antagonist · ancient demon cultivator',
    '反派·佞臣': 'Antagonist · treacherous minister',

    /* —— 黑名单词（安全词表，保留中文不翻也无妨，此处仅少量 UI 呈现）—— */
    '结构一致性校验通过': 'Structural consistency check passed',
    '结构层契约': 'Structural contract',
    '模式：': 'Mode: ',
    '标签': 'Tag', '官方': 'Official', '服务端': 'Server',
    '点不进去': 'Cannot open',
    '（上次自动核对：': '(last auto-check: ',
    '（已知风险）': '(known risk)',
    '（请手动修改）': '(please edit manually)',
    '（本集分镜未标注出场人物）': '(no characters marked for this episode\'s shots)',
    '（本集无台词，纯画面 + 音效）': '(no dialogue this episode — visuals + SFX only)',
    '（时间轴按镜头时长累计估算，以实际成片为准）': '(timeline estimated from shot durations; the final cut rules)',
    '（音效出现的镜头内时机，见各镜图生视频词的「环境音」段）': '(SFX timing within shots — see each shot\'s video prompt "ambient" section)',
    '（情绪：': '(emotion: ',
    '（适用范围：': '(applies to: ',
    '，已被系统屏蔽且未保存。请移除相关内容后重试。': ', blocked by the system and not saved. Remove it and retry.',
    '自动改名未生效（': 'Auto-rename did not take effect (',
    '），可在项目列表手动改名': ') — rename manually in the project list',
    '第X集': 'Episode X', '第N集 有概括力的标题': 'Episode N with a punchy title',
    '第': 'Episode', '集': 'ep',
    '幕': 'Act', '一': 'one', '一些': 'some',
    '句话弧光（从 X 到 Y）': '-sentence arc (from X to Y)',
    '一句话核心事件': 'Core event in one sentence',
    '这一集真正要拍的那件事': 'The one thing this episode must shoot',
    '围绕事件写的紧凑可拍剧本（四节拍完整，已删无关描写）': 'A tight shootable script around the event (four beats complete, unrelated description cut)',
    '不同侧面': 'Different facets',
    '只是呈现处境': 'Just presenting the situation',
    '拍得出来戏': 'Shootable drama',
    '接得住': 'Can hold the scene',
    '很有氛围': 'Very atmospheric',
    '她攥紧柴刀、指节发白': 'She grips the firewood knife, knuckles white',
    '她很伤心': 'She is very sad',
    '像其身份': 'Fits their identity',
    '场景出图不像其身份': 'Scene render does not fit their identity',
    '未出现：': 'Missing: ',
    '未见：': 'Not seen: ',
    '未分镜': 'No shots', '未分集': 'No episodes',
    '未在人物 DNA 登记声音描述': 'No voice description in character DNA',
    '说明：status 取 pass（遵守）、fail（明显违反）、warn（疑似违反/不确定）、na（规则不适用于当前内容）。': 'Note: status is pass (followed), fail (clearly violated), warn (suspected / unsure), na (rule does not apply).',
    '输出体量控制：hook 每条不超过 60 字（写画面+类型，不展开）；beats 每条一句话；keepLines/cutLines 的 desc/why 各不超过 40 字。整份 JSON 控制在 3500 字以内，宁可精炼不要铺陈。': 'Length control: each hook ≤60 characters (image + type only); each beat one sentence; keepLines/cutLines desc/why ≤40 characters each. Keep the whole JSON under 3500 characters — lean, not sprawling.',
    '硬性要求：episodeCuts 必须正好 ': 'Hard requirement: episodeCuts must be exactly ',
    '条且 ep 从 1 连续编号；每集钩子不低于 L3；第 1 集与中点集钩子达到 L4/L5；keepLines 3-5 条；cutLines 每条必须说明功能去向；全部中文。': 'items, numbered from 1; every episode hook ≥ L3; episode 1 and the midpoint episode reach L4/L5; 3-5 keepLines; every cutLine states where its function goes; all in Chinese.',
    '幕 \' + (i + 1) + \' 标题': 'Act \' + (i + 1) + \' title',
    '以下是用户已有的大纲 / 梗概，请在其基础上扩写、补全为 ': 'Below is the user\'s existing outline / synopsis — expand and complete it into ',
    '，从末尾删除多余的 ': ', delete the extra ',
    '，当前余额 ¥': ', current balance ¥',
    '千tokens': 'K tokens',
    '确认': 'Confirm',
    '此角色已下线可忽略': 'Ignore if this character is done',

    /* —— 第 12 轮：英文态全流程实测补漏（playwright 扫描 steps 1-9 + 弹窗） —— */
    /* 单位词（统计节点「N 集 / N 镜 / N 字」由引擎规则层处理，这里是裸单位） */
    '秒': 's', '段': 'paragraphs', '条': 'items', '镜': 'shots', '字': 'chars', '图': 'Map',
    /* 步骤① 导入 */
    '正文段落': 'Body paragraphs',
    '大远景': 'Extreme wide', '远景': 'Wide', '近景': 'Close', '大特写': 'Extreme close-up',
    '不指定': 'Unspecified', '慢': 'Slow', '正常': 'Normal', '快': 'Fast',
    '黑白主题切换（即将上线）': 'Toggle light / dark theme (coming soon)',
    '点击查看账户菜单': 'Account menu',
    /* 步骤② 故事中枢 */
    'AI 增强': 'AI Enhance',
    '重新 AI 通读 · 重建故事中枢': 'Re-read & Rebuild Story Bible',
    'AI 通读 · 创建故事中枢': 'Create Story Bible',
    '故事中枢已就绪': 'Story Bible ready',
    '故事中枢已就绪 · 按已有结构抽取（可手动完善）': 'Story Bible ready · extracted from the existing structure (editable)',
    '故事中枢已就绪 · 我通读全稿建的': 'Story Bible ready · built from a full read-through',
    '（通读通道没开，地图暂时出不来）': '(read-through unavailable — map paused)',
    '（通读通道没开，故事地图出不来）': '(read-through unavailable — story map paused)',
    '（通读失败，这次先降级处理）': '(read-through failed — falling back this time)',
    '这是「集规划」的依据：切集时按这些转折与情绪落点落刀，让每集都自带足量可拍素材，而不是机械按字数切。': 'This is the basis for episode planning: cut at these turning points and emotional beats so every episode carries enough shootable material — not a mechanical word-count slice.',
    '全剧地图 · 切集/改编依据': 'Story map · basis for outline & adaptation',
    '全剧地图（尚未生成 · 可一键生成）': 'Story map (not generated · one click)',
    '全剧地图 · 生成中…': 'Story map · generating…',
    '全剧地图（通读通道没开）': 'Story map (read-through unavailable)',
    '全作叙事骨架': 'Narrative skeleton',
    '生成后本细条会自动展开，无需回到步骤③。': 'It expands on its own once generated — no need to go back to step 3.',
    /* 步骤⑨ 改编蓝图 */
    '这一步我只干一件事：决定这部小说怎么变成短剧。我通读全稿后给出改编方案——保留哪些线、砍掉哪些线、哪些人物合并、每一集从原著哪里切进来、爽点怎么重排、哪些忠于原著哪些二创。每一项你都可以改，改完确认才进分集大纲。改编权在你手里。': 'This step does one thing: decide how this novel becomes a short drama. After a full read I give you the adaptation plan — which storylines stay, which get cut, which characters merge, where each episode cuts in from the source, how the payoffs re-pace, what stays faithful and what is second creation. Every line is editable; the outline step only starts once you confirm. The adaptation rights are yours.',
    '我通读你的全稿，给出这份小说变短剧的完整改编方案：哪些故事线保留、哪些砍掉、哪些人物合并、每一集从原著哪里切进来（带结尾钩子）、爽点怎么按短剧节奏重排、哪些忠于原著哪些二创。每一项都能改——': 'I read your full draft and lay out the complete adaptation plan: which storylines stay, which get cut, which characters merge, where each episode cuts in from the source (with its closing hook), how the payoffs re-pace to short-drama rhythm, what stays faithful and what is second creation. Every item is editable —',
    '，你确认的蓝图就是后面分集、剧本、分镜的宪法。': '; the blueprint you confirm becomes the constitution for every episode, script and shot that follows.',
    '改编权在你手里': 'You hold the adaptation rights',
    /* 步骤③ 分集大纲 */
    '按文档结构分集': 'By document structure',
    '分集方式：': 'Split by: ',
    '自定义': 'Custom', '自定义每集秒数：': 'Seconds per episode: ', '自定每集秒数': 'set your own',
    '章节边界': 'chapter boundaries',
    '文档结构优先：已生成故事中枢大纲则沿用其边界；否则识别章/集标题与章内场景标头（如「古代·秋云集·午后」「当天晚上」），把场景按你设定的': 'Document structure first: if the Story Bible outline exists, its boundaries are reused; otherwise chapter/episode titles and in-chapter scene headers (e.g. "Ancient · Qiuyun Inn · afternoon", "that evening") are detected, and scenes get packed into',
    '目标时长': 'target length',
    '打包成片集。章边界为硬断，场景短则合并、长则按句切，绝不删戏。（每集时长由上方秒数档位决定，可选 20~1800 秒）': 'episodes. Chapter boundaries are hard cuts; short scenes merge, long ones split by sentence — nothing is dropped. (Episode length comes from the seconds tabs above; 20–1800s.)',
    '进入第 1 集改编剧本 →': 'Enter Episode 1 script →',
    '模式：按字数规则切的（兜底） · 每集已切分并估算时长与字数': 'Mode: split by word count (fallback) · episodes cut, with length and character estimates',
    '本剧共': 'Total ', '目标总时长': 'Target length', '有效时长': 'Effective length',
    '原文字数': 'Source chars', '镜头预算合计': 'Shot budget',
    '目标': 'Target', '有效': 'Effective', '镜头': 'Shots',
    '展开/收起': 'Expand / collapse', '分镜 →': 'Shots →',
    '还没分集。点「开始分集」，我先认剧名、人物设定和你已有的分集标题，再按剧情切；文档自带「第X集」会直接按标题切，没有的话按你设的集数、或由我按剧情切。切完进「改编剧本」，逐集点「✨ 转剧本」，我把小说段落压成 90 秒短剧的四节拍（钩子/冲突/转折/卡点），不保留原文描写。': 'No episodes yet. Hit "Start split" — I first read the title, character setup and any existing episode headings, then cut by plot. Documents with their own "Episode X" split by heading; otherwise by your episode count, or by plot. Then into the script step, hit "✨ To script" per episode and I compress the novel passage into a 90-second four-beat short (hook / conflict / turn / cliffhanger), dropping the original description.',
    '智能切集': 'Smart split', '按文档分集标题切分': 'By document headings', '按故事中枢大纲切分': 'By Story Bible outline',
    '我按剧情切的': 'By plot', '按字数规则切的（兜底）': 'By word count (fallback)',
    '按文档结构（章内拆场景·按时长打包）': 'By document structure (scenes packed by length)',
    '按故事地图内容规划切分': 'By story map plan',
    '还没提取戏剧事件。进「改编剧本」后点「✨ 转剧本」，我从小说里提炼这一集的戏核（想要/阻碍/转折/卡点）——这一步决定 90 秒到底拍什么。': 'No dramatic event extracted yet. Go to the script step and hit "✨ To script" — I will pull this episode\'s dramatic core (want / obstacle / turn / cliffhanger) from the novel. That decides what the 90 seconds actually shoot.',
    '继续': 'Continue', '调回建议值': 'Back to suggested',
    '当前内容约可支撑 ': 'Current content supports about ',
    ' 秒，但 90 秒短剧需要「钩子/冲突/转折/卡点」四节拍。建议进入「改编剧本」点「✨ 转剧本」把小说段落压缩成可拍节拍，而不是补字数。': 's, but a 90-second short needs all four beats (hook / conflict / turn / cliffhanger). Go to the script step and hit "✨ To script" to compress the passage into shootable beats instead of padding word count.',
    '原梗概': 'Original synopsis',
    /* 步骤④ 改编剧本 */
    '（本集暂无对应大纲）': '(no outline mapped to this episode)',
    '创作与生成分镜时，请以本集大纲为锚，确保人物、场景、情绪与大纲一致，不跑偏。': 'Anchor every rewrite and shot on this episode outline — keep characters, scenes and mood consistent.',
    '✨ 转剧本': '✨ To script', '✨ AI 补写': '✨ AI expand',
    '剧情概要': 'Synopsis', '原文': 'Source text',
    '下一步：生成分镜脚本 →': 'Next: generate shots →',
    '改写完成后进入分镜脚本，逐镜展开并出图。': 'Once rewritten, move on to shots — one row per shot.',
    '「剧本」为本集 AI 改写后的可拍脚本，「原文」为导入时该集的原著段落，二者可随时切换对照。': '"Script" is this episode\'s AI-rewritten shootable draft; "Source" is the original passage from import. Switch anytime to compare.',
    '来源：手动填写': 'Source: manual entry',
    '来源：我按本集剧本拆的': 'Source: split from this episode\'s script',
    '来源：规则切分（按句）': 'Source: rule split (by sentence)',
    '尚未生成分镜': 'No shots yet',
    '连续性检查': 'Continuity check',
    '连续性检查 · ShotLock': 'Continuity check · ShotLock',
    '检查中…': 'Checking…',
    '来源：AI 改写': 'Source: AI rewrite', '来源：手动': 'Source: manual',
    '来源：原文（待改编）': 'Source: original (awaiting adaptation)',
    /* 剧集卡片 · 戏剧事件 / 原梗概对照 */
    '原梗概': 'Original synopsis',
    '原梗概（扩写前存档）': 'Original synopsis (archived before expansion)',
    '本集戏剧事件 · AI 提取（核心事件可改）': "This episode's dramatic event · AI-extracted (core event editable)",
    '一句话核心事件（这集到底讲什么戏）': 'Core event in one sentence (what drama this episode actually delivers)',
    '想要': 'Want', '阻碍': 'Obstacle',
    /* 步骤⑤ 分镜脚本 */
    '列表': 'List', '画布': 'Canvas', '总览画布': 'Overview canvas',
    '动作': 'Action', '对白': 'Dialogue', '音效/配乐': 'Sound / music',
    '光线': 'Light', '机位': 'Camera', '情绪': 'Mood',
    '文生图提示词': 'Image prompt', '图生视频提示词': 'Video prompt',
    '+ 添加镜头': '+ Add shot', '🔄 精修': '🔄 Refine',
    '本集交付三件套：配音稿 / 字幕表 / 音效谱（点开即看，复制即拿走）': 'Episode deliverables: dub script / subtitle sheet / sound cues — open to view, copy to take',
    '配音稿（角色 + 声音设定 + 逐镜台词）': 'Dub script (cast + voices + line by line)',
    '字幕表（可直接贴剪映）': 'Subtitle sheet (paste straight into your editor)',
    '音效谱（混音 cue）': 'Sound cues (for the mix)',
    '本集暂无对应内容': 'Nothing here for this episode yet',
    '已选': 'Selected', '删除选中': 'Delete selected', '合并到下一镜': 'Merge into next shot',
    '重新生成选中': 'Regenerate selected', '取消选择': 'Clear selection',
    '去故事中枢补定妆 →': 'Complete the look in the Story Bible →',
    '提示词超长': 'Prompt too long', '缺图生视频词': 'Missing video prompt', '缺连贯段': 'Missing continuity link',
    /* 步骤⑦ 一致性审计 */
    '一键自动修复': 'Auto-fix all', '无可自动修复项': 'Nothing to auto-fix',
    '运行一致性审计': 'Run consistency audit',
    '结构校验自动完成；可自动修的「服装 / 标志物漂移」一键补回画面提示词，不可自动修的（如时间线矛盾）请判断后忽略。': 'Structural check runs automatically. Fixable drift (costume / prop) can be patched back into the image prompt in one click; unfixable ones (like timeline conflicts) are yours to judge or ignore.',
    '结构一致性（自动校验）': 'Structural consistency (auto)',
    '审计规则核对（来自故事中枢 · 点击展开）': 'Audit rules (from the Story Bible · click to expand)',
    '未在故事中枢定义「一致性审计规则」。可在步骤②「一致性审计规则」区块添加，例如：『林小满家境清贫，全片不得出现豪车名表』『苏锦儿玉佩从第2镜起始终佩戴』。定义后这里会逐条可勾选核对。': 'No consistency audit rules defined in the Story Bible yet. Add them in the "Audit rules" block of step 2, e.g. "Lin Xiaoman is poor — no luxury cars or watches anywhere" or "Su Jin\'er wears her jade pendant from shot 2 onward". Once defined, each rule can be checked here.',
    '通过': 'Pass', '风险': 'Risk', '提示': 'Tip', '注意': 'Warning',
    '自动修复': 'Auto-fix', '忽略': 'Ignore',
    '待核对': 'To review', '不适用': 'N/A',
    '引擎核对：': 'Engine check: ', '适用范围：': 'Applies to: ',
    '若此角色已下线可忽略；否则请确认步骤⑤已为该角色生成镜头。': 'Ignore if this character is done; otherwise confirm step 5 has generated shots for them.',
    '可能是笔误，或需在步骤②（故事中枢）补充该人物档案，否则出图无法锁定其定妆。': 'Probably a typo, or the character needs a profile in step 2 (Story Bible) — otherwise image generation cannot lock their look.',
    '若该场景暂未用到可忽略。': 'Ignore if the scene is not used yet.',
    '建议在步骤②（故事中枢）补充该场景档案，统一其定妆与色调。': 'Consider adding a profile for this scene in step 2 (Story Bible) to unify its look and tone.',
    '尚未生成分镜，暂无可审计内容': 'No shots yet — nothing to audit',
    '请先完成步骤③分集大纲与步骤⑤生成分镜脚本，审计会自动比对全剧人物 / 场景设定与分镜画面是否一致。': 'Finish step 3 (episode outline) and step 5 (generate shots) first; the audit then compares Story Bible characters / scenes against the shot visuals automatically.',
    '全剧人物 / 场景的出场与登记未发现明显漂移。审计规则请见下方手动或自动核对。': 'No obvious drift between character / scene appearances and their registrations. See the rules below for manual or automatic checks.',
    /* 步骤⑧ 完整性校验 */
    '故事中枢尚未生成': 'Story Bible not generated yet',
    '导入后我会在后台建起来；也可以到「故事中枢」自己补。': 'I will build it in the background after import; or fill it in yourself in the Story Bible.',
    '故事中枢暂无全剧大纲': 'No full-series outline in the Story Bible',
    '到步骤②补充大纲，可让分集 / 分镜更贴合定魂结构。': 'Add an outline in step 2 so episodes and shots follow the binding structure.',
    '幕 / 弧（故事单元）按多对一映射到分集，所以幕数通常少于集数，属正常结构：每集都对照所属幕创作，不会跑偏。': 'Acts / arcs (story units) map to episodes many-to-one, so acts are usually fewer than episodes — that is normal. Every episode is written against its act, so nothing drifts.',
    '可在集工作区用 AI 补写，或切换到更短秒数档位。': 'Use AI expand in the episode workspace, or switch to a shorter seconds tier.',
    '出片前建议跑一次步骤⑤一致性审计': 'Run a consistency audit in step 5 before exporting',
    '校验人物 / 场景 / 时间线矛盾，定位到集与镜。': 'Checks character / scene / timeline conflicts, down to the episode and shot.',
    '进入生成分镜脚本逐集生成分镜后再出片。': 'Generate shots episode by episode in step 5 before exporting.',
    '完整性校验 · 软提示': 'Completeness check · soft warnings',
    '以下为「建议完善」项，': 'The items below are "suggested improvements" — ',
    '不阻拦': 'they will not block',
    '你继续。核对无误即可推进；想跳过也可直接继续。': 'you. Check them over and move on, or skip straight ahead.',
    '未发现明显待完善项，可以放心继续。': 'Nothing obvious left to improve — feel free to continue.',
    '← 返回改编剧本': '← Back to script',
    '← 回到分镜脚本': '← Back to shots',
    '修复中…': 'Fixing…',
    '缺失元素已在提示词中，无需修改。': 'The missing elements are already in the prompt — nothing to change.',
    /* 导出 / 资产包（静态标题） */
    '剧本已生成完毕': 'Script complete',
    '当前项目还没有分集。': 'No episodes yet.',
    '导出全剧内容资产包 →': 'Export full asset pack →',
    '本地版是纯剧本工作台——出图、配音、成片请拿导出的提示词去你自己的即梦 / 可灵 / Midjourney 等工具完成。点右侧按钮一键导出全剧内容资产包（.md），带走即开工。': 'The local build is a pure screenwriting workbench — for images, voice and final cuts, take the exported prompts to your own Dreamina / Kling / Midjourney. Hit the button to export the full asset pack (.md) and get to work.',
    '由 MojingeStory 导出的全剧内容资产包': 'Full-series asset pack exported from MojingeStory',
    '交付三件套': 'Deliverables trio',
    '配音稿（全剧·按集）': 'Dub script (full series, by episode)',
    '字幕表（全剧·按集）': 'Subtitle sheet (full series, by episode)',
    '音效谱（全剧·按集）': 'Sound cues (full series, by episode)',

    /* ===== 故事中枢 · 树状栏面板（第十三轮补漏） ===== */
    /* 树状栏导航 */
    '搜索人物 / 场景 / 板块…': 'Search characters / scenes / sections…',
    '全剧': 'Whole show',
    '结构层': 'Structure layer',
    '设定层': 'Settings layer',
    '（暂无人物）': '(no characters yet)',
    '（暂无场景）': '(no scenes yet)',
    '（暂无关系）': '(no relations yet)',
    '风格卡': 'Style card',
    '全剧大纲（幕/弧）': 'Series outline (acts/arcs)',
    '情节点': 'Beats',
    '伏笔': 'Foreshadowing',
    '暗线': 'Subplots',
    '人物': 'Characters',
    '场景': 'Scenes',
    '关系': 'Relations',
    '审计规则': 'Audit rules',
    '全剧概览': 'Series overview',
    '故事地图': 'Story map',
    '总纲 · 世界设定': 'Outline · World setting',
    /* 概览面板 */
    '基础信息': 'Basic info',
    'AI 增强': 'AI boost',
    '来源：我通读全稿提取的': 'Source: extracted by my full read',
    '来源：手动填写': 'Source: manually filled',
    '情节流向图': 'Story flow map',
    '角色关系网': 'Character relation net',
    '整理故事中枢（合并重复人物/场景）': 'Tidy story bible (merge duplicate characters/scenes)',
    '从分集回灌基础大纲': 'Backfill outline from episodes',
    'AI 通读 · 创建故事中枢': 'AI read-through · create story bible',
    '重新 AI 通读 · 重建故事中枢': 'Re-read & rebuild story bible',
    /* 各面板标题 / 副标题 / 标签 */
    '总纲层': 'Outline layer',
    '总纲层 · 剧作的年代与世界观': 'Outline layer · era & worldview of the show',
    '我通读生成 · 可改': 'Generated by my read · editable',
    '锁定年代 / 朝代 / 大环境概述 / 装束体系，往下贯穿结构层 / 设定层 / 出图与出视频。朝代即使小说没明说也会给建议；改任意字段并保存即"锁定"全片对齐。': 'Locks era / dynasty / macro setting / costume system, running through the structure layer, settings layer, and image / video generation. Even if the novel never states the dynasty, a suggestion is given; edit any field and save to "lock" the whole show to it.',
    '全局风格卡': 'Global style card',
    '全剧统一的视觉与听觉契约：写好这张卡，所有出图 / 出视频提示词、AI 分镜都会自动带上它，防止集与集之间画风漂移。': 'A unified visual & audio contract for the whole show: once written, every image / video prompt and AI shot automatically carries it, preventing style drift between episodes.',
    '生效范围：文生图词 / 图生视频词自动注入；AI 生成分镜与单镜精修作为铁律注入；导出资产包独立成节；配乐基调进音效谱头部。': 'Scope: auto-injected into text-to-image / image-to-video prompts; enforced as a hard rule in AI shot generation and single-shot refinement; exported as its own section in the asset pack; music tone goes to the head of the SFX sheet.',
    'AI 帮我写风格卡': 'AI write the style card for me',
    '全剧骨架 · 幕 / 弧结构（定魂契约）': 'Series skeleton · acts / arcs (binding contract)',
    '这是整部剧的「定魂」结构，按幕 / 弧（故事单元）组织。一条幕可映射多集（多对一是正常结构，不是 bug）：分集时会按比例挂到对应幕，集工作区对照本幕创作，确保不跑偏。用「按大纲分集」模式分集后，每条幕会出现「在分集中高亮 →」，可一键跳到对应集工作区并高亮。': 'This is the "soul-binding" structure of the whole show, organized by acts / arcs (story units). One act can map to multiple episodes (many-to-one is normal, not a bug): when splitting episodes they are hung on the corresponding act proportionally, and the episode workspace creates against that act to stay on track. After splitting with the "split by outline" mode, each act shows "highlight in episodes →", jumping to that episode workspace in one click.',
    '暂无大纲。导入后我会自动搭好全剧骨架（幕 / 弧结构）；也可以点右上「+ 添加幕」自己录，或点上方「重新 AI 通读」让我来。': 'No outline yet. After import I auto-build the series skeleton (acts / arcs); or click "+ Add act" top-right to enter it yourself, or click "Re-read & rebuild story bible" above to let me do it.',
    '幕 / 弧 · 已映射': 'acts / arcs · mapped',
    '+ 添加幕': '+ Add act',
    '分集结果 · 每集 ↔ 定魂契约': 'Episode results · each episode ↔ binding contract',
    '这里汇总实际分出的集数与它们和故事中枢「定魂契约」（全剧大纲）的对应关系。返回故事中枢随时可查；某集未映射时可在步骤③重新分集或调整大纲。': 'This summarizes the actually split episodes and their mapping to the story bible "binding contract" (the series outline). Return to the story bible anytime to check; if an episode is unmapped, re-split in step ③ or adjust the outline.',
    '尚未映射到分集（重新分集可映射）': 'Not yet mapped to episodes (re-split to map)',
    '在左侧目录点选具体人物查看 / 编辑；下方为「人物档案」全部内容。': 'Pick a specific character in the left catalog to view / edit; below is all of "Character files".',
    '在左侧目录点选具体关系查看 / 编辑；下方为「人物关系」全部内容。': 'Pick a specific relation in the left catalog to view / edit; below is all of "Character relations".',
    '在左侧目录点选具体场景查看 / 编辑；下方为「场景档案」全部内容。': 'Pick a specific scene in the left catalog to view / edit; below is all of "Scene files".',
    '在左侧目录点选具体审计规则查看 / 编辑；下方为「一致性审计规则」全部内容。': 'Pick a specific audit rule in the left catalog to view / edit; below is all of "Consistency audit rules".',
    '在左侧目录点选具体条目查看 / 编辑；下方为「伏笔」全部内容。': 'Pick a specific entry in the left catalog to view / edit; below is all of "Foreshadowing".',
    '在左侧目录点选具体条目查看 / 编辑；下方为「情节点（Beat）」全部内容。': 'Pick a specific entry in the left catalog to view / edit; below is all of "Beats".',
    '在左侧目录点选具体条目查看 / 编辑；下方为「暗线」全部内容。': 'Pick a specific entry in the left catalog to view / edit; below is all of "Subplots".',
    '← 返回人物列表': '← Back to characters',
    '← 返回关系列表': '← Back to relations',
    '← 返回场景列表': '← Back to scenes',
    '人物档案': 'Character files',
    '场景档案': 'Scene files',
    '人物关系': 'Character relations',
    '情节点（Beat）': 'Beats',
    '一致性审计规则': 'Consistency audit rules',
    'AI 找回 / 手动补录': 'AI retrieve / manual backfill',
    'AI 通读生成 · 可改': 'AI read-through generated · editable',
    '手动登记 / AI 抽取': 'Manual register / AI extract',
    '手动添加 · 可选': 'Manual add · optional',
    '+ AI 找回/补录': '+ AI retrieve / backfill',
    '+ 添加': '+ Add',
    'AI 生成环境': 'AI generate environment',
    '环境即每个场景的定妆描述，包括季节 / 时段 / 天气 / 主色调 / 光线氛围 / 标志性道具。点右上「AI 生成环境」，我照原剧把缺的环境设定补齐，出图时场景前后才一致。': 'Environment is each scene\'s appearance description: season / time / weather / main color / light mood / signature props. Click "AI generate environment" top-right and I fill the missing environment from the original, so scenes stay consistent when generated.',
    '暂无内容。点右上「AI 找回/补录」填个人物或场景名（如 奶奶），引擎会从原剧自动抽回整套设定；或点上方「重新 AI 通读」一次性补全全部人物与场景。': 'No content. Click "AI retrieve / backfill" top-right and enter a character or scene name (e.g. Grandma); the engine auto-pulls the whole setup from the original. Or click "Re-read & rebuild story bible" above to complete all characters and scenes at once.',
    '暂无内容。点右上「添加」手动录入，或点上方「重新 AI 通读」自动生成。': 'No content. Click "Add" top-right to enter manually, or click "Re-read & rebuild story bible" above to auto-generate.',
    '（已自动过滤 ': '(auto-filtered ',
    ' 条无效条目）': ' invalid entries)',
    /* 各面板 description（bible-note） */
    '人物之间的核心关系，供下一步一致性审计使用。': 'The core relationships between characters, used by the consistency audit in the next step.',
    '伏笔是分镜前后呼应的骨架——埋设集与回收集标清后，对应集的分镜就能"接得住"。至少 3 条，覆盖全剧主要伏笔。': 'Foreshadowing is the backbone linking shots before and after — once the plant episode and payoff episode are marked, the corresponding episode\'s shots can "catch" it. At least 3, covering the main threads.',
    '写清「哪些设定必须前后一致」，下一步审计会据此逐条校验。': 'State which settings must stay consistent; the next-step audit checks them one by one.',
    '把每个关键场景的空间布局 / 建筑形制 / 陈设清单 / 材质等级 / 主光源 / 标志性道具 / 氛围写清楚，AI 出图时就能保证同一空间前后一致，并且符合剧中人物身份。原文里已有场景描写但还没建卡时，点右上角「AI 找回 / 补录」可自动提取；需要补全季节 / 时段 / 天气等环境设定时，点「AI 生成环境」。': 'Spell out each key scene\'s spatial layout / architecture / furnishings / material grade / key light / signature props / atmosphere. AI image generation then keeps the same space consistent and true to the characters\' status. If the original already describes a scene but no card exists, click "AI retrieve / backfill" top-right to auto-extract; to fill seasonal / time / weather environment, click "AI generate environment".',
    '暗线是贯穿全剧的人物动机类线索（如身世之谜）。标注涉及人物与关键节点，分镜才能在对应节点呼应。至少 2 条。': 'Subplots are character-motivation threads running through the whole show (e.g. the mystery of birth). Mark involved characters and key nodes so shots can echo them. At least 2.',
    '每个人的「定妆描述」是 AI 出图保持人物前后一致的「唯一依据」。请具体到能照着画出来：性别、年龄段、发型与发色、五官特点、体型、上衣/下装/鞋的颜色与款式、随身物品、气质神态。修改任意字段并保存后，后续分镜会自动沿用，等于把该设定「锁定」。': 'Each person\'s "appearance" is the ONLY basis for AI image generation to keep them consistent across shots. Be specific enough to draw: gender, age range, hair & color, facial features, body type, top/bottom/shoe colors & style, accessories, temperament. After editing any field and saving, later shots auto-apply it — i.e. you "lock" that setting.',
    '这是整部剧的「第零层契约」：锁定年代/朝代、大环境概述与装束体系，往下贯穿结构层、设定层与出图出视频。朝代即使小说没明说，系统也会给建议（如虚拟近唐/近宋）；大环境与装束按「从原剧提取 + AI 补充完整」生成，目标是"拍得出来戏"。你改任意字段并保存后，全片设定会据此对齐，等于把纲领"锁定"。': 'This is the "layer-zero contract" of the whole show: it locks the era / dynasty, macro setting and costume system, running down through the structure layer, settings layer, and image / video generation. Even if the novel never states the dynasty, the system suggests one (e.g. virtual near-Tang / near-Song); macro setting and costumes are generated by "extract from original + AI completion", aiming to be "filmable". After you edit any field and save, the whole show\'s settings align to it — i.e. you "lock" the charter.',
    /* 总纲 world 字段 label */
    '年代/朝代（古代·虚拟近宋 / 现代都市 / 近代 / 架空·近唐 / 穿越 等，须明确）': 'Era / dynasty (ancient·virtual near-Song / modern urban / recent / fantasy·near-Tang / time-travel, must be explicit)',
    '年代标签（如 北宋背景·架空王朝 / 现代都市·2024）': 'Era label (e.g. Northern Song backdrop·fantasy dynasty / modern urban·2024)',
    'AI 补充依据（哪些原文线索指向该朝代；若原文未明说，写明系统建议依据；可空）': 'AI basis (which original clues point to this era; if unspecified, state the system\'s suggested basis; may be empty)',
    '大环境概述（结合朝代从原剧提取+补全：时代背景、地理/社会风貌、核心冲突土壤、关键场景类型，具体到能照着搭出来）': 'Macro setting (from the original + AI completion: era backdrop, geography / social milieu, core-conflict soil, key scene types — specific enough to build)',
    '视觉系统·美术基调（全片统一的色调/质感/光影/构图锚，出图出视频一致）': 'Visual system · art tone (unified palette / texture / light-shadow / composition anchor for consistent image & video)',
    '装束体系（结合朝代+场景：各身份人物的服饰总纲，如 贵族/平民/军人 的材质·颜色·形制，全片统一）': 'Costume system (by era + scene: wardrobe guidelines per status — noble / commoner / soldier — unified)',
    '社会等级与物料质感体系（各阶层居所/陈设的物料等级：如 皇室=金丝楠/云锦/鎏金/羊脂玉，贵族=紫檀/绸缎，平民=榆木/粗布；场景出图物料等级必须匹配人物身份，禁止公主房出现破屋/普通木）': 'Status & material hierarchy (material grade of each class\'s dwelling / furnishings: royalty = nanmu / brocade / gilt / mutton-fat jade, noble = red sandalwood / silk, commoner = elm / coarse cloth; scene art must match character status — no shack / plain wood for a princess room)',
    /* 全局风格卡字段 label / hint / ph */
    '画风基调': 'Art style base',
    '决定所有镜头的整体美术方向': 'Sets the overall art direction for all shots',
    '如：写实古装电影感 / 日式赛璐璐动画': 'e.g. realistic costume-drama cinematic / Japanese cel animation',
    '色调': 'Palette',
    '全剧统一的调色倾向': 'The show-wide color grading tendency',
    '如：低饱和暖黄褐，夜戏转青灰': 'e.g. low-sat warm yellow-brown, night shifts teal-grey',
    '光线': 'Light',
    '光的方向与质感': 'Direction & quality of light',
    '如：强逆光侧逆光，轮廓光勾勒，忌平光': 'e.g. strong backlight, rim light, avoid flat light',
    '镜头质感': 'Lens texture',
    '光学与画面的物理质感': 'Optical & physical texture of the frame',
    '如：35mm 胶片颗粒，浅景深，轻微运动模糊': 'e.g. 35mm film grain, shallow DOF, slight motion blur',
    '画幅': 'Aspect ratio',
    '出图出视频的画幅比例': 'Image & video aspect ratio',
    '如：9:16 竖屏': 'e.g. 9:16 vertical',
    '参考美学': 'Reference aesthetics',
    '可点名的导演 / 作品级美学参照': 'Nameable director / work-level aesthetic reference',
    '如：徐克武侠美学 + 胡金铨留白': 'e.g. Tsui Hark wuxia + King Hu negative space',
    '配乐与音效基调': 'Music & SFX tone',
    '进音效谱与导出包，供混音参考': 'Goes into the SFX sheet & export pack as mix reference',
    '如：民乐鼓点为主，冲突戏用密集鼓': 'e.g. folk drums dominate, dense drums in conflict scenes',
    '画面禁忌': 'Visual taboos',
    '防穿帮清单，作为铁律注入 AI 分镜提示词': 'Anti-blooper list, injected as a hard rule into AI shot prompts',
    '如：不出现现代服饰、塑料、电线、金属拉链': 'e.g. no modern clothing, plastic, wires, metal zippers',
    /* 人物档案字段 label */
    '姓名': 'Name',
    '定位（主角/反派/配角）': 'Role (protagonist / antagonist / supporting)',
    '称谓别名（用、分隔，如 爷爷、林爷爷、老爷子；对白里写这些别名也能自动对口型到本角色）': 'Aliases (split with 、, e.g. Grandpa Lin; aliases in dialogue also auto-lip-sync to this character)',
    '定妆描述（外貌·全片统一·具体到能照着画：性别、年龄段、发型发色、五官、体型、上下装鞋颜色款式、随身物品、气质神态）': 'Appearance (unified for the whole show, specific enough to draw: gender, age range, hair, features, body, clothing colors & style, accessories, temperament)',
    '服装锁定（颜色+款式，如 灰蓝工装+黑长裤+白帆布鞋，全片统一）': 'Costume lock (color + style, e.g. grey-blue workwear + black pants + white canvas shoes, unified)',
    '性格（全片统一·抑制漂移，如 倔强、外冷内热）': 'Personality (unified, suppresses drift, e.g. stubborn, cold-outside-warm-inside)',
    '说话风格（如 简短、反问多、带方言）': 'Speech style (e.g. terse, many rhetorical questions, dialect)',
    '不可变标志物（如 左眉旧疤、常年戴银戒）': 'Unchangeable markers (e.g. old scar on left brow, always wears silver ring)',
    '一句话弧光（从 X 到 Y）': 'One-line arc (from X to Y)',
    '标签（用、分隔）': 'Tags (split with 、)',
    /* 场景档案字段 label */
    '场景名（如 公主府东厢卧房·内景·清晨）': 'Scene name (e.g. Princess Manor east wing bedroom · interior · dawn)',
    '定妆描述·综合（把下面七项凝成一段可直接用于 AI 生图的综合描述）': 'Appearance · composite (fuse the seven items below into one AI-ready image prompt)',
    '空间布局（面积/朝向/几进几出/左右前后关系）': 'Spatial layout (area / orientation / depth / left-right-front-back relations)',
    '建筑形制与材质等级（如 金丝楠梁柱/云锦帐幔）': 'Architecture & material grade (e.g. nanmu beams / brocade drapes)',
    '陈设清单及各自材质（如 紫檀拔步床/鎏金香炉）': 'Furnishings & their materials (e.g. red sandalwood bed / gilded censer)',
    '材质等级与色彩（必须匹配总纲物料等级体系该身份档位：公主房=皇家物料+暖金朱红，绝不可破屋/普通木）': 'Material grade & color (must match the outline\'s material hierarchy for this status: princess room = royal materials + warm gold & vermilion, never a shack / plain wood)',
    '主光源与时段光线': 'Key light & time-of-day',
    '标志性道具': 'Signature props',
    '整体氛围与情绪': 'Overall atmosphere & mood',
    '色调与氛围': 'Tone & atmosphere',
    /* 人物关系 / 伏笔 / 暗线 / 情节点 / 审计规则 字段 label */
    '人物A': 'Character A',
    '人物B': 'Character B',
    '关系': 'Relation',
    '关系简述': 'Relation note',
    '埋设集': 'Plant ep',
    '回收集': 'Payoff ep',
    '伏笔内容': 'Foreshadow content',
    '所属暗线名': 'Subplot name',
    '暗线名': 'Subplot name',
    '涉及人物（、分隔）': 'Involved characters (、)',
    '暗线描述': 'Subplot description',
    '关键节点/出现集数（、分隔）': 'Key nodes / episodes (、)',
    '幕 / 阶段': 'Act / phase',
    '关键事件': 'Key event',
    '规则': 'Rule',
    '适用范围': 'Scope',
    /* 大纲卡片字段 label */
    '幕 / 弧标题': 'Act / arc title',
    '本幕概要': 'Act summary',
    '目标秒数': 'Target seconds',
    '目标字数（参考）': 'Target chars (reference)',
    '出场人物（、分隔）': 'Cast (、)',
    '主要场景（、分隔）': 'Main scenes (、)',
    '情节点（、分隔）': 'Beats (、)',
    /* 分组标题（bibleCardHtml GROUP） */
    '定妆描述': 'Appearance',
    '堪景单': 'Location scout',
    '性格与弧光': 'Personality & arc',
    /* DNA 档案（人物） */
    '人物 DNA 档案': 'Character DNA file',
    '16 字段 + 生图提示词，下载资产包后拿去任意平台出图': '16 fields + image prompt; take the asset pack to any platform to generate',
    'AI 生成 DNA 档案': 'AI generate DNA file',
    '重新生成 DNA': 'Regenerate DNA',
    '生图提示词': 'Image prompt',
    '可直接粘贴进即梦 / 可灵 / Midjourney 的中文生图提示词（生成 DNA 后自动产出，可改）': 'Chinese image prompt you can paste straight into Dreamina / Kling / Midjourney (auto-produced after DNA generation, editable)',
    '年龄': 'Age',
    '身份': 'Identity',
    '朝代/时代': 'Era / age',
    '性别': 'Gender',
    '身形气质': 'Build & aura',
    '发型发色': 'Hair & color',
    '瞳色眼型': 'Eyes',
    '脸型五官': 'Face & features',
    '性格': 'Personality',
    '气质关键词': 'Aura keywords',
    '微表情': 'Micro-expressions',
    '妆造细节': 'Makeup detail',
    '服饰细节': 'Costume detail',
    '随身物品': 'Accessories',
    '声音描述': 'Voice description',
    /* 场景三段描写 */
    '场景三段描写': 'Scene three-shot description',
    '全景 / 中景 / 特写三层文字，直接喂给生图与分镜': 'Wide / medium / close-up text layers, fed straight to image gen & shots',
    'AI 生成三段描写': 'AI generate three-shot',
    '重新生成三段': 'Regenerate three-shot',
    '全景 · 空间全貌（整个场景一眼望去的样子：范围、布局、天光地气，让看的人先知道这是个什么地方。）': 'Wide · full view (how the whole scene looks at a glance: scope, layout, sky & ground, so viewers know where they are.)',
    '中景 · 结构细节（走近一步看到的：建筑结构、家具陈设、材质新旧、光从哪里进来落在哪。）': 'Medium · structural detail (a step closer: architecture, furniture, material newness, where the light comes in and lands.)',
    '特写 · 氛围道具（贴上去才看得清的：标志性道具、质感细节、气味温度，出特写镜头直接用这段。）': 'Close-up · atmospheric props (only clear up close: signature props, texture detail, smell & temperature, used directly for close-up shots.)',
    '全景 · 空间全貌': 'Wide · full view',
    '中景 · 结构细节': 'Medium · structural detail',
    '特写 · 氛围道具': 'Close-up · atmospheric props',
    /* AI 补标记 */
    'AI补': 'AI',

    /* ===== 第 14 轮：点击反馈串（toast / alert / confirm）静态部分 ===== */
    '我这边还没接上写作通道（缺少密钥），扩写不了。你可以在设置里补上密钥，或者直接在上面的文本框里自己写草稿。': 'The writing channel is not connected (missing API key), so I cannot expand this. Add your key in Settings, or draft it yourself in the text box above.',
    '我这边还没接上写作通道（缺少密钥），剧本扩写没法自动做。原始分集梗概我原样留着没动，你可以在集工作区自己补写，或者去设置里补上密钥再让我重跑。': 'The writing channel is not connected (missing API key), so the script cannot be expanded automatically. The original episode summaries are untouched — write them yourself in the episode workspace, or add your key in Settings and have me rerun.',
    '我这边还没接上写作通道，没法自动补写。你可以直接在原文区自己扩，或者换到更短的秒数档位。': 'The writing channel is not connected, so I cannot auto-expand. Expand it yourself in the source area, or switch to a shorter duration tier.',
    '写作通道没接上，或者返回的内容我没解析出来。可以改用「生成分镜」让我重新理解整集。': 'The writing channel is not connected, or I could not parse what came back. Try "Generate Shots" instead and let me re-read the whole episode.',
    '本集还没有分镜': 'No shots in this episode yet',
    '本集还没有任何线稿，先点「线稿预览」生成': 'No sketches in this episode yet — click "Sketch Preview" to generate them first',
    '该镜暂无可用于线稿的画面描述，请先填写「文生图提示词」或「动作」': 'This shot has no visual description usable for a sketch — fill in the "Image prompt" or "Action" field first',
    '线稿已生成（¥0.05）': 'Sketch generated (¥0.05)',
    '本集还没有分镜，先点「生成分镜」': 'No shots in this episode yet — click "Generate Shots" first',
    '精修等待超时（60s），请重试或检查网络': 'Refine timed out after 60s — please retry or check the network',
    '分镜生成进行中，可收起面板继续其他操作': 'Shot generation is running — you can collapse the panel and keep working',
    '分镜生成超过 5 分钟被强制终止，本次未扣费，请刷新页面重试': 'Shot generation exceeded 5 minutes and was force-stopped. Nothing was charged — refresh the page and retry',
    '已取消分镜生成': 'Shot generation cancelled',
    '已用规则切分兜底生成': 'Generated with rule-based splitting as a fallback',
    '风格卡已生成，每个字段都可以手动改': 'Style card generated — every field is editable',
    '风格卡生成失败': 'Style card generation failed',
    '三条走向没生成出来，可能是我这边写作通道没接上': 'The three plot directions were not generated — the writing channel may not be connected',
    '分支生成失败': 'Branch generation failed',
    '没有可新增的关系（已存在或不在人物名单内）': 'No new relations to add (already exist, or the characters are not in the roster)',
    '未能解析出关系': 'Could not parse any relations',
    '关系推断失败': 'Relation inference failed',
    '关系没推断出来，可能是我这边写作通道没接上': 'Relations were not inferred — the writing channel may not be connected',
    '请先在场景档案添加场景（或点「AI 找回/补录」从原剧抽回场景）': 'Add scenes in the Scene Files first (or use "AI recover" to pull them back from the source text)',
    '所有场景的环境设定已齐全': 'All scenes already have complete environment settings',
    '没有可补全的环境（可能已存在或场景名不匹配）': 'No environments to fill in (already exist, or scene names do not match)',
    '未能解析出环境设定': 'Could not parse environment settings',
    '环境生成失败': 'Environment generation failed',
    '环境设定没生成出来，可能是我这边写作通道没接上': 'Environment settings were not generated — the writing channel may not be connected',
    '未填写名称': 'No name entered',
    '我这边写作通道没接上，先给你建了张空白卡片，可以手动补录': 'The writing channel is not connected — I created a blank card for you to fill in manually',
    '准备找回谁？填人物/场景名（如 奶奶、老宅、林小满）': 'Who or what should I recover? Enter a character / scene name (e.g. Grandma, the old house, Lin Xiaoman)',
    '还没有剧本内容。请先在步骤①导入作品、步骤③分集大纲，再来重建故事中枢。': 'No script content yet. Import your work in step ① and split episodes in step ③ first, then rebuild the Story Bible.',
    '首次 AI 通读免费': 'First AI read-through is free',
    '故事中枢已有大纲，无需回灌。': 'The Story Bible already has an outline — no backfill needed.',
    '还没有分集，无法回灌。请先完成步骤③分集大纲。': 'No episodes yet — nothing to backfill. Finish step ③ (episode outline) first.',
    '当前项目还没有分集。': 'No episodes in this project yet.',
    '尚未分集。完成步骤③分集大纲后，这里会显示每集与故事中枢「定魂契约」（全剧大纲）的对应关系。': 'Episodes not split yet. After you finish step ③ (episode outline), this shows how each episode maps to the Story Bible "binding contract" (the series outline).',
    '故事中枢尚未生成大纲。完成步骤②故事中枢（首次 AI 通读免费）后，各集会自动匹配对应大纲，无需二次付费。': 'The Story Bible outline is not generated yet. After finishing step ② Story Bible (first AI read-through is free), each episode is matched to its outline automatically — no second charge.',

    /* ===== 第 16 轮：一键巡航弹窗 + 故事地图兜底 ===== */
    '一键巡航进行中': 'One-click cruise in progress',
    '取消巡航': 'Cancel cruise',
    '准备中…': 'Preparing…',
    '请先在步骤①粘贴或上传作品': 'Paste or upload your work in step ① first',
    '我在通读全作，把故事中枢建起来（人物/场景/大纲/伏笔）…': 'Reading the whole work and building the Story Bible (characters / scenes / outline / foreshadowing)…',
    '故事中枢建好了': 'Story Bible built',
    '我在设计改编方案：保留线 / 砍线 / 人物合并 / 分集切分点…': 'Designing the adaptation plan: keep lines / cut lines / merge characters / episode cut points…',
    '改编蓝图没跑成，先跳过，不挡后面流程': "The adaptation blueprint didn't finish — skipping it; later steps still run",
    '改编蓝图已存在，跳过': 'Adaptation blueprint already exists — skipped',
    '已请求取消，当前步骤完成后停止…': 'Cancel requested — stopping after the current step…',
    '巡航完成': 'Cruise complete',
    '全部步骤完成 ✓': 'All steps done ✓',
    '已取消巡航，已完成部分已保存': 'Cruise cancelled — completed parts saved',
    '阶段 1/5 · 创建故事中枢': 'Stage 1/5 · Create Story Bible',
    '阶段 2/5 · 改编蓝图': 'Stage 2/5 · Adaptation Blueprint',
    '阶段 3/5 · 分集大纲': 'Stage 3/5 · Episode Outline',
    '用户取消': 'Cancelled by user',
    '分集超时': 'Episode splitting timed out',
    '超时': 'Timed out',
    '正文过短，暂不生成故事地图': 'Text too short — story map not generated yet',
    '（正文过短，暂不生成故事地图）': 'Text too short — story map not generated yet',
    '（无）': '(none)',
    '关键转折': 'Key turning points',
    '（通读通道没开，地图暂时出不来）': '(read-through unavailable — the map cannot be generated right now)',
    '生成后本细条会自动展开，无需回到步骤③。': 'Once generated, this strip expands automatically — no need to go back to step ③.',
    '剧名：': 'Title: ',

    /* ===== 第 18 轮：用户线上实测（英文小说）补漏 ===== */
    /* 进度弹窗 showProgress —— 静态标题/正文 */
    '生成中…': 'Generating…',
    '我在生成，稍等一下…': 'Working on it — one moment…',
    '转剧本中': 'Adapting script',
    '整理故事中枢': 'Tidying the Story Bible',
    '正在通读整部剧本': 'Reading the whole script',
    '正在通读全作并规划分集': 'Reading the whole work and planning episodes',
    '正在扩写本集': 'Expanding this episode',
    'AI 生成环境设定': 'Generating environment settings (AI)',
    '正在核对审计规则': 'Checking audit rules',
    '分镜生成中（后台）': 'Generating shots (background)',
    '收起 ▾': 'Collapse ▾',
    /* 进度弹窗 —— 副标题长串 */
    '我在提取全剧大纲、人物、场景、关系、伏笔和暗线，重建故事中枢。':
      'Extracting the full outline, characters, scenes, relations, foreshadowing and undercurrents — rebuilding the Story Bible.',
    '我在逐条对人物、时间线和设定，有冲突的会标到具体集和镜。':
      'Checking characters, timeline and settings one by one — conflicts are flagged to the exact episode and shot.',
    '先生成故事地图（叙事弧 / 转折点 / 情绪曲线），再按故事事件重要性切集，稍候…':
      'First the story map (narrative arc / turning points / emotion curve), then episodes cut by story-event weight — one moment…',
    '我在保持原意、人物和情绪不变的前提下补细节、补镜头感。':
      'Keeping the meaning, characters and emotion intact while adding detail and a sense of camera.',
    '我对着这一集的上下文，重新打磨这一镜的画面、人物和情绪。':
      'Reworking this shot\'s image, characters and emotion against the full context of the episode.',
    '正在根据原剧上下文为每个场景补全「季节 / 时段 / 天气 / 主色调 / 光线氛围 / 标志性道具」…':
      'Filling in season / time of day / weather / palette / lighting mood / signature props for every scene from the original…',
    '按 16 字段补全角色画像，并产出可直接用的生图提示词，请稍候…':
      'Completing the character profile across 16 fields and producing ready-to-use image prompts — one moment…',
    '全景 / 中景 / 特写三层文字，直接喂给生图与分镜，请稍候…':
      'Three layers of text — wide / medium / close-up — feed straight into image generation and the storyboard. One moment…',
    '我在判断哪些人物 / 场景其实是同一个人 / 同一个空间，合并重复项并改掉分镜里的引用。':
      'Working out which characters / scenes are really the same person / same space, merging duplicates and fixing the references in the storyboard.',
    '暂未登记关系，可在「设定层 · 关系」添加，或点「AI 推断关系」。':
      'No relations recorded yet — add them under Setting Layer · Relations, or click "Infer relations (AI)".',
    'AI 三分支': 'AI · 3 branches',

    /* ===== 第 17 轮：浏览器自跑（英文小说全流程）实测补漏 ===== */
    /* 顶栏 / 项目列表 */
    '切换为中文': 'Switch to Chinese',
    '改名': 'Rename',
    '删除': 'Delete',
    '剧': 'D',
    /* 新建项目弹窗 */
    '项目名称（可留空，导入剧本后自动识别剧名改名）': 'Project name (optional — after import I detect the title and rename it)',
    '给你的短剧起个名字': 'Name your short drama',
    '套用模板（选填）': 'Apply a template (optional)',
    '不套用（稍后在步骤①选择）': 'No template (pick one later in step ①)',
    /* 改编蓝图 / 分集 / 分镜 面板 */
    '+ 加一集': '+ Add episode',
    '+ 加一条': '+ Add one',
    '+ 加一条线': '+ Add a line',
    '+ 加一组': '+ Add a group',
    '全剧一句话（改编后）': 'One-line logline (after adaptation)',
    '对应原著位置': 'Source location',
    '本集三拍（开场钩/冲突/反转）': "This episode's three beats (hook / conflict / reversal)",
    '本集结尾钩子（类型+强度）': 'Ending hook (type + strength)',
    '确认蓝图，进入分集大纲 →': 'Confirm blueprint → episode outline',
    '重新生成': 'Regenerate',
    '钩子/冲突/转折/卡点': 'Hook / conflict / turn / cliffhanger',
    '· 约': '· ~',
    '· 节拍结构': '· Beat structure',
    '· 对白建议': '· Dialogue notes',
    '· 本集已写': '· Written this episode',
    '旁白': 'Narration',
    /* 分镜字段的取值（下拉 / 输入值） */
    '固定近景': 'Static close-up',
    '缓慢推近': 'Slow push-in',
    '横移': 'Lateral pan',
    '固定': 'Static'
  };

  /* ===== 引擎 ===== */
  var CJK = /[\u4e00-\u9fff]/;
  var nodeCache = new WeakMap();   // 文本节点 → 原始文本（支持中英互切）
  var attrCache = new WeakMap();   // 元素 → { placeholder: 原文, title: 原文 }
  var scheduled = false;

  /* ===== 数字 + 单位 规则层 =====
   * 形如「3 集 / 6 镜 / 79 字 / 90 秒 / 5秒」的统计节点是运行时拼接的，字典精确匹配管不到。
   * 仅当节点去掉数字与标点后只剩单位词（集/镜/字/秒/条/幕/段…）时才替换，用户内容天然不会误触。 */
  var UNIT_WORDS = ['个人物', '个场景', '集', '镜', '字', '秒', '条', '幕', '段'];
  var UNIT_RES = [
    [/(\d+)\s*个人物/g, '$1 characters'],
    [/(\d+)\s*个场景/g, '$1 scenes'],
    [/(\d+)\s*集/g, '$1 eps'],
    [/(\d+)\s*镜/g, '$1 shots'],
    [/(\d+)\s*字/g, '$1 chars'],
    [/(\d+)\s*秒/g, '$1s'],
    [/(\d+)\s*条/g, '$1 items'],
    [/(\d+)\s*幕/g, '$1 acts'],
    [/(\d+)\s*段/g, '$1 paragraphs']
  ];
  function unitTranslate(key) {
    var rest = key.replace(/[\d\s.,/·+()（）~≈\-—:：%]/g, '');
    if (!rest) return undefined;
    var i = 0;
    while (i < rest.length) {
      var matched = false;
      for (var k = 0; k < UNIT_WORDS.length; k++) {
        var w = UNIT_WORDS[k];
        if (rest.substr(i, w.length) === w) { i += w.length; matched = true; break; }
      }
      if (!matched) return undefined;
    }
    var out = key;
    for (var r = 0; r < UNIT_RES.length; r++) out = out.replace(UNIT_RES[r][0], UNIT_RES[r][1]);
    return out === key ? undefined : out;
  }

  /* ===== 反馈串规则层（第 14 轮）：MG.toast / alert / confirm 的拼接串（前缀字面量 + 运行时变量）
     精确字典匹配不到，这里用带捕获组的正则整串匹配，英文模板里 $N 引用捕获组。
     前缀都是 UI 专属措辞（如「补写失败：」「已从原剧找回「」），用户内容不会误触。仅英文态启用。===== */
  var FEEDBACK_RULES = [
    [ /^连续性检查失败：([\s\S]*)$/, 'Continuity check failed: $1' ],
    [ /^一键巡航，我连着往下跑：创建故事中枢 → 改编蓝图 → 分集 → 逐集改编剧本 → 生成分镜脚本（不出图、不出片）。\n预计消耗约 ¥([\d.,]+)（按 (\d+) 集估算，每日额度护栏照常）。是否开始？$/,
      'One-click cruise — I will run straight through: Create Story Bible → Adaptation Blueprint → Split Episodes → Script per Episode → Generate Shots (no images, no video).\nEstimated cost: about ¥$1 (based on $2 episodes; daily quota guardrails still apply). Start?' ],
    [ /^当前 (\d+) \/ (\d+) 集已生成分镜。$/, 'Currently $1 / $2 episodes have shots generated.' ],
    [ /^重新规划分集将覆盖当前 (\d+) 集的分集结果（已手动改过的集名\/概要会尝试保留，正文会重新生成）。确定重新规划？$/,
      'Re-planning episodes will overwrite the current $1 episodes (manually edited titles/summaries are kept where possible; body text is regenerated). Re-plan?' ],
    [ /^镜头时长档已切到 (.+?) 秒，各集镜头预算已重算（重新生成分镜后生效）$/,
      'Shot duration switched to $1s; per-episode shot budgets recalculated (takes effect after regenerating shots)' ],
    [ /^线稿生成失败：([\s\S]*)$/, 'Sketch generation failed: $1' ],
    [ /^线稿生成失败，请重试$/, 'Sketch generation failed — please retry' ],
    [ /^线稿批量完成：成功 (\d+) · 失败 (\d+)（([\s\S]*)）$/, 'Sketch batch done: $1 succeeded · $2 failed ($3)' ],
    [ /^线稿批量完成：成功 (\d+) · 失败 (\d+)$/, 'Sketch batch done: $1 succeeded · $2 failed' ],
    [ /^本集字数已足够支撑 (\d+) 秒，无需补写。$/, 'This episode already has enough words for $1s — no expansion needed.' ],
    [ /^补写失败：([\s\S]*)$/, 'Expansion failed: $1' ],
    [ /^精修处理异常：([\s\S]*)$/, 'Refine error: $1' ],
    [ /^这一镜我没改成功：([\s\S]*)$/, 'I could not refine this shot: $1' ],
    [ /^精修失败：([\s\S]*)$/, 'Refine failed: $1' ],
    [ /^分镜已生成，已存入「(.+?)」，可在步骤⑤查看$/, 'Shots generated and saved to "$1" — view them in step ⑤' ],
    [ /^分镜已生成，但有批次走规则兜底：([\s\S]*)$/, 'Shots generated, but some batches fell back to rule-based splitting: $1' ],
    [ /^生成分镜失败：([\s\S]*)$/, 'Shot generation failed: $1' ],
    [ /^风格卡没生成出来：([\s\S]*)$/, 'Style card was not generated: $1' ],
    [ /^风格卡没生成出来，写作通道可能没接上$/, 'Style card was not generated — the writing channel may not be connected' ],
    [ /^已补全 (\d+) 条关系$/, 'Filled in $1 relation(s)' ],
    [ /^已从原剧找回「(.+?)」$/, 'Recovered "$1" from the source text' ],
    [ /^未在原文中找到「(.+?)」/, '"$1" was not found in the source text — created a blank card for you to fill in manually' ],
    [ /^DNA 生成失败：([\s\S]*)$/, 'DNA generation failed: $1' ],
    [ /^DNA 解析失败：([\s\S]*)$/, 'DNA parsing failed: $1' ],
    [ /^DNA 生成异常：([\s\S]*)$/, 'DNA generation error: $1' ],
    [ /^三段描写生成失败：([\s\S]*)$/, 'Three-part description generation failed: $1' ],
    [ /^三段描写解析失败：([\s\S]*)$/, 'Three-part description parsing failed: $1' ],
    [ /^三段描写生成异常：([\s\S]*)$/, 'Three-part description generation error: $1' ],
    [ /^一键巡航完成：已生成 (\d+) 集剧本 \+ 分镜，可在步骤⑤查看$/, 'One-click cruise done: generated scripts + shots for $1 episodes — view them in step ⑤' ],
    [ /^已生成 (\d+) 集草稿并写回上方文本框。你可以直接改稿，然后「创建故事中枢」。$/, 'Generated drafts for $1 episodes and wrote them back to the text box above. Edit them directly, then click "Create Story Bible".' ],
    [ /^第 (\d+) 集改写失败：AI 返回内容为空或太短，已退款，请重试$/, 'Episode $1 rewrite failed: the AI returned empty or too-short content. Refunded — please retry' ],
    [ /^第 (\d+) 集已改写为剧本格式$/, 'Episode $1 rewritten in script format' ],
    [ /^第 (\d+) 集改写失败：([\s\S]*)$/, 'Episode $1 rewrite failed: $2' ],
    [ /^第 (\d+) 集改写异常：([\s\S]*)$/, 'Episode $1 rewrite error: $2' ],
    [ /^第 (\d+) 镜已精修$/, 'Shot $1 refined' ],
    [ /^阶段 4\/5 · 改编第 (\d+)\/(\d+) 集$/, 'Stage 4/5 · Adapting episode $1/$2' ],
    [ /^阶段 5\/5 · 生成分镜 第 (\d+)\/(\d+) 集$/, 'Stage 5/5 · Generating shots — episode $1/$2' ],
    [ /^改编蓝图出了（共 (\d+) 集切分点，可回主线修改确认）$/, 'Adaptation blueprint ready ($1 episode cut points — review and confirm on the map)' ],
    [ /^切出 (\d+) 集了$/, 'Split into $1 episode(s)' ],
    [ /^已有 (\d+) 集，跳过重新分集$/, 'Already $1 episodes — skipping re-split' ],
    [ /^改编第 (\d+) 集《(.+?)》…$/, 'Adapting episode $1 "$2"…' ],
    [ /^生成第 (\d+) 集分镜…$/, 'Generating shots for episode $1…' ],
    [ /^第 (\d+) 集分镜 (\d+) 镜$/, 'Episode $1: $2 shots' ],
    [ /^巡航中断：([\s\S]*)（已完成部分已保存）$/, 'Cruise interrupted: $1 (completed parts saved)' ],
    [ /^主线：(.+)$/, 'Main arc: $1' ],
    [ /^建议约 (\d+) 集$/, '~$1 episodes suggested' ],

    /* ===== 第 18 轮：进度弹窗 / 关系网 / 分集卡片的拼接串 ===== */
    [ /^正在提取第 (\d+) 集戏剧事件并改写成可拍剧本（想要\/阻碍\/转折\/卡点），已注入全剧连续性骨架…$/,
      'Extracting the dramatic beats of episode $1 and rewriting them into a shootable script (want / obstacle / turn / stuck point), with the full-story continuity skeleton injected…' ],
    [ /^正在精修第 (\d+) 镜$/, 'Refining shot $1' ],
    [ /^正在生成「(.+)」DNA 档案$/, 'Generating the DNA profile for "$1"' ],
    [ /^正在生成「(.+)」三段描写$/, 'Generating the three-layer description for "$1"' ],
    [ /^正在从原剧找回「(.+)」$/, 'Retrieving "$1" from the original' ],
    [ /^我回原稿里翻这个(.+?)的设定，提出来补上。$/, 'Digging through the original for this $1 setup and pulling it out.' ],
    [ /^当前共 (\d+) 条关系、(\d+) 个人物。$/, '$1 relations, $2 characters on file.' ],
    [ /^暂无关系的 (\d+) 个人物：$/, '$1 characters with no relations yet: ' ],
    [ /^第 (\d+) 集$/, 'Episode $1' ],
    [ /^(\d+) shots —$/, '$1 shots —' ],
    [ /^预计 (\d+)–(\d+) 秒$/, 'About $1–$2 seconds' ],
    [ /^预计 (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 分钟$/, 'About $1–$2 minutes' ],

    /* ===== 第 17 轮：自跑实测的拼接串（数字 / · 后缀 / 括号计数）===== */
    [ /^(\d+) 个$/, '$1' ],
    [ /^场景 (\d+)$/, 'Scene $1' ],
    [ /^第 (\d+) 场景$/, 'Scene $1' ],
    [ /^(\d+)[–\-—](\d+) 字$/, '$1–$2 words' ],
    [ /^分集切分点（(\d+) \/ 目标 (\d+) 集）$/, 'Episode cut points ($1 / target $2)' ],
    /* 项目列表卡片：<步骤名> · <时间>，整串拼装导致精确字典命中不了 */
    [ /^作品 ·\s*(.*)$/, 'Work · $1' ],
    [ /^故事中枢 ·\s*(.*)$/, 'Story Bible · $1' ],
    [ /^改编蓝图 ·\s*(.*)$/, 'Adaptation Blueprint · $1' ],
    [ /^分集大纲 ·\s*(.*)$/, 'Episode Outline · $1' ],
    [ /^剧本 ·\s*(.*)$/, 'Script · $1' ],
    [ /^分镜脚本 ·\s*(.*)$/, 'Storyboard · $1' ],
    [ /^导出资产包 ·\s*(.*)$/, 'Export Asset Pack · $1' ],
    [ /^一致性审计 ·\s*(.*)$/, 'Continuity Audit · $1' ],
    [ /^完整性校验 ·\s*(.*)$/, 'Completeness Check · $1' ],
    [ /^旁白: (.+)$/, 'Narration: $1' ],
    [ /^(Shot \d+ \[[^\]]*\]) 旁白: (.+)$/, '$1 Narration: $2' ],
    [ /^⚠ 当前文本量按 (\d+) 字\/秒估算约够 (\d+) 秒，但 (\d+) 秒短剧的关键不是凑字数，而是「钩子\/冲突\/转折\/卡点」四节拍。建议进入「改编剧本」逐集点「✨ 转剧本」做创意压缩，不要硬补字数。$/,
      '⚠ At $1 chars/sec, your text covers roughly $2s — but a $3s short drama is not about word count, it is about the four beats (hook / conflict / turn / cliffhanger). Go to Adapted Script and use "To script" per episode to compress creatively instead of padding words.' ],
    /* —— 拼接串（前缀/后缀 + 变量，DICT 精确匹配救不了，必须全串锚定规则）—— */
    [ /^蓝图生成失败：([\s\S]*)$/, 'Blueprint generation failed: $1' ],
    [ /^分集规划失败：([\s\S]*)$/, 'Episode planning failed: $1' ],
    [ /^计费校验异常：([\s\S]*)$/, 'Billing check error: $1' ],
    [ /^项目没拿到：([\s\S]*)$/, 'Could not load the project: $1' ],
    [ /^已存在同名项目：「(.+?)」$/, 'A project named "$1" already exists' ],
    [ /^项目名称（当前：(.+?)）$/, 'Project name (current: $1)' ],
    [ /^重命名失败：([\s\S]*)$/, 'Rename failed: $1' ],
    [ /^删除失败：([\s\S]*)$/, 'Delete failed: $1' ],
    [ /^自动改名未生效（([\s\S]*)），可在项目列表手动改名$/, 'Auto-rename did not take effect ($1) — rename it manually in the project list' ],
    [ /^确认删除项目「(.+?)」？删除后不可恢复。$/, 'Delete project "$1"? This cannot be undone.' ],
    [ /^已购买「(.+?)」，文件开始下载。$/, 'Purchased "$1" — the download is starting.' ],
    [ /^余额不足：需 ¥([\d.,]+)，当前余额 ¥([^。]*)。请先在右上角充值，再来下载。$/, 'Not enough balance: ¥$1 needed, current balance ¥$2. Top up in the top-right corner first, then download.' ],
    [ /^要扩写到几集？（默认 (\d+) 集，建议 6-24）$/, 'Expand to how many episodes? (default $1, 6-24 recommended)' ],
    [ /^内容安全拦截：您提交的内容包含违反法律法规的信息（([\s\S]*)），已被系统屏蔽且未保存。请移除相关内容后重试。$/,
      'Content safety filter: your submission contains information that violates laws and regulations ($1). It was blocked and not saved. Remove the flagged content and try again.' ]
  ];
  function feedbackTranslate(key) {
    for (var i = 0; i < FEEDBACK_RULES.length; i++) {
      var m = key.match(FEEDBACK_RULES[i][0]);
      if (m) return FEEDBACK_RULES[i][1].replace(/\$(\d)/g, function (_, d) { return (m[+d] != null) ? m[+d] : ''; });
    }
    return undefined;
  }

  /* ===== 文档标题翻译（<title> 在 head，walk(body) 覆盖不到）===== */
  var TITLE_DICT = {
    'MojingeStory 故事匠 · 剧本工作台': 'MojingeStory · Screenwriting Workbench'
  };
  var _titleOrig = null;   // 首次进入时的原始标题（中文），用于切回中文时还原
  function translateTitle() {
    var lang = window.__swLang || 'en';
    var el = document.querySelector('title');
    if (!el) return;
    if (_titleOrig === null) _titleOrig = el.textContent;
    if (lang === 'zh') {
      if (el.textContent !== _titleOrig) el.textContent = _titleOrig;
      return;
    }
    var raw = _titleOrig.trim();
    var hit = TITLE_DICT[raw];
    if (hit && el.textContent !== hit) el.textContent = hit;
  }

  function getLang() {
    var s = null;
    try { s = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (s === 'zh' || s === 'en') return s;
    return 'en'; /* 默认英文（面向海外开源）；中文用户点右上角「中」切换 */
  }

  function tr(text) {
    var lang = window.__swLang || 'en';
    if (lang === 'zh') return text;
    var v = DICT[text];
    if (v === undefined && lang === 'en') v = feedbackTranslate(text);
    if (v === undefined && lang === 'en') v = unitTranslate(text);
    return v !== undefined ? v : text;
  }

  function walk(root) {
    if (!root) return;
    var scope = (root.querySelectorAll) ? root : document;
    var list = [];
    if (root.nodeType === 1) list.push(root);
    var descendants = scope.querySelectorAll('*');
    for (var d = 0; d < descendants.length; d++) list.push(descendants[d]);
    var lang = window.__swLang || 'en';
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // 脚本 / 样式的文本一律不碰；文本域只跳「输入内容」，placeholder/title 仍要翻译
      var tag = el.tagName;
      var skipText = (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA');
      // 文本节点（缓存优先：已翻译成英文的节点也要能恢复回中文）
      var kids = el.childNodes;
      for (var j = 0; j < kids.length; j++) {
        if (skipText) break;
        var n = kids[j];
        if (n.nodeType !== 3) continue;
        var orig = nodeCache.get(n);
        if (orig === undefined) {
          var raw0 = n.nodeValue;
          if (!CJK.test(raw0)) continue;
          orig = raw0;
          nodeCache.set(n, orig);
        }
        var key = orig.trim();
        var hit = DICT[key];
        if (hit === undefined && lang === 'en') hit = feedbackTranslate(key);
        if (hit === undefined && lang === 'en') hit = unitTranslate(key);
        if (hit === undefined) continue;
        var target = lang === 'zh' ? orig : orig.replace(key, hit);
        if (n.nodeValue !== target) n.nodeValue = target;
      }
      // placeholder / title 属性（同样缓存优先）
      var attrs = ['placeholder', 'title'];
      for (var k = 0; k < attrs.length; k++) {
        var a = attrs[k];
        var cache = attrCache.get(el);
        var cur = el.getAttribute && el.getAttribute(a);
        if (!cache) {
          if (!cur || !CJK.test(cur)) continue;
          cache = {};
          attrCache.set(el, cache);
        }
        if (cache[a] === undefined) {
          if (!cur || !CJK.test(cur)) continue;
          cache[a] = cur;
        }
        var aKey = cache[a].trim();
        var aHit = DICT[aKey];
        if (aHit === undefined && lang === 'en') aHit = feedbackTranslate(aKey);
        if (aHit === undefined && lang === 'en') aHit = unitTranslate(aKey);
        if (aHit !== undefined) {
          var aTarget = lang === 'zh' ? cache[a] : cache[a].replace(aKey, aHit);
          if (el.getAttribute(a) !== aTarget) el.setAttribute(a, aTarget);
        }
      }
    }
  }

  function walkAll() { walk(document.body); }

  function scheduleWalk() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; walkAll(); }, 0);
  }

  function setLang(l) {
    try { localStorage.setItem(STORE_KEY, l); } catch (e) {}
    window.__swLang = l;
    try { document.documentElement.lang = (l === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
    // 已翻译过的节点带缓存，直接全量重走即可中英互切
    walkAll();
    translateTitle();
    // 模板级动态串（数字+单位拼装、审计条目）只有重渲染才会跟着语言走
    if (typeof window.__swRerender === 'function') {
      setTimeout(function () { window.__swRerender(); }, 0);
    }
    // 同步切换按钮文案
    var btn = document.getElementById('mgLangBtn') || document.getElementById('langBtn');
    if (btn) {
      btn.textContent = (l === 'zh') ? 'EN' : '中';
      btn.title = (l === 'zh') ? 'Switch to English' : '切换为中文';
    }
  }

  function toggle() {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
  }

  function boot() {
    window.__swLang = getLang();
    try { document.documentElement.lang = (window.__swLang === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
    translateTitle();
    if (document.body) {
      walkAll();
      var mo = new MutationObserver(function (muts) {
        var touched = [];
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var nd = added[j];
            if (nd.nodeType === 1) touched.push(nd);
            else if (nd.nodeType === 3 && nd.parentElement) touched.push(nd.parentElement);
          }
          // 直接改已有文本节点的内容（如自动保存状态），目标元素即 target
          if (muts[i].type === 'characterData' && muts[i].target && muts[i].target.parentElement) {
            touched.push(muts[i].target.parentElement);
          }
          // placeholder / title 属性变化
          if (muts[i].type === 'attributes' && muts[i].target && muts[i].target.setAttribute) {
            touched.push(muts[i].target);
          }
        }
        for (var k = 0; k < touched.length; k++) {
          if (touched[k] && touched[k].querySelectorAll) walk(touched[k]);
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.SW_I18N = {
    dict: DICT, getLang: getLang, setLang: setLang, toggle: toggle,
    t: function (zh) { return tr(zh); }, walk: walk
  };
})();
