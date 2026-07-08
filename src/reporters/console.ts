import pc from "picocolors";
import type { Finding, ScanResult } from "../types.js";

export function renderConsoleReport(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(pc.bold(`Repo Agent Readiness: ${result.profile.name}`));
  lines.push("");
  lines.push(`Agent Ready Score: ${colorScore(result.score.total)} ${pc.dim(`(${result.score.label})`)}`);
  lines.push(`MCP servers: ${result.mcp.servers.length}`);
  lines.push(`Findings: ${result.findings.length}`);
  lines.push("");
  lines.push(pc.bold("Score breakdown"));
  lines.push(`  Context:    ${result.score.breakdown.context}`);
  lines.push(`  Commands:   ${result.score.breakdown.commands}`);
  lines.push(`  MCP safety: ${result.score.breakdown.mcpSafety}`);
  lines.push(`  Security:   ${result.score.breakdown.security}`);
  lines.push(`  CI:         ${result.score.breakdown.ci}`);
  lines.push("");
  lines.push(pc.bold("Detected"));
  lines.push(`  Languages:  ${formatObject(result.profile.languages)}`);
  lines.push(`  Frameworks: ${result.profile.frameworks.join(", ") || "not detected"}`);
  lines.push(`  Commands:   ${result.profile.commands.length ? result.profile.commands.map((command) => command.name).join(", ") : "not detected"}`);
  lines.push("");
  lines.push(pc.bold("Top findings"));
  lines.push(...renderFindings(result.findings.slice(0, 8)));
  lines.push("");
  lines.push(pc.dim("Run `repo-agent-kit init` to generate AGENTS.md, Cursor rules, context map, MCP policy, and GitHub Action."));
  return lines.join("\n");
}

function colorScore(score: number): string {
  const text = `${score}/100`;
  if (score >= 85) return pc.green(text);
  if (score >= 70) return pc.cyan(text);
  if (score >= 50) return pc.yellow(text);
  return pc.red(text);
}

function renderFindings(findings: Finding[]): string[] {
  if (!findings.length) {
    return ["  No findings detected"];
  }
  return findings.map((finding) => {
    const label = finding.severity === "critical" || finding.severity === "high"
      ? pc.red(finding.severity)
      : finding.severity === "medium"
        ? pc.yellow(finding.severity)
        : pc.dim(finding.severity);
    return `  [${label}] ${finding.title}${finding.file ? pc.dim(` (${finding.file})`) : ""}`;
  });
}

function formatObject(value: Record<string, number>): string {
  const entries = Object.entries(value);
  return entries.length ? entries.map(([key, count]) => `${key} (${count})`).join(", ") : "not detected";
}
