<p align="center"><img src="assets/icon.svg" width="112" alt="troupe 图标"></p>

<h1 align="center">troupe</h1>

<p align="center"><b>带一支看得见的编程 agent 团队。</b><br>
你批准一份计划，之后每个角色都在自己的真实终端窗口里、<br>
自己的 git worktree 里工作，用 Claude Code 或 Codex。</p>

<p align="center">
  <a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-2F5079"></a>
  <a href="#agents"><img alt="agents: Claude Code and Codex" src="https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex-F29B7A"></a>
  <img alt="runs in tmux" src="https://img.shields.io/badge/runs%20in-tmux-7FA9D9">
  <img alt="node 20 or later" src="https://img.shields.io/badge/node-%E2%89%A5%2020-2F5079">
  <a href="https://github.com/hitianqi/troupe/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/hitianqi/troupe/actions/workflows/ci.yml/badge.svg"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

<p align="center"><img src="docs/media/panel-live.gif" width="860" alt="编排者旁边的 troupe 面板：角色、阶段、动态，以及各角色工作时的流程图"></p>

## 为什么用 troupe

- **每个 agent 都看得见。** 每个角色都是一个活的 Claude Code 或 Codex 会话，
  在自己的 tmux pane 里。随时跳进去看、跟读，或者直接打字给它；
  没有什么藏在 subagent 里。
- **计划没批准，什么都不开始。** 编排者和你一起写计划；面板上列出目标、
  完成标准，以及每个角色由谁来跑。按 `a` 批准，或按 `c` 退回修改。
  之后改了计划，就要重新批准。
- **两个 agent 不会改同一批文件。** 一个角色就是一个 worktree、一个分支、
  一个 pane。文件有重叠的角色必须排出先后，否则 `troupe check` 拒绝这份计划。
- **每个角色可以混用不同的 agent 和模型。** 一个 Claude Code 构建者、一个
  Codex 构建者，再加一个用第三种模型的审查者，各自用你在计划里写定的
  effort 和权限参数。
- **每个分支都有审查，关键处都有关卡。** 审查角色在每个分支落地时检查它；
  MR 由你批准开，合并由你确认，之后才会拆掉现场。

## 快速开始

需要 tmux（macOS、Linux 或 WSL2）、Node 20+、git，以及 `PATH` 上有
Claude Code 和/或 Codex。

```sh
npm install -g troupe-cli
troupe setup        # 为 Claude Code 和/或 Codex 安装 troupe-mission skill
```

然后在 tmux 里，在要改的仓库中打开 Claude Code 或 Codex，让它跑一个 mission：

```
Run a troupe mission: add a search box that filters the list as you type,
and a dark theme that follows the system setting.
```

（用中文说也可以，比如“用 troupe 跑一个 mission：……”。）

面板会在你的 agent 旁边打开，计划出现在里面等你批准。
（也可以用 `troupe up -m <mission>` 让它替你启动编排者和面板。）

## 一个 mission 怎么跑

**1. 先写计划，再批准。** 编排者读代码，写出
`docs/missions/<mission>/plan.md`，反复跑 `troupe check` 直到通过。
你在面板里读计划，提修改，然后批准。

<p align="center"><img src="docs/media/plan-review.gif" width="860" alt="在面板里滚动阅读计划、提出修改、批准修改后的计划"></p>

**2. 角色各自开窗口。** 互不依赖的角色同时开始；其余的等它们依赖的角色完成。
某个角色在等你（一个权限、一个问题）时，面板会提示；按 `o` 跳到它的 pane，
在那里回答，再回来。

<p align="center"><img src="docs/media/roles-live.gif" width="860" alt="角色窗口：一个 Claude Code 构建者、一个 Codex 构建者和一个审查者并排工作"></p>

**3. 每个分支落地就审查。** 审查者检查每个分支；意见发回同一个窗口修一轮，
然后编排者把它合并到 mission 分支上。

**4. 收尾落地。** 到 MR 关卡时由你批准开 MR。你合并之后，在面板里回答
`Merged?`，角色窗口和 worktree 这时才会被移除。

