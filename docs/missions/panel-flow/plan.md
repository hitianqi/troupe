# panel-flow: 面板 FLOW 完整显示、即时响应与真实模型

## Intent

让 troupe 面板更好用：FLOW 在多个 agent、依赖层级很深时也完整显示（间隔自适应，不挤成一列）；按下快捷键立即响应（现在约 2 秒才动）；角色框里显示真正生效的模型（含用户通过环境变量配置的情况），而不是 "sonnet"/"default" 之类的占位。

## Done when

- FLOW 依赖树无论多深，每个 agent 的盒子都完整可见、缩进层级正确，不会多个盒子挤在同一列；agent 多时隔自行收窄以适配面板宽度。
- 面板运行期间（尤其有 agent 在工作时）按任意快捷键都能几乎立即响应，不再有约 2 秒卡顿。
- 角色盒子与详情中显示的模型是真正生效的模型：plan 未填 `model`、用户用环境变量（如 `~/.bashrc` 里的 `ANTHROPIC_MODEL`）配置了模型时，面板显示该模型而非占位。
- `npm test` 全绿（golden 按需用 `UPDATE_GOLDENS=1 npm test` 重录），无越界文件改动。

## Out of scope

- 不改 troupe 的编排/工作流/分支与 worktree 逻辑，不改 CLI 命令的同步语义。
- 不做大范围异步重构，除非确有必要且保持 CLI 路径不变。
- 不改面板整体配色、字体、其余 tab（ROLES/PLAN/LOG/DIFF）的布局。
- FLOW 纵向不保证一屏放下：详情与实时窗口原本就随 FLOW 一起滚动，这不在本次范围。

## Decisions for you

1. 真实模型显示要认哪些环境变量？
   **Recommended: 仅 Claude 的 `ANTHROPIC_MODEL`**, 因为需求点名 "✻ claude sonnet"，且 Codex 没有标准的模型环境变量（走配置文件而非环境变量）。若你另有约定的变量名（如公司自定义），请在 gate 说明。
2. "显示完整" 是否也要纵向一屏放下所有 agent（不滚动）？
   **Recommended: 否**, 只做横向间隔自适应。纵向还有详情与实时窗口要往下排，缩盒子高度会裁掉名字/模型/effort 等内容。

## How the work is split

两个 builder 各负责一层，文件集完全不重叠，可并行；一个 reviewer 逐个复审。

- `display` 拥有「把已读到的状态画出来」这一层（`draw.ts`/`model.ts`/`agents.ts`/`panel-model.ts` + draw 测试），做 FLOW 间隔自适应（#1）和真实模型显示（#3）。
- `panel` 拥有「怎么读状态、怎么跑渲染循环」这一层（`panel.ts` + 读状态的 `run.ts`/`state.ts`/`usage.ts`/`activity.ts`/`role-commands.ts`/`missions.ts`/`command-context.ts`），做按键延迟（#2）。
- 共享风险点只有一条数据流：`panel-model.ts` 调用 `mission()`/`liveOf()`。因此 `panel` 不得改这两个函数的对外签名（只在内部缓存），否则会打断 `display`。静态文件无交集。

```yaml
troupe: 1
goal: "让面板 FLOW 完整显示、按键即时响应，并显示真实生效的模型"
why: "现在 FLOW 多 agent 时缩进挤压、按键有约 2 秒卡顿、模型显示为占位"
workflow: troupe-mission
base: mission/panel-flow
profiles:
  claude-build:
    agent: claude
    model: opus
    effort: high
    flags: [--dangerously-skip-permissions]
    text: workflow:builder
roles:
  display:
    use: claude-build
    goal: "FLOW 依赖树间隔自适应，角色框显示真实生效模型"
    touches: [src/draw.ts, src/model.ts, src/agents.ts, src/panel-model.ts, tests/draw.node.mjs, tests/goldens/]
  panel:
    use: claude-build
    goal: "消除面板约 2 秒的按键响应延迟"
    touches: [src/panel.ts, src/run.ts, src/command-context.ts, src/role-commands.ts, src/state.ts, src/usage.ts, src/activity.ts, src/missions.ts, tests/panel-live.node.mjs, tests/usage.node.mjs, tests/activity.node.mjs, tests/state.node.mjs]
  review:
    agent: claude
    model: sonnet
    effort: high
    flags: [--permission-mode, acceptEdits]
    goal: "Review each branch as it lands"
    touches: []
    reviews: [display, panel]
    text: workflow:reviewer
```

