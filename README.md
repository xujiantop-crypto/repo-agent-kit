# repo-agent-kit

Make any repository ready, safe, and measurable for AI coding agents.

`repo-agent-kit` is a local-first CLI that scans a repository, scores its AI-agent readiness, detects risky MCP configuration, and generates the instruction files that tools like Codex, Cursor, Claude Code, Copilot, and other coding agents need.

```bash
npx repo-agent-kit scan
npx repo-agent-kit init
npx repo-agent-kit bench
```

```text
Repo Agent Readiness: my-app

Agent Ready Score: 74/100 (good)
MCP servers: 3
Findings: 5

Top findings
  [critical] MCP server appears to expose shell or command execution
  [high] MCP server receives secret-like environment variables
  [medium] Prompt-injection-like text found
```

## Why This Exists

AI coding agents are becoming part of normal development, but most repositories are not prepared for them:

- The agent does not know the right test/build commands.
- Project rules live in a human README, not in agent-readable instructions.
- MCP tools can expose shell, filesystem, browser, database, cloud, or secret access.
- Teams have no simple scorecard for whether a repo is safe to hand to an agent.

`repo-agent-kit` turns that into a one-command workflow.

## Features

- Repository profiling for TypeScript, JavaScript, Python, Java, Go, Rust, and more.
- Tiered repository fingerprinting that checks high-signal manifests and entrypoints before broad language sampling.
- Static HTML site detection for small frontend projects without `package.json`.
- Framework and package manager detection.
- Test/build/lint command discovery.
- `AGENTS.md` generation.
- Cursor project rule generation.
- GitHub Copilot instruction generation.
- Agent context map generation.
- Static MCP configuration inspection.
- Secret-like file and prompt-injection text checks.
- Agent readiness score and MCP safety score.
- Local smoke bench for agent readiness.
- GitHub Action template for continuous checks.

## Install

```bash
npm install -g repo-agent-kit
```

Or run without installing:

```bash
npx repo-agent-kit scan
```

## Commands

### Scan a Repository

```bash
repo-agent-kit scan
repo-agent-kit scan --json
repo-agent-kit scan -o .agent/report.md
```

### Generate Agent Files

```bash
repo-agent-kit init
repo-agent-kit init --dry-run
```

Generated files:

- `AGENTS.md`
- `.cursor/rules/project.mdc`
- `.github/copilot-instructions.md`
- `.agent/context-map.md`
- `.agent/mcp-policy.yaml`
- `.github/workflows/agent-readiness.yml`

### Inspect MCP Configuration

```bash
repo-agent-kit mcp
repo-agent-kit mcp --json
```

The default MCP scan is static. It reads configuration files but does not start MCP servers.

### Run Agent Smoke Bench

```bash
repo-agent-kit bench
```

Smoke bench checks whether a coding agent can discover basic instructions, validation commands, MCP risk, and secret/prompt-injection risk.

## What It Detects

### Repository Readiness

- Language and framework signals.
- Entrypoints such as `index.html`, `src/main.ts`, `main.go`, Spring Boot application classes, and runtime config files.
- Package manager and scripts.
- Static frontend files such as HTML, CSS, browser JavaScript, nginx config, and cron helpers.
- CI provider.
- Existing agent instruction files.
- Source and test directories.

## How Profiling Works

The profiler is designed to build useful agent context without reading an entire repository up front.

It uses a tiered fingerprint strategy:

1. Check high-signal manifests: `package.json`, `pom.xml`, `pyproject.toml`, `go.mod`, `Cargo.toml`, CI workflows, agent instruction files, and deployment files.
2. Check likely entrypoints: static `index.html`, frontend app entry files, Go `main.go`, Rust `src/main.rs` / `src/lib.rs`, Spring Boot application classes, and runtime config files.
3. Sample language files with a cap so large repositories stay responsive.
4. Read only a small number of candidate files when content confirmation matters, such as confirming a Java `*Application.java` is really a runnable application entrypoint.

This keeps scans fast while giving coding agents the facts they need first: what kind of project this is, how to validate changes, where to start reading, and which files or tools deserve caution.

### MCP Risk

- `stdio` servers.
- Package executors such as `npx`, `uvx`, `pipx`, and `docker run`.
- Shell or command execution.
- Filesystem access.
- Database access.
- Browser automation.
- Cloud access.
- Secret-like environment variables.
- Remote MCP servers.

### Security Risk

- `.env` and secret-like files.
- Private key files.
- Prompt-injection-like text in markdown and prompt files.
- Destructive package scripts.

## Example Output Files

`AGENTS.md` tells coding agents how to work in the repository:

```md
# Agent Instructions

## Commands

- test: `npm run test`
- build: `npm run build`

## Working Rules

- Prefer small, targeted patches.
- Run the narrowest relevant test command.
- Do not expose secrets from .env files or MCP configuration.
```

`.agent/mcp-policy.yaml` gives teams a reviewable policy scaffold:

```yaml
version: 1
mode: review-first
defaults:
  allowNetwork: false
  allowFilesystemWrite: false
  allowShell: false
```

## Positioning

This is not another agent framework.

It is the missing preparation layer around existing coding agents:

```text
Repository -> repo-agent-kit -> Codex / Cursor / Claude Code / Copilot / MCP tools
```

The goal is to make a repo:

- readable by agents,
- safer for agents,
- measurable before and after setup,
- easy to onboard into AI coding workflows.

## Roadmap

- Language-specific analyzers for Java, Python, Go, Rust, and monorepos.
- Better framework-specific entrypoint ranking for Spring, Django/FastAPI, Cargo workspaces, and multi-app frontends.
- SARIF output for GitHub code scanning.
- MCP allowlist and denylist policy validation.
- Live MCP metadata inspection behind an explicit `--inspect-live` flag.
- Agent smoke tasks that can run against Codex, Claude Code, Cursor, or other local agent CLIs.
- HTML report with shareable screenshots.
- Badges for Agent Ready Score and MCP Risk Score.

## Security Notes

`repo-agent-kit` is a scanner and generator, not a sandbox and not a complete security boundary. Treat its output as a review aid. Always review generated files before committing them, and require human approval before agents run tools with shell, filesystem, database, cloud, browser, or secret access.

## Development

```bash
npm install
npm run check
npm run dev -- scan .
```

## License

MIT