<p align="center"><img src="docs/media/mr-gate.gif" width="860" alt="MR 关卡、Merged? 关卡，以及收尾时关闭角色窗口"></p>

可以同时跑多个 mission，在一个仓库里或多个仓库里都行：各自从自己的 agent pane
启动。你的 checkout 始终停在原来的分支上；每个 mission 在
`.troupe/missions/<mission>` 里、`mission/<mission>` 分支上工作。在 herdr 中，
面板开在 agent 旁边的一个 herdr pane 里，连到 troupe 的 tmux 会话。

mission 怎么跑（何时审查、何时合并、有哪些关卡）是一个工作流 skill，
`skills/troupe-mission`，你可以修改或替换它。CLI 只强制那些保证工作正确的规则。

## 计划

Markdown 包着一个 yaml 代码块；每个角色的任务是 Markdown 里的一个
`## Role: <name>` 小节。模板在 `skills/troupe-mission/templates/plan.md`。

```yaml
troupe: 1
goal: "Refresh tokens rotate on every use, and a reused one is refused"
why: "Stolen refresh tokens stay valid for 30 days today (issue #212)"
workflow: troupe-mission
base: mission/auth-refresh
profiles:
  claude-build:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
    text: workflow:builder
roles:                                # 一个角色 = 一个窗口、一个 worktree、一个分支
  api:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    goal: "Rotate the token on refresh; refuse a reused one"
    touches: [src/api/refresh.ts, src/api/errors.ts]
  web:
    use: claude-build
    model: sonnet
    goal: "Sign the user out when a refresh is refused"
    touches: [web/src/session/]
    depends_on: [api]                 # api 的结果写明 done 后才打开
  review:
    use: claude-build
    goal: "Review each branch as it lands"
    touches: []                       # 不改任何文件
    reviews: [api, web]
    text: workflow:reviewer
```

`troupe check` 会拒绝：未知的 agent；`flags` 没有写定 agent 的权限
（Claude Code：`--permission-mode`；Codex：`-a` 和 `-s`）；角色没有任务文本或没有
`touches`；未知的 `depends_on`、`reviews` 或 profile；依赖成环；两个角色的
`touches` 重叠却没有 `depends_on` 排先后。`model` 和 `effort` 原样传递。

## 命令

都接受 `-m, --mission <name>`。不带它时，命令作用于当前 pane 绑定的 mission
（面板跟随它的编排者），否则作用于运行位置检出的 `mission/<name>` 分支；
都没有就拒绝，并列出打开的 mission 及其 worktree。`-m` 可以在任何地方从
mission 的 worktree 读计划，但不允许指定与当前 pane 所属不同的 mission。
成功退出 0，被拒绝退出 1（附原因），用法错误退出 2。

| 命令 | 作用 |
|---|---|
| `setup [--remove]` | 为找到的每个 harness 安装工作流 skill |
| `mission new <name> [--base <ref>]` | 在 `mission/<name>` 上创建 mission 的 worktree 和计划模板，把当前 pane 绑定上去并打开它的面板 |
| `open [--planning]` | 在当前 pane 旁边显示它的 mission 面板（每个 mission 一个）；没有 mission 时拒绝并列出打开的 mission，带 `--planning` 时则显示一个等待 `mission new` 的面板；在未绑定的 pane 里 `open -m <name>` 会让它成为该 mission 的编排者，前提是之前的编排者 pane 已经不在或已失效 |
| `up -m <name> [--orch claude\|codex]` | 先 `mission new`，再在 mission worktree 中打开编排者和面板 |
| `panel` | 实时面板（`up` 会运行它；`--once --plain` 打印一帧） |
| `check` | 检查计划和用户适配器 |
| `approve` | 批准计划，只能在终端里执行 |
| `gate <id> ["question"] [--no-wait]` | 在面板里问人；输出 `approve` 或 `change: <text>` |
| `stage <id>` | 移动面板的阶段条（id 来自工作流的 `stages.yaml`） |
| `dispatch <role>` | 打开一个角色：worktree、分支、任务简报、pane |
| `status [--json] [--watch]` | 每个角色的状态、提交、`touches` 之外的改动、结果；没有解析到 mission 时，列出打开的 mission 及其 worktree、编排者 pane 和面板 pane |
| `send <role> <text…>` | 往角色窗口里打字，只在它就绪时 |
| `wait --role <r> [--ready] \| --gate <id> [--timeout s]` | 等待结果、就绪或回答 |
| `close <role> \| --all` | 关闭 troupe 的 pane；worktree 和分支保留 |
| `teardown [--force]` | 关闭角色 pane 和 mission 面板，删除角色 worktree、角色分支、mission worktree 以及临时的 mission 简报和结果；保留 mission 分支和日志 |

