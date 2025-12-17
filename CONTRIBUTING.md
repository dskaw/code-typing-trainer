# Contributing

Thanks for your interest in improving CodeTyping Trainer.

## Quick start

```bash
npm install
npm run dev
```

Tests:
```bash
npm run test
```

Build/package:
```bash
npm run build
```

## Project orientation

Start here:
- Architecture: `docs/ARCHITECTURE.md`

Key constraints (please keep these intact):
- Typing page performance:
  - typing engine state is stored in refs (not React state),
  - UI updates are batched via `requestAnimationFrame`,
  - dynamic Monaco decorations remain constant-time per frame (range-based, small constant count).
- Renderer security: no direct `fs` usage (use preload `window.api`).

## Style

- TypeScript + React function components.
- Avoid large refactors in unrelated areas.
- Prefer small, well-scoped PRs with clear descriptions.

## Reporting bugs

Please use GitHub Issues. Include:
- OS + Node version
- steps to reproduce
- expected vs actual behavior
- sample input file (or a minimal snippet) if applicable
