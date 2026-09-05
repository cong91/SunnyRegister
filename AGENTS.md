# 项目代码修改与提交规范

本文件中的规范适用于本仓库后续所有代码修改任务。

1. 开始代码修改前，先检查当前工作树和分支状态，然后从本项目对应的远程仓库拉取最新代码并更新本地分支。默认使用能够避免隐式合并提交的方式（如 `git pull --ff-only`）。如果存在未提交修改、分支分叉、合并冲突或无法安全更新的情况，先妥善处理或向用户说明，不得覆盖、丢弃用户已有修改。
2. 完成代码修改后，必须审查本次变更（至少检查完整 diff），确认实现范围、功能行为和用户本次任务要求一致，并检查明显的缺陷、回归风险及无关改动。
3. 审查完成后，必须运行与本次修改相匹配的测试、构建或静态检查，确认功能达到用户要求。若受环境或依赖限制无法执行某项必要验证，必须明确说明，不得将其描述为已通过。
4. 如果审查或测试发现问题，继续定位并修复，随后重新审查和测试，直到不存在已知问题。
5. 修改和验证均无问题后，直接提交并推送到本项目对应的远程仓库。提交信息统一使用 `feat: XXX实现了XXX功能` 格式，其中 `XXX` 应替换为本次改动对象和实际实现的功能；不得原样保留占位符。
6. 推送完成后，向用户报告提交哈希、目标分支、远程仓库以及已执行的验证结果。

## 会话授权约定

- 用户已授权后续任务执行必要的 Git 操作，包括检查状态、`git pull --ff-only`、暂存、提交和推送。
- 每项代码任务都必须先同步远程仓库最新代码，再开始修改；完成修改、审查和测试后，直接推送到远程 `main` 主干，不创建或等待 Pull Request。

## Project Guide (generated 2026-09-05)

### Purpose and Source of Truth

SunnyRegister is a self-hosted console for authorized account registration/login workflows, mailbox and SMS resources, proxy routing, session/token health, checkout/payment probes, task recovery, and audit logs.

Repository rules in this file take precedence, followed by `README.md`, `docs/`, manifests/configuration, nearby source/tests, and then the local `.codex` memory. Do not treat generated build output, runtime data, `.env`, or provider credentials as source.

### Stack and Ownership

- `backend/`: Go 1.23 module for the HTTP API, persistence, task scheduling, auth, audit, and integrations.
- `python-worker/`: Python 3.12+ FastAPI worker and isolated protocol/browser/mail/SMS/payment task runtime.
- `frontend/`: React 19 + TypeScript + Vite 8 console with Tailwind CSS 4, Radix slot, GSAP, and Lucide.
- `docs/`, `scripts/`, and Docker Compose files: deployment, lifecycle, and CI-equivalent operations; do not move source logic into these operational boundaries.
- Go and Python share PostgreSQL through `DATABASE_URL`; the worker also owns isolated task-state helpers and subprocess lifecycle.

### Core Coding Contract

- Read this file, the relevant README/docs/config, and nearby code/tests before editing.
- Prefer existing patterns and the smallest correct diff; do not add dependencies, compatibility layers, or broad refactors without a current requirement.
- Preserve public APIs and data shapes when they are part of the current contract; delete obsolete behavior directly instead of adding fallbacks.
- Add or update behavior tests beside the owning module and run the real formatter/linter/typecheck/test/build commands.
- Review the complete diff and untracked files, remove debug artifacts, and report skipped checks honestly.

### Engineering Principles

1. Do not preserve backward compatibility. Delete obsolete code directly; do not add compatibility layers, write migrations, or leave fallbacks.
2. Choose the simplest implementation that satisfies the current requirements. Avoid speculative abstractions and unnecessary configuration layers.
3. Keep the system layered for the long term. First make a minimal end-to-end version work, then add complexity. Never dismantle working code for unfinished complexity.
4. Keep components modular and separate concerns.
5. Prefer mature, actively maintained libraries. Do not rewrite established capabilities without a clear reason.
6. Inspect what existing dependencies can already do before adding packages or writing custom code. Do not assume a library is unavailable.
7. Make architecture decisions for the long term. Do not accept temporary solutions framed as "we can replace this later."
8. First study how mature products solve the same problem and use proven patterns; do not invent from scratch.