打开的 mission 指：在 `mission/<name>` 分支上有 worktree 或有日志，且没有
teardown 事件。显式 `-m` 可以打开任何 mission，包括已结束的。编排者绑定之前，
面板会一直等它。

MR 合并、`merged` 关卡批准之后，运行 `troupe teardown -m <mission>`。它关闭
角色 pane 和 mission 面板，并解绑编排者的 pane（pane 本身保持打开）。只要工作流
声明的任一关卡未批准，它就拒绝；有未提交或未跟踪的改动、有未合并进计划 `base`
mission 分支的提交、或 mission 分支未推送，它也拒绝，除非带 `--force`。
owner 标记不同的 pane 会被跳过。显式 `-m` 再跑一次会报告没有可清理的东西。
MR 的 head 和日志都还在。

dispatch 之后、或发送新任务之前，用 `troupe wait --role <r> --ready --timeout 60`。
就绪即成功；遇到等待你的对话框会停下并显示它；pane 消失或超时则失败。

角色完成时在自己的 worktree 里写 `.troupe/result.md`，front matter 为
`status: done | blocked | failed` 和 `summary: "<一行>"`。

## 面板

标题栏、标签页（`1 MISSION`、`2 ROLES`、`3 PLAN`、`4 LOG`、`5 DIFF`）、
“需要你”条（一个打开的关卡、每个等你的角色），左边是角色、阶段和动态，
右边是流程图和所选角色的详情及其实时窗口。↑↓ 或 j/k 选角色，`o` 打开它的
pane，`s` 给它发消息（它在等你时此键无效），`d` 看 diff，`v` 看计划，
`a` / `c` 回答关卡，`?` 帮助，`q` 退出。在 tmux 传递鼠标的地方可以点击
（`set -g mouse on`）。

<a id="agents"></a>
## Agent

内置：`claude` 和 `codex`。适配器说明：如何带首条提示启动 agent、如何传 model
和 effort、哪些参数写定了它的权限，以及哪些屏幕模式表示等你、工作中、就绪。
新增一个放在 `~/.config/troupe/agents/<name>.yaml` 或
`<repo>/.troupe/agents/<name>.yaml`（仓库里的优先）；`src/agents.ts`
以同样的格式存放内置适配器。

内置角色的回合状态来自 agent 本身，而不是它的屏幕。Claude 角色启动时在
`--settings` 中带上生命周期 hook（`UserPromptSubmit`、`PermissionRequest`、
`PostToolBatch`、`Stop`，以及中断后的空闲通知），写入 `.troupe/activity.json`；
Codex 角色从它自己的会话日志读取（`task_started`、`task_complete`、
`turn_aborted`）。只有这份报告能让角色对 `send` 就绪。Claude 角色的 hook 也会
报告它在等你：`PermissionRequest` 开始一次等待（一个批准或一个问题），下一批
工具调用把它记为已回答而结束；拒绝或 Esc 不会触发 hook，就以角色转录里的中断行
结束。每次等待的结束都记在记录里（最近 50 条）。除此之外，回合进行中，屏幕模式
用来区分等待批准和工作中；在第一份报告之前它们暂代，但永远不会判为就绪。
`usage` 未设置的适配器只从屏幕读取。

