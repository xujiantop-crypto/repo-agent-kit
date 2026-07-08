#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { runBench } from "./commands/bench.js";
import { runInit } from "./commands/init.js";
import { runMcp } from "./commands/mcp.js";
import { runScan } from "./commands/scan.js";

const program = new Command();

program
  .name("repo-agent-kit")
  .alias("rak")
  .description("Make any repository ready, safe, and measurable for AI coding agents.")
  .version("0.1.0");

program
  .command("scan")
  .argument("[path]", "repository path", ".")
  .option("--json", "print JSON instead of a human report")
  .option("-o, --output <file>", "write markdown or JSON report to a file")
  .description("scan a repository and print an agent readiness report")
  .action(async (targetPath: string, options: { json?: boolean; output?: string }) => {
    await runScan(targetPath, options);
  });

program
  .command("init")
  .alias("fix")
  .argument("[path]", "repository path", ".")
  .option("--dry-run", "show files that would be generated without writing them")
  .description("generate AGENTS.md, Cursor rules, context map, MCP policy, and CI workflow")
  .action(async (targetPath: string, options: { dryRun?: boolean }) => {
    await runInit(targetPath, options);
  });

program
  .command("mcp")
  .argument("[path]", "repository path", ".")
  .option("--json", "print JSON instead of a human report")
  .description("scan MCP configuration files and highlight risky tools or transports")
  .action(async (targetPath: string, options: { json?: boolean }) => {
    await runMcp(targetPath, options);
  });

program
  .command("bench")
  .argument("[path]", "repository path", ".")
  .option("--json", "print JSON instead of a human report")
  .description("run local smoke checks for AI coding-agent readiness")
  .action(async (targetPath: string, options: { json?: boolean }) => {
    await runBench(targetPath, options);
  });

program
  .showHelpAfterError()
  .showSuggestionAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`repo-agent-kit failed: ${message}`));
  process.exitCode = 1;
});
