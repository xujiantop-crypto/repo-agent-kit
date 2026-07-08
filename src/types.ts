export type Severity = "low" | "medium" | "high" | "critical";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  file?: string;
  evidence?: string;
  recommendation: string;
}

export interface DetectedCommand {
  name: string;
  command: string;
  source: string;
}

export interface RepoProfile {
  root: string;
  name: string;
  packageManager?: string;
  languages: Record<string, number>;
  frameworks: string[];
  commands: DetectedCommand[];
  importantFiles: string[];
  sourceDirs: string[];
  testDirs: string[];
  ciProviders: string[];
  packageScripts: Record<string, string>;
}

export interface McpServer {
  name: string;
  configPath: string;
  transport: "stdio" | "sse" | "http" | "unknown";
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
  riskTags: string[];
}

export interface McpScanResult {
  configFiles: string[];
  servers: McpServer[];
  findings: Finding[];
}

export interface SecurityScanResult {
  findings: Finding[];
}

export interface AgentArtifacts {
  agentsMd: string;
  cursorRule: string;
  copilotInstructions: string;
  contextMap: string;
  mcpPolicy: string;
  githubAction: string;
}

export interface ScoreBreakdown {
  context: number;
  commands: number;
  mcpSafety: number;
  security: number;
  ci: number;
}

export interface ScanResult {
  profile: RepoProfile;
  mcp: McpScanResult;
  security: SecurityScanResult;
  score: {
    total: number;
    label: "poor" | "fair" | "good" | "excellent";
    breakdown: ScoreBreakdown;
  };
  generated: AgentArtifacts;
  findings: Finding[];
}

export interface ScanOptions {
  root: string;
}
