# Agent Instructions

This repository contains `repo-agent-kit`, a TypeScript CLI for preparing repositories for AI coding agents.

## Commands

- Install dependencies: `npm install`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Build: `npm run build`
- Full check: `npm run check`

## Project Structure

- `src/cli.ts`: CLI entrypoint.
- `src/commands/`: command handlers.
- `src/core/`: scanners, scoring, and smoke bench logic.
- `src/generators/`: generated agent artifacts.
- `src/reporters/`: console and markdown reports.
- `test/`: Vitest coverage for the core behavior.

## Working Rules

- Keep the default mode local-first and API-key-free.
- Do not start MCP servers during the default static scan.
- Prefer deterministic rule-based analysis over LLM calls in core code.
- Add tests for every new scanner, generator, or scoring rule.
- Treat security findings as review signals, not as proof of exploitability.
- Avoid adding heavy dependencies unless they materially improve repository analysis.

## Release Notes

Before a release, run `npm run check` and verify `dist/cli.js` has a valid shebang.
