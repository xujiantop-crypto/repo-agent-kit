import path from "node:path";
import fg from "fast-glob";
import { readTextFile } from "./file-utils.js";
import type { Finding, SecurityScanResult } from "../types.js";

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**"
];

const SECRET_FILE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "id_rsa",
  "id_ed25519",
  "**/*credential*.json",
  "**/*secret*.json"
];

const PROMPT_INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/do not (tell|inform|notify) (the )?user/i, "hidden instruction asks the agent not to notify the user"],
  [/ignore (all )?(previous|prior) instructions/i, "instruction attempts to override agent policy"],
  [/read .*\.env/i, "instruction asks the agent to read env files"],
  [/send .*secret/i, "instruction asks the agent to send secret data"],
  [/exfiltrat/i, "instruction contains exfiltration language"],
  [/~\/\.ssh/i, "instruction references local SSH credentials"]
];

export async function scanSecurity(root: string): Promise<SecurityScanResult> {
  const findings: Finding[] = [];
  findings.push(...(await scanSecretLikeFiles(root)));
  findings.push(...(await scanPromptInjectionText(root)));
  findings.push(...(await scanDangerousScripts(root)));
  return { findings };
}

async function scanSecretLikeFiles(root: string): Promise<Finding[]> {
  const files = await fg(SECRET_FILE_PATTERNS, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: IGNORE,
    followSymbolicLinks: false
  });
  return files
    .filter((file) => !file.endsWith(".example") && !file.includes("example"))
    .slice(0, 20)
    .map((file) => ({
      id: "secret-like-file",
      title: "Secret-like file is present in the repository",
      severity: "high" as const,
      file,
      recommendation: "Make sure this file is ignored, scrubbed from commits, and denied to coding-agent context by default."
    }));
}

async function scanPromptInjectionText(root: string): Promise<Finding[]> {
  const files = await fg(["**/*.md", "**/*.mdx", "**/*.txt", "**/*.prompt", "**/*.rules"], {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: IGNORE,
    followSymbolicLinks: false
  });
  const findings: Finding[] = [];
  for (const file of files.slice(0, 400)) {
    const text = await readTextFile(path.join(root, file));
    if (!text) continue;
    for (const [pattern, evidence] of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          id: "prompt-injection-text",
          title: "Prompt-injection-like text found",
          severity: "medium",
          file,
          evidence,
          recommendation: "Review this text before feeding it to an agent and consider isolating untrusted docs from system instructions."
        });
        break;
      }
    }
    if (findings.length >= 20) break;
  }
  return findings;
}

async function scanDangerousScripts(root: string): Promise<Finding[]> {
  const packageJsonPath = path.join(root, "package.json");
  const raw = await readTextFile(packageJsonPath);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const findings: Finding[] = [];
    for (const [name, command] of Object.entries(scripts)) {
      if (/(rm\s+-rf|del\s+\/|Remove-Item|drop\s+database|truncate\s+table|kubectl\s+delete)/i.test(command)) {
        findings.push({
          id: "dangerous-package-script",
          title: "Package script contains a destructive command",
          severity: "high",
          file: "package.json",
          evidence: `${name}: ${command}`,
          recommendation: "Require explicit confirmation before agents run this script and document safe alternatives in AGENTS.md."
        });
      }
    }
    return findings;
  } catch {
    return [];
  }
}