### Coding Standards (apply strictly)

- **Source:** LLM Wiki `C:\Users\mrc\Documents\projects\agent-wiki\queries\coding-standards-cross-language-cookbook.md`, plus the matching Go, Python, TypeScript, and framework cookbook pages.
- Follow repo conventions first; use the ecosystem formatter, then linter, then tests/type checks. Keep comments factual and sparse, validate errors and edge cases, and update tests for behavior changes.
- One file should have one primary responsibility. Split at a natural responsibility seam when any signal fires: (1) multi-role identity, (2) unrelated section-header navigation, (3) unrelated pile-up, (4) cross-domain import surface, (5) repeated edits in different places, or (6) a god symbol handling multiple input domains or output shapes.
- Refuse catch-all `utils`/`helpers`/`common`/`misc`/`shared` modules, unrelated public grab-bags, giant regression files that no longer mirror source boundaries, and “just one more function” additions to a file showing split signals.
- Before finalizing, scan every touched file. If a split signal fires, surface the proposed seam in the same turn and pause for the user’s decision. If declined, record a short rationale at the file head; if approved, split when practical and rerun verification.
- Go: let `gofmt` own formatting, keep packages cohesive, use short meaningful mixedCaps names, deliberate exported API, wrapped contextual errors, and table-driven focused tests.
- Python: keep imports grouped and modules importable, avoid wildcard imports and bare `except`, use exception chaining at boundaries, and keep runtime work behind callable/guarded entry points.
- TypeScript/React: keep explicit stable public types, avoid unjustified `any`/assertions, preserve readable module/component ownership, and run ESLint plus the TypeScript build.
- Framework code follows its existing lifecycle, routing, component, and configuration conventions; do not impose a foreign “clean architecture” reshuffle.

### Verified Commands

- `cd frontend; npm ci; npm run lint; npm run build`
- `cd backend; $env:GOTOOLCHAIN='go1.24.0'; go test -count=1 ./...; go vet ./...`
- `python -m pip install --requirement python-worker\requirements-test.txt; python -m pip check; python -m compileall -q python-worker; $env:PYTHONPATH='python-worker'; python -m pytest -q python-worker\tests`
- `powershell -ExecutionPolicy Bypass -File .\scripts\test-local.ps1` (requires Docker Desktop, Python 3.12+, and browser dependencies).
- Compose-only config check: `docker compose --env-file .env.production.example config --quiet`

### Boundaries and Gotchas

- Never commit `.env`, database/runtime data, exports, logs, screenshots, credentials, tokens, OTPs, or provider keys.
- Setup and code review must not start deployments, migrations, releases, or destructive database operations.
- Current host Go wrapper is `1.22.12`; the module declares Go `1.23`, while `backend/remail_test.go` uses `testing.T.Context`. Use the verified automatic `GOTOOLCHAIN=go1.24.0` path for local Go test/vet until the native toolchain policy is aligned.
- External mailbox, SMS, proxy, and payment providers are rate-limited and failure-prone; keep retries bounded and persisted task outcomes explicit.

### Code Example

The Go entry point loads environment configuration, opens the database, seeds provider definitions, marks interrupted tasks, and then serves the API with security/audit middleware (`backend/main.go`). Keep new startup work in that lifecycle and keep provider-specific behavior in its owning module.

### Source Notes and Open Questions

- Wiki pages read: `SCHEMA.md`, `index.md`, `log.md`, `AGENTS.md`, `queries/coding-standards-cross-language-cookbook.md`, `queries/coding-standards-programming-languages-go-cookbook.md`, `queries/coding-standards-programming-languages-python-cookbook.md`, `queries/coding-standards-programming-languages-typescript-cookbook.md`, and `queries/coding-standards-frameworks-cookbook.md`.
- Tool evidence: `srcwalk` backend overview/discover/show, Codebase-Memory moderate index (`5,795` nodes / `34,007` edges), and CI/script reads.
- Open questions: align the native Go installation with the tested 1.24 toolchain; keep the explicit toolchain override documented until then.
