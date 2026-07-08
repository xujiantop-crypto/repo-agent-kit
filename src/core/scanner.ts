import { generateArtifacts } from "../generators/artifacts.js";
import type { ScanOptions, ScanResult } from "../types.js";
import { normalizeRoot } from "./path-utils.js";
import { inspectMcp } from "./mcp-inspector.js";
import { profileRepository } from "./repo-profiler.js";
import { calculateScore } from "./scoring.js";
import { scanSecurity } from "./security-scanner.js";

export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const root = normalizeRoot(options.root);
  const profile = await profileRepository(root);
  const mcp = await inspectMcp(root);
  const security = await scanSecurity(root);
  const findings = [...mcp.findings, ...security.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const score = calculateScore(profile, findings);
  const generated = generateArtifacts(profile, mcp, findings);

  return { profile, mcp, security, score, generated, findings };
}

function severityRank(severity: string): number {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}
