import type { ScanResult } from "../types.js";

export interface SmokeBenchTask {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SmokeBenchResult {
  overall: "pass" | "warn" | "fail";
  tasks: SmokeBenchTask[];
}

export function buildSmokeBench(result: ScanResult): SmokeBenchResult {
  const tasks: SmokeBenchTask[] = [
    {
      id: "agent-instructions",
      title: "Agent instructions are available",
      status: result.profile.importantFiles.includes("AGENTS.md") ? "pass" : "warn",
      detail: result.profile.importantFiles.includes("AGENTS.md")
        ? "AGENTS.md is present."
        : "AGENTS.md is missing. Run repo-agent-kit init to generate one."
    },
    {
      id: "test-command",
      title: "A test command is discoverable",
      status: result.profile.commands.some((command) => command.name === "test") ? "pass" : "fail",
      detail: result.profile.commands.find((command) => command.name === "test")?.command ?? "No test command was detected."
    },
    {
      id: "build-command",
      title: "A build command is discoverable",
      status: result.profile.commands.some((command) => command.name === "build") ? "pass" : "warn",
      detail: result.profile.commands.find((command) => command.name === "build")?.command ?? "No build command was detected."
    },
    {
      id: "mcp-risk",
      title: "MCP risk is reviewable",
      status: result.score.breakdown.mcpSafety >= 80 ? "pass" : result.score.breakdown.mcpSafety >= 50 ? "warn" : "fail",
      detail: `${result.mcp.servers.length} MCP servers detected; MCP safety score ${result.score.breakdown.mcpSafety}/100.`
    },
    {
      id: "security-risk",
      title: "Secret and prompt-injection risks are reviewable",
      status: result.score.breakdown.security >= 80 ? "pass" : result.score.breakdown.security >= 50 ? "warn" : "fail",
      detail: `Security score ${result.score.breakdown.security}/100 with ${result.security.findings.length} findings.`
    }
  ];

  const failCount = tasks.filter((task) => task.status === "fail").length;
  const warnCount = tasks.filter((task) => task.status === "warn").length;
  return {
    overall: failCount ? "fail" : warnCount ? "warn" : "pass",
    tasks
  };
}
