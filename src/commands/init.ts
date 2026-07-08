import path from "node:path";
import pc from "picocolors";
import { scanRepository } from "../core/scanner.js";
import { writeTextFile } from "../core/file-utils.js";

const ARTIFACT_PATHS = {
  agentsMd: "AGENTS.md",
  cursorRule: ".cursor/rules/project.mdc",
  copilotInstructions: ".github/copilot-instructions.md",
  contextMap: ".agent/context-map.md",
  mcpPolicy: ".agent/mcp-policy.yaml",
  githubAction: ".github/workflows/agent-readiness.yml"
} as const;

export async function runInit(targetPath: string, options: { dryRun?: boolean }): Promise<void> {
  const result = await scanRepository({ root: targetPath });
  const entries = Object.entries(ARTIFACT_PATHS) as Array<[keyof typeof ARTIFACT_PATHS, string]>;

  for (const [key, relativePath] of entries) {
    const outputPath = path.join(result.profile.root, relativePath);
    if (options.dryRun) {
      process.stdout.write(`${pc.dim("would write")} ${relativePath}\n`);
      continue;
    }
    await writeTextFile(outputPath, result.generated[key]);
    process.stdout.write(`${pc.green("written")} ${relativePath}\n`);
  }

  process.stdout.write(`\n${pc.bold("Agent Ready Score:")} ${result.score.total}/100 (${result.score.label})\n`);
}
