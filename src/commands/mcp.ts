import pc from "picocolors";
import { inspectMcp } from "../core/mcp-inspector.js";
import { normalizeRoot } from "../core/path-utils.js";

export async function runMcp(targetPath: string, options: { json?: boolean }): Promise<void> {
  const root = normalizeRoot(targetPath);
  const result = await inspectMcp(root);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${pc.bold("MCP Inspector")}\n\n`);
  process.stdout.write(`Config files: ${result.configFiles.length}\n`);
  process.stdout.write(`Servers: ${result.servers.length}\n`);
  for (const server of result.servers) {
    const risk = server.riskTags.length ? pc.yellow(server.riskTags.join(", ")) : pc.green("none");
    process.stdout.write(`- ${server.name}: ${server.transport}; risk tags: ${risk}\n`);
  }
  if (result.findings.length) {
    process.stdout.write(`\n${pc.bold("Findings")}\n`);
    for (const finding of result.findings) {
      const color = finding.severity === "critical" || finding.severity === "high" ? pc.red : pc.yellow;
      process.stdout.write(`- [${color(finding.severity)}] ${finding.title}${finding.file ? pc.dim(` (${finding.file})`) : ""}\n`);
    }
  }
}
