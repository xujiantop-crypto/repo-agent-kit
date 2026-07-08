import type { Finding, ScanResult } from "../types.js";

export function renderMarkdownReport(result: ScanResult): string {
  const { profile, score, mcp, findings } = result;
  return `# Repo Agent Readiness Report

## Summary

- Repository: ${profile.name}
- Agent Ready Score: ${score.total}/100 (${score.label})
- MCP servers: ${mcp.servers.length}
- Findings: ${findings.length}

## Score Breakdown

| Area | Score |
| --- | ---: |
| Context | ${score.breakdown.context} |
| Commands | ${score.breakdown.commands} |
| MCP Safety | ${score.breakdown.mcpSafety} |
| Security | ${score.breakdown.security} |
| CI | ${score.breakdown.ci} |

## Repository Profile

- Languages: ${formatObject(profile.languages)}
- Frameworks: ${profile.frameworks.join(", ") || "not detected"}
- Entrypoints: ${profile.entrypoints?.join(", ") || "not detected"}
- Package manager: ${profile.packageManager ?? "not detected"}
- CI: ${profile.ciProviders.join(", ") || "not detected"}
- Scan strategy: ${profile.scanStrategy?.mode ?? "standard"}

## Commands

${profile.commands.map((command) => `- ${command.name}: \`${command.command}\` (${command.source})`).join("\n") || "- No commands detected"}

## MCP Servers

${mcp.servers.map((server) => `- ${server.name}: ${server.transport}; tags: ${server.riskTags.join(", ") || "none"}`).join("\n") || "- No MCP servers detected"}

## Findings

${renderFindings(findings)}

## Generated Artifacts

Run \`repo-agent-kit init\` to generate:

- \`AGENTS.md\`
- \`.cursor/rules/project.mdc\`
- \`.github/copilot-instructions.md\`
- \`.agent/context-map.md\`
- \`.agent/mcp-policy.yaml\`
- \`.github/workflows/agent-readiness.yml\`
`;
}

function renderFindings(findings: Finding[]): string {
  if (!findings.length) {
    return "- No findings detected";
  }
  return findings
    .map((finding) => {
      const file = finding.file ? `\n  - File: \`${finding.file}\`` : "";
      const evidence = finding.evidence ? `\n  - Evidence: ${finding.evidence}` : "";
      return `- [${finding.severity}] ${finding.title}${file}${evidence}\n  - Recommendation: ${finding.recommendation}`;
    })
    .join("\n");
}

function formatObject(value: Record<string, number>): string {
  const entries = Object.entries(value);
  return entries.length ? entries.map(([key, count]) => `${key} (${count})`).join(", ") : "not detected";
}