编排者是被通知的，而不是被轮询的。它运行的每条 troupe 命令都会在运行日志里记下
它的 agent 会话：Claude Code 的 `CLAUDE_CODE_SESSION_ID` 或 Codex 的
`CODEX_THREAD_ID`（仅当该 agent 是命令的祖先进程时才接受），以及要打字的 pane
（tmux，或 herdr 的 `HERDR_PANE_ID`）。当某个角色的 agent 报告回合结束且已写好
结果、当人在面板里回答一个关卡、或当人在 Claude 角色的窗口里回答它的等待时
（`Role review was answered in its window and went on working.`，或拒绝/Esc 后的
`… was stopped in its window …`），面板会在编排者自己的回合结束后往编排者里打一行字；
回合结束从它的转录（Claude 的 `turn_duration` 或中断行）或会话日志（Codex）读取。
每个被回答的等待按从旧到新只通知一次，除非该角色的完成已经通知过、已有新任务发给它、
或它此后写了结果。每一行都记为一个 `notice`，所以面板重启前后既不重复也不丢失。
没有记录会话的 mission 退回到旧的、靠屏幕确认的关卡回答方式。

Codex 角色打开时不会出现 “Trust this folder?” 对话框：每个角色都以
`-c projects={"<main checkout>"={trust_level="trusted"}}` 启动，这正是回答该对话框时
会保存的条目（Codex 按仓库根目录记录信任），只对这次运行生效；
`~/.codex/config.toml` 不会被修改。

使用 `workspace-write` 的 Codex 角色会获得 `--add-dir` 授权，范围是它自己的 Git
worktree 元数据、共享的 `objects`，以及 `refs/heads/role/<mission>` 和对应的
reflog。这样它能提交，又不必授权整个公共 Git 目录或主分支的 ref。mission 的 ref
和 object 是共享的，所以同一 mission 里的角色之间并不隔离。批准/沙箱参数仍是计划里
写的那些。参见 [Codex CLI 参考](https://developers.openai.com/codex/cli/reference)。

## 东西放在哪

| 什么 | 在哪 | 进 git |
|---|---|---|
| mission worktree | `.troupe/missions/<mission>`，分支 `mission/<mission>` | 否 |
| 计划 | mission worktree 里的 `docs/missions/<mission>/plan.md` | 是 |
| 运行日志（批准、关卡、阶段、dispatch） | `<git-common-dir>/troupe/<mission>/log.jsonl` | 否 |
| 角色的启动简报 | `<worktree>/.troupe/brief.md`（在运行日志旁归档为 `brief-<role>.md`） | 否 |
| 角色 worktree | `.troupe/worktrees/<mission>/<role>`（`/.troupe/` 已排除） | 否 |
| 角色的结果 | `<worktree>/.troupe/result.md` | 否 |

## 已知限制

- 日志和任何文件一样只是参考：它能拦住一次健忘的 dispatch，拦不住一个铁了心要手写它的模型。
- 屏幕模式取自英文界面的 Claude Code 2.1.310 和 Codex 0.162.1。它们不再决定内置角色
  何时就绪，只判断进行中的回合是否在等你；troupe 认不出的屏幕记为 `unknown`，
  永远不会往里打字。
- Codex 不记录批准请求，所以等待批准的 Codex 角色只在屏幕模式匹配时显示为等待；
  无论哪种情况它都不算就绪。它的回答不会通知编排者。
- 上下文用量来自每个角色的转录。Codex 会记录它的窗口大小；对 Claude，troupe 启动角色时
  带一个状态栏（`--settings`），把 Claude Code 报告的窗口存到 `.troupe/context.json`，
  然后运行你配置的状态栏，所以你自己的状态栏照样显示。在它第一次运行之前，面板假定 200k，
  上下文超过 200k 后假定 1M。

## 开发

从克隆的仓库：`npm ci && npm run build && npm link` 把你构建的 `troupe` 放到
`PATH` 上。`./check.sh`（或 `npm test`）构建并在纯 Node 下运行测试；CI 在 macOS 和
Linux 上用 Node 20 和 22 运行。所有代码都在 `src/`：计划（`plan.ts`、`yaml.ts`、
`touches.ts`）、适配器（`agents.ts`）、日志和实时读取（`log.ts`、`state.ts`）、
命令（`commands.ts`、`role-commands.ts`、`command-context.ts`、`missions.ts`、
`panes.ts`、`setup.ts`），以及面板（`model.ts`、`draw.ts`、`canvas.ts`、`panel*.ts`）。
