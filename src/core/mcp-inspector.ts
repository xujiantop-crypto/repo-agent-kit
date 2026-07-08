import path from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import { readTextFile } from "./file-utils.js";
import type { Finding, McpScanResult, McpServer } from "../types.js";

const MCP_CONFIG_PATTERNS = [
  ".cursor/mcp.json",
  ".vscode/mcp.json",
  ".mcp.json",
  "mcp.json",
  ".claude/mcp.json",
  "claude_desktop_config.json",
  "**/*mcp*.json",
  "**/*mcp*.yaml",
  "**/*mcp*.yml"
];

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**"
];

export async function inspectMcp(root: string): Promise<McpScanResult> {
  const configFiles = await fg(MCP_CONFIG_PATTERNS, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: IGNORE,
    followSymbolicLinks: false,
    unique: true
  });

  const servers: McpServer[] = [];
  const findings: Finding[] = [];

  for (const relativeConfigPath of configFiles.sort()) {
    const fullPath = path.join(root, relativeConfigPath);
    const raw = await readTextFile(fullPath);
    if (!raw) {
      continue;
    }
    const parsed = parseConfig(raw, relativeConfigPath);
    if (!parsed) {
      findings.push({
        id: "mcp-config-parse-failed",
        title: "MCP config could not be parsed",
        severity: "medium",
        file: relativeConfigPath,
        recommendation: "Check whether this MCP configuration is valid JSON or YAML."
      });
      continue;
    }
    servers.push(...extractServers(parsed, relativeConfigPath));
  }

  for (const server of servers) {
    findings.push(...findMcpServerRisks(server));
  }

  return { configFiles: configFiles.sort(), servers, findings };
}

function parseConfig(raw: string, file: string): unknown | undefined {
  try {
    if (file.endsWith(".yaml") || file.endsWith(".yml")) {
      return parseYaml(raw);
    }
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function extractServers(config: unknown, configPath: string): McpServer[] {
  if (!config || typeof config !== "object") {
    return [];
  }
  const record = config as Record<string, unknown>;
  const candidates = [
    record.mcpServers,
    record.servers,
    record.mcp?.["servers" as keyof typeof record.mcp]
  ].filter(Boolean);

  const servers: McpServer[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    for (const [name, value] of Object.entries(candidate as Record<string, unknown>)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const server = value as Record<string, unknown>;
      const command = typeof server.command === "string" ? server.command : undefined;
      const args = Array.isArray(server.args) ? server.args.map(String) : undefined;
      const url = typeof server.url === "string" ? server.url : typeof server.endpoint === "string" ? server.endpoint : undefined;
      const env = server.env && typeof server.env === "object" ? Object.keys(server.env) : [];
      const transport = detectTransport(server, command, url);
      servers.push({
        name,
        configPath,
        transport,
        command,
        args,
        url,
        envKeys: env.sort(),
        riskTags: detectRiskTags({ name, command, args, url, envKeys: env })
      });
    }
  }
  return servers;
}

function detectTransport(
  server: Record<string, unknown>,
  command: string | undefined,
  url: string | undefined
): McpServer["transport"] {
  const transport = typeof server.transport === "string" ? server.transport.toLowerCase() : undefined;
  if (transport === "stdio" || transport === "sse" || transport === "http") {
    return transport;
  }
  if (url?.startsWith("http")) return "http";
  if (command) return "stdio";
  return "unknown";
}

function detectRiskTags(input: {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
}): string[] {
  const text = [input.name, input.command, ...(input.args ?? []), input.url].filter(Boolean).join(" ").toLowerCase();
  const tags = new Set<string>();

  if (/(shell|terminal|exec|command|bash|powershell|cmd\b)/.test(text)) tags.add("shell");
  if (/(file|filesystem|fs|path|directory|workspace)/.test(text)) tags.add("filesystem");
  if (/(postgres|mysql|sqlite|mongo|redis|database|db\b)/.test(text)) tags.add("database");
  if (/(browser|playwright|chrome|puppeteer|selenium)/.test(text)) tags.add("browser");
  if (/(http|fetch|web|network|curl|wget)/.test(text)) tags.add("network");
  if (/(aws|gcp|azure|cloudflare|kubernetes|kubectl|docker)/.test(text)) tags.add("cloud");
  if (/(npx|uvx|pipx|docker run|bunx)/.test(text)) tags.add("package-exec");
  if (input.envKeys.some((key) => /(token|secret|key|password|credential)/i.test(key))) tags.add("secrets");

  return [...tags].sort();
}

function findMcpServerRisks(server: McpServer): Finding[] {
  const findings: Finding[] = [];
  if (server.transport === "stdio" && server.riskTags.includes("package-exec")) {
    findings.push({
      id: "mcp-stdio-package-exec",
      title: "MCP server runs through a package executor",
      severity: "high",
      file: server.configPath,
      evidence: `${server.name}: ${[server.command, ...(server.args ?? [])].filter(Boolean).join(" ")}`,
      recommendation: "Pin the package version, review the package source, and prefer a local lockfile or vendored command for sensitive repositories."
    });
  }
  if (server.riskTags.includes("shell")) {
    findings.push({
      id: "mcp-shell-tool",
      title: "MCP server appears to expose shell or command execution",
      severity: "critical",
      file: server.configPath,
      evidence: server.name,
      recommendation: "Add a command allowlist, run in a sandbox, and require human confirmation before write or network operations."
    });
  }
  if (server.riskTags.includes("filesystem")) {
    findings.push({
      id: "mcp-filesystem-tool",
      title: "MCP server appears to expose filesystem access",
      severity: "high",
      file: server.configPath,
      evidence: server.name,
      recommendation: "Restrict roots to the repository, deny dotfiles by default, and log all write operations."
    });
  }
  if (server.riskTags.includes("secrets")) {
    findings.push({
      id: "mcp-secret-env",
      title: "MCP server receives secret-like environment variables",
      severity: "high",
      file: server.configPath,
      evidence: `${server.name}: ${server.envKeys.join(", ")}`,
      recommendation: "Use least-privilege tokens and avoid exposing broad personal credentials to agent tools."
    });
  }
  if (server.transport === "http") {
    findings.push({
      id: "mcp-remote-server",
      title: "Remote MCP server configured",
      severity: "medium",
      file: server.configPath,
      evidence: `${server.name}: ${server.url}`,
      recommendation: "Verify the server owner, transport security, and data retention policy before sending repository context."
    });
  }
  return findings;
}
