import type { Finding, RepoProfile, ScoreBreakdown } from "../types.js";

export function calculateScore(profile: RepoProfile, findings: Finding[]): {
  total: number;
  label: "poor" | "fair" | "good" | "excellent";
  breakdown: ScoreBreakdown;
} {
  const hasAgents = profile.importantFiles.includes("AGENTS.md");
  const hasCursor = profile.importantFiles.includes(".cursor/rules/project.mdc");
  const hasCopilot = profile.importantFiles.includes(".github/copilot-instructions.md");
  const hasTests = profile.commands.some((command) => command.name === "test");
  const hasBuild = profile.commands.some((command) => command.name === "build");

  const context = clamp((hasAgents ? 35 : 0) + (hasCursor ? 20 : 0) + (hasCopilot ? 15 : 0) + (profile.sourceDirs.length ? 15 : 0) + (profile.frameworks.length ? 15 : 0));
  const commands = clamp((hasTests ? 45 : 0) + (hasBuild ? 30 : 0) + (profile.commands.length >= 3 ? 25 : 0));
  const security = clamp(100 - severityPenalty(findings.filter((finding) => !finding.id.startsWith("mcp-"))));
  const mcpSafety = clamp(100 - severityPenalty(findings.filter((finding) => finding.id.startsWith("mcp-"))));
  const ci = clamp(profile.ciProviders.length ? 100 : 35);

  const breakdown = { context, commands, mcpSafety, security, ci };
  const total = Math.round(context * 0.3 + commands * 0.2 + mcpSafety * 0.2 + security * 0.2 + ci * 0.1);
  const label = total >= 85 ? "excellent" : total >= 70 ? "good" : total >= 50 ? "fair" : "poor";

  return { total, label, breakdown };
}

function severityPenalty(findings: Finding[]): number {
  return findings.reduce((sum, finding) => {
    if (finding.severity === "critical") return sum + 45;
    if (finding.severity === "high") return sum + 25;
    if (finding.severity === "medium") return sum + 12;
    return sum + 5;
  }, 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