## Role: display

`src/draw.ts` 的 `flow()`（约 553–671 行）现在用固定的 `STEP = 4` 缩进。`levels = floor((width - box - INDENT) / STEP)` 之后，`colOf(depth) = INDENT + min(depth, levels) * STEP` 会把深度超过 `levels` 的盒子都挤到同一列——树结构塌掉、FLOW 不完整。把它改成间隔自适应：

1. `STEP` 随 `deepest`（最深依赖层级）自适应：把 `width` 扣掉 `INDENT`、`box`（以及有 reviewer lane 时的 `6 + lane`）后的剩余宽度均匀分给 `deepest` 层，`STEP` 在某个下限（约 1~2）与 4 之间取整。这样 `deepest` 再大，`levels == deepest`，去掉 `min(depth, levels)` 的截断，每个层级都有独立缩进、盒子清晰可见。
2. 同时让 reviewer lane 的 `side` 判断与新 `STEP` 保持一致（有 lane 时也要保证最深一层不被挡）。

模型显示（#3）：

3. 在 `src/model.ts` 给 `RoleView` 增加「生效模型」概念（plan 里 `model` 为空时，用环境变量推断的真实模型）。`src/agents.ts`（如需要）给每个 agent 声明它认的模型环境变量名（Claude 用 `ANTHROPIC_MODEL`）。
4. `src/panel-model.ts` 的 `readPanel` 里读 `r.env`，把环境变量模型带进 `modelOf`；`src/draw.ts` 的 `roleBox`（约 580 行）与 `detail`（约 699 行）显示生效模型，替代 `role.model || t('default')`。

不要改动：`panel.ts` 渲染循环、`state.ts`/`usage.ts`/`activity.ts`/`role-commands.ts`/`missions.ts` 的读状态逻辑、其余 tab 与配色。

证明：`npm run build && npm test` 全绿；给「深层依赖树」加一条 draw 用例，golden 用 `UPDATE_GOLDENS=1 npm test` 重录，确认缩进随深度收窄、无盒子被挤到同一列；model 层加单测证明 env 模型解析正确。

## Role: panel

2 秒延迟的根因：`src/panel.ts` 的 `refresh()`（`setInterval`，2000ms）同步调用 `readPanel`；其中每个 role 的 `liveOf`/`workOf`/`tokensOf`/`claudeTurn`/`codexTurn` 通过 `src/run.ts` 的 `spawnSync` 与同步 `statSync`/`readFileSync` 触发大量阻塞式子进程（每条 role 约：4 次 git + 1~2 次 tmux capture + transcript/usage 读取），阻塞事件循环，按键要等 refresh 跑完才被处理。

- 让一次 refresh 足够快（明显低于 100ms），按键即时应。优先用缓存/合并削减阻塞工作：`workOf` 的 `git diff -U3` 与 `git log`/`git ls-files` 按 (worktree, base, HEAD) 缓存、只在 HEAD 或结果变化时重算；`tokensOf`/transcript 用 `statSync` mtime 判断避免重复读；减少不必要的 tmux 子进程。
- 可在 `panel.ts` 让输入优先渲染（不排在同一条 refresh 队列之后），保证按键进入后立即画出。
- 约束：不要改 `mission()`、`liveOf()` 的对外签名（`panel-model.ts` 依赖它们）——在函数内部缓存即可；不要碰 `draw.ts`/`model.ts`/`panel-model.ts`。若确实需要异步，必须保持 CLI 路径不变、`readPanel` 仍可被同步消费，并在 `result.md` 说明如何与 display 角色衔接。

证明：`npm test` 全绿；给缓存正确性加测试（HEAD 变化后重算、未变化时命中）；人工验证——面板开着、有多个 role 处于 working 时按 ↑↓/tab/o 等快捷键几乎立即响应，无约 2 秒卡顿。

## Role: review

按分支落地顺序逐个 review。除 reviewer 规则外，重点核查：display 的 FLOW 缩进自适应在窄/宽面板及有/无 reviewer lane 下都正确、golden 与实现一致；panel 的缓存不会在 HEAD/结果变化后给出陈旧数据，且确实没有改 `mission()`/`liveOf()` 的签名以致打断 `panel-model.ts`；两角色的 `touches` 内文件外无改动。