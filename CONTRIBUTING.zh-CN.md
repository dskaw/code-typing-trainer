# 贡献指南

<p align="center">
  <a href="./CONTRIBUTING.md"><strong>English</strong></a> |
  <a href="./CONTRIBUTING.zh-CN.md"><strong>简体中文</strong></a>
</p>

感谢你愿意改进 CodeTyping Trainer。

---

## 快速开始

```bash
npm install
npm run dev
```

测试：
```bash
npm run test
```

构建/打包：
```bash
npm run build
```

---

## 项目定位与入口

建议从这些文档/文件开始：
- 架构说明（中文）：`docs/ARCHITECTURE.zh-CN.md`
- 架构说明（英文）：`docs/ARCHITECTURE.md`

---

## 贡献时必须遵守的关键约束

请尽量保持这些约束不被破坏（它们直接决定 Typing 页是否会卡顿/掉帧）：

- Typing 页性能策略：
  - typing engine 状态保存在 `useRef`（不要把大数组 marks 放进 React state）
  - UI 更新用 `requestAnimationFrame` 做批处理
  - Monaco 的“动态 decorations”保持常数级（range-based，小常数数量），不要回退到 per-char decorations
- Renderer 安全策略：
  - renderer 不允许直接访问 `fs`
  - 所有文件读写都通过 preload 暴露的 `window.api` 调用（IPC）

---

## 代码风格建议

- TypeScript + React function components。
- 尽量避免无关的大重构；优先小范围、目标明确的改动。
- PR/Commit message 尽量清晰：说明“修了什么问题 / 为什么这样改 / 如何验证”。

---

## 报告问题（Bug / 反馈）

请使用 GitHub Issues，并尽量附上：
- 操作系统版本（Windows/macOS/Linux）与 Node 版本
- 复现步骤（尽量可复制）
- 期望行为 vs 实际行为
- 样例文件或最小文本片段（如果方便的话）

