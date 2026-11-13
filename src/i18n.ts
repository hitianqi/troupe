import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The panel's language: its own words, and the language the agents write in for the person. What troupe reads
// back (plan headings, YAML, result front matter, CLI output) stays English either way.

export type Lang = 'en' | 'zh'

const settingsOf = (home: string) => join(home, '.config/troupe/settings.json')

/** The person's choice from the panel, else the locale's. */
export const langOf = (home: string, env: NodeJS.ProcessEnv): Lang => {
  try {
    const saved = (JSON.parse(readFileSync(settingsOf(home), 'utf8')) as { language?: unknown }).language
    if (saved === 'en' || saved === 'zh') return saved
  } catch { /* No choice saved yet, or a hand edit that does not parse: the locale decides. */ }
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''

  return locale.startsWith('zh') ? 'zh' : 'en'
}

export const saveLang = (home: string, lang: Lang): void => {
  const path = settingsOf(home)
  let settings: Record<string, unknown> = {}
  try { settings = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { /* Start a new file. */ }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ ...settings, language: lang }, null, 2)}\n`)
}

/** What an agent is told when the person reads Chinese. */
export const WRITE_CHINESE = 'Write everything the person reads in Simplified Chinese (简体中文): the plan\'s prose, gate questions, result summaries and messages. Keep in English what troupe reads: Markdown headings, YAML keys and values, role names, `status:` values, `**Recommended:**`, a review\'s leading `PASS` or `FAIL`, file paths and code.'
/** The line the orchestrator gets when the person switches the panel's language mid-mission. */
export const switchedTo = (lang: Lang): string => lang === 'zh'
  ? `The person switched the panel to Chinese. ${WRITE_CHINESE} Tell the roles still working the same with troupe send.`
  : 'The person switched the panel to English. Write everything the person reads in English from now on, and tell the roles still working the same with troupe send.'

const ZH = {
  // Tabs, columns, sections
  'MISSION': '任务', 'ROLES': '角色', 'PLAN': '计划', 'LOG': '日志', 'DIFF': '改动',
  'STAGES': '阶段', 'ACTIVITY': '动态', 'FLOW': '流程', 'CONTENTS': '目录', 'scroll for more ↓': '滚动查看更多 ↓',
  'Goal': '目标', 'Why': '原因', 'Done when': '完成标准', 'Roles': '角色', 'Decisions': '待定决策', 'Out of scope': '不做的事',
  'APPROVE THE PLAN': '批准计划',
  // Role states
  'planned': '待启动', 'working': '工作中', 'idle': '空闲', 'waits on you': '等你处理', 'done': '完成', 'blocked': '受阻',
  'failed': '失败', 'gone': '已消失', 'closed': '已关闭', 'unknown': '未知',
  // Stages of the default workflow
  'Plan': '计划', 'Plan OK?': '计划可以吗？', 'Build': '构建', 'Review': '审查', 'MR OK?': 'MR 可以吗？', 'Open MR': '开 MR',
  'Merged?': '已合并？', 'Teardown': '清理',
  // Roles and their fields
  'after {0}': '{0} 之后', 'as each lands': '随到随审', 'starts at once': '立即开始', 'at once': '立即', 'default': '默认',
  'orchestrator': '编排者', 'reviews {0} as each lands': '审查 {0}，随到随审', 'changes nothing': '不改任何文件',
  'goal': '目标', 'agent': 'Agent', 'context': '上下文', 'branch': '分支', 'touches': '范围', 'diff': '改动', 'result': '结果',
  'effort': '强度', 'ctx': '上下文', 'tokens': 'Token', 'work': '工作', 'time': '用时', 'flags': '参数',
  '{0} in · {1} out': '输入 {0} · 输出 {1}', '~{0} to full': '约 {0} 后占满', '{0} in': '输入 {0}', ' since dispatch': ' 自派发起',
  '{0} commit': '{0} 个提交', '{0} commits': '{0} 个提交', '{0} file': '{0} 个文件', '{0} files': '{0} 个文件',
  '{0} file changed': '改了 {0} 个文件', '{0} files changed': '改了 {0} 个文件',
  'inside touches ✓': '都在范围内 ✓', 'outside touches: {0}': '超出范围：{0}', '✗ {0} outside': '✗ {0} 个超出范围', '✓ inside': '✓ 都在范围内',
  'not opened yet · {0}': '尚未打开 · {0}', 'its window, live': '它的窗口 · 实时', 'a dialog in its window': '它窗口里的对话框',
  // The plan
  'checks clean': '检查通过', '{0} problem': '{0} 个问题', '{0} problems': '{0} 个问题',
  '{0} window': '{0} 个窗口', '{0} windows': '{0} 个窗口', "touches don't overlap ✓": '范围互不重叠 ✓', '✗ {0} and {1} overlap': '✗ {0} 和 {1} 范围重叠',
  'overlaps {0} on {1} · neither depends on the other': '与 {0} 在 {1} 上重叠 · 二者互不依赖',
  'fix the plan first': '先修好计划', 'approving takes the recommendations': '批准即采纳推荐方案',
  'summary': '摘要', 'full text': '全文',
  // Keys and buttons
  'Approve': '批准', 'Change…': '修改…', 'Read the plan': '查看计划', 'Change': '修改', 'Open window': '打开窗口', 'Send…': '发送…', 'Diff': '改动',
  'approve': '批准', 'change': '修改', 'plan': '计划', 'role': '角色', 'tabs': '标签页', 'help': '帮助', 'detail': '详情', 'open': '打开',
  'send': '发送', 'open window': '打开窗口', 'scroll': '滚动', 'line': '行', 'expand': '展开', 'follow': '跟随', 'file': '文件',
  'answer it first': '先回应它', '{0} needs you': '{0} 项待你处理', 'wheel': '滚轮', 'switch language (中/EN)': '切换语言（中/EN）',
  'select role': '选择角色', 'open role pane': '打开角色窗口', 'send to role': '发给角色', 'open an event': '展开事件',
  'follow the newest': '跟随最新', 'next file': '切换文件', 'approve the gate': '批准关卡', 'type a change': '输入修改',
  'submit or cancel input': '提交或取消输入', 'close help': '关闭帮助', 'quit': '退出',
  // LOG
  'LIVE': '实时', '‖ paused': '‖ 已暂停', ' · {0} new ↓': ' · {0} 条新的 ↓', '{0} event': '{0} 条事件', '{0} events': '{0} 条事件',
  '{0} waits': '{0} 个等待', 'events': '事件', 'now': '刚刚', '{0}s ago': '{0} 秒前', '{0}m ago': '{0} 分钟前',
  'nothing logged yet · the orchestrator writes here as it plans, dispatches and asks': '还没有日志 · 编排者规划、派发和提问时会写在这里',
  // DIFF
  'not started · {0}': '未开始 · {0}', 'no work read yet': '还没读到工作', 'no changes yet': '还没有改动', '✗ outside touches': '✗ 超出范围',
  'the diff could not be read · {0}': '读不到改动 · {0}', 'binary file': '二进制文件', 'new file, too large to show': '新文件，太大无法显示',
  'no hunks read yet': '还没读到改动块', 'no line changes': '没有行改动', '… more lines than the panel keeps': '… 行数超出面板上限',
  'nothing changed yet · files show up here as roles commit': '还没有改动 · 角色提交后文件会出现在这里',
  // ACTIVITY
  'mission teardown complete': '任务已清理', 'stage: {0}': '阶段：{0}', 'plan gate opened': '打开了计划关卡', 'asked {0}: {1}': '询问 {0}：{1}',
  '{0} approved': '{0} 已批准', '{0}: change: {1}': '{0}：修改：{1}', 'dispatched {0}': '派发了 {0}', 'sent to {0}: {1}': '发给 {0}：{1}',
  'opened mission window {0}': '打开了任务窗口 {0}', 'closed {0}': '关闭了 {0}', 'mission: {0}': '任务：{0}', 'language: {0}': '语言：{0}',
  // The panel's own lines
  'Orch is drafting the plan': '编排者正在起草计划', "in the orchestrator's pane, beside this one": '在旁边编排者的窗格里',
  'The plan comes here for approval when it is written.': '计划写好后会来这里等你批准。', ' comes here for approval when it is written': ' 写好后会来这里等你批准', 'Panel needs 40 columns and 10 rows.': '面板至少需要 40 列、10 行。',
  'no mission yet': '还没有任务', 'Mission changed; input cancelled.': '任务已切换，输入已取消。', 'Enter some text, or Esc to cancel.': '输入些文字，或按 Esc 取消。',
  'send to {0}': '发给 {0}', 'Opened {0}': '已打开 {0}', 'Approved {0}': '已批准 {0}', 'Change sent for {0}': '已提交对 {0} 的修改',
  'The gate or plan changed; review it again.': '关卡或计划变了，请重新查看。', 'Enter a change first.': '先输入修改内容。',
  'Language: English': '语言：English', 'Language: 中文': '语言：中文',
} as const

export type Phrase = keyof typeof ZH

let current: Lang = 'en'
/** The panel draws in one language at a time, set as it starts and when the person switches. */
export const setLang = (lang: Lang): void => { current = lang }
export const lang = (): Lang => current

/** `phrase` in the panel's language, `{0}`… filled from `args`. */
export const t = (phrase: Phrase, ...args: (string | number)[]): string =>
  (current === 'zh' ? ZH[phrase] : phrase).replace(/\{(\d)\}/g, (_, i: string) => String(args[Number(i)] ?? ''))
/** `one` or `many` by `n`, filled with it. */
export const plural = (n: number, one: Phrase, many: Phrase): string => t(n === 1 ? one : many, n)
/** Text from a plan or workflow file, translated when it is one of the panel's own phrases (a default stage's label). */
export const known = (text: string): string => (current === 'zh' && Object.hasOwn(ZH, text) ? ZH[text as Phrase] : text)
