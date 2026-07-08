import path from "node:path";
import fg from "fast-glob";
import { pathExists, readJsonFile, readTextFile } from "./file-utils.js";
import type { DetectedCommand, RepoProfile } from "../types.js";

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/target/**",
  "**/.venv/**",
  "**/vendor/**"
];

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".kt": "Kotlin",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".swift": "Swift"
};

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export async function profileRepository(root: string): Promise<RepoProfile> {
  const files = await fg(["**/*"], {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: IGNORE,
    followSymbolicLinks: false
  });

  const packageJson = await readJsonFile<PackageJson>(path.join(root, "package.json"));
  const packageScripts = packageJson?.scripts ?? {};
  const allDeps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {})
  };

  const languages = countLanguages(files);
  const packageManager = await detectPackageManager(root);
  const frameworks = await detectFrameworks(root, allDeps, files);
  const commands = await detectCommands(root, packageManager, packageScripts, files);
  const ciProviders = detectCiProviders(files);
  const sourceDirs = await detectDirs(root, ["src", "app", "lib", "packages", "cmd", "internal", "apps"]);
  const testDirs = await detectDirs(root, ["test", "tests", "__tests__", "spec"]);
  const importantFiles = detectImportantFiles(files);

  return {
    root,
    name: packageJson?.name ?? path.basename(root),
    packageManager,
    languages,
    frameworks,
    commands,
    importantFiles,
    sourceDirs,
    testDirs,
    ciProviders,
    packageScripts
  };
}

function countLanguages(files: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const language = EXTENSION_LANGUAGE[path.extname(file).toLowerCase()];
    if (!language) {
      continue;
    }
    counts[language] = (counts[language] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

async function detectPackageManager(root: string): Promise<string | undefined> {
  const checks: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"]
  ];
  for (const [file, manager] of checks) {
    if (await pathExists(path.join(root, file))) {
      return manager;
    }
  }
  if (await pathExists(path.join(root, "package.json"))) {
    return "npm";
  }
  return undefined;
}

async function detectFrameworks(
  root: string,
  deps: Record<string, string>,
  files: string[]
): Promise<string[]> {
  const frameworks = new Set<string>();
  const depNames = new Set(Object.keys(deps));

  const depChecks: Array<[string, string]> = [
    ["next", "Next.js"],
    ["react", "React"],
    ["vue", "Vue"],
    ["svelte", "Svelte"],
    ["vite", "Vite"],
    ["@nestjs/core", "NestJS"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["remix", "Remix"],
    ["astro", "Astro"],
    ["vitest", "Vitest"],
    ["jest", "Jest"],
    ["playwright", "Playwright"],
    ["@modelcontextprotocol/sdk", "MCP SDK"]
  ];

  for (const [dep, label] of depChecks) {
    if (depNames.has(dep)) {
      frameworks.add(label);
    }
  }

  if (files.includes("pom.xml")) {
    const pom = await readTextFile(path.join(root, "pom.xml"));
    if (pom?.includes("spring-boot")) {
      frameworks.add("Spring Boot");
    } else {
      frameworks.add("Maven");
    }
  }
  if (files.some((file) => file.endsWith("build.gradle") || file.endsWith("build.gradle.kts"))) {
    frameworks.add("Gradle");
  }
  if (files.includes("pyproject.toml") || files.includes("requirements.txt")) {
    const pythonText = [
      await readTextFile(path.join(root, "pyproject.toml")),
      await readTextFile(path.join(root, "requirements.txt"))
    ].join("\n");
    if (/django/i.test(pythonText)) frameworks.add("Django");
    if (/fastapi/i.test(pythonText)) frameworks.add("FastAPI");
    if (/flask/i.test(pythonText)) frameworks.add("Flask");
    if (/pytest/i.test(pythonText)) frameworks.add("pytest");
  }
  if (files.includes("go.mod")) frameworks.add("Go modules");
  if (files.includes("Cargo.toml")) frameworks.add("Cargo");

  return [...frameworks].sort();
}

async function detectCommands(
  root: string,
  packageManager: string | undefined,
  scripts: Record<string, string>,
  files: string[]
): Promise<DetectedCommand[]> {
  const commands: DetectedCommand[] = [];
  const run = packageManager ? packageManagerRun(packageManager) : "npm run";
  for (const name of ["test", "lint", "typecheck", "build", "dev", "start"]) {
    if (scripts[name]) {
      commands.push({ name, command: `${run} ${name}`, source: "package.json" });
    }
  }

  if (files.includes("pom.xml")) {
    commands.push({ name: "test", command: "mvn test", source: "pom.xml" });
    commands.push({ name: "build", command: "mvn package", source: "pom.xml" });
  }
  if (files.includes("gradlew")) {
    commands.push({ name: "test", command: "./gradlew test", source: "gradlew" });
    commands.push({ name: "build", command: "./gradlew build", source: "gradlew" });
  } else if (files.some((file) => file.endsWith("build.gradle") || file.endsWith("build.gradle.kts"))) {
    commands.push({ name: "test", command: "gradle test", source: "build.gradle" });
  }
  if (files.includes("pyproject.toml") || files.includes("requirements.txt")) {
    commands.push({ name: "test", command: "pytest", source: "python project files" });
  }
  if (files.includes("go.mod")) {
    commands.push({ name: "test", command: "go test ./...", source: "go.mod" });
  }
  if (files.includes("Cargo.toml")) {
    commands.push({ name: "test", command: "cargo test", source: "Cargo.toml" });
    commands.push({ name: "build", command: "cargo build", source: "Cargo.toml" });
  }

  return dedupeCommands(commands);
}

function packageManagerRun(packageManager: string): string {
  if (packageManager === "yarn") return "yarn";
  if (packageManager === "pnpm") return "pnpm";
  if (packageManager === "bun") return "bun run";
  return "npm run";
}

function detectCiProviders(files: string[]): string[] {
  const providers = new Set<string>();
  if (files.some((file) => file.startsWith(".github/workflows/"))) providers.add("GitHub Actions");
  if (files.includes(".gitlab-ci.yml")) providers.add("GitLab CI");
  if (files.includes("azure-pipelines.yml")) providers.add("Azure Pipelines");
  if (files.includes("Jenkinsfile")) providers.add("Jenkins");
  if (files.includes(".circleci/config.yml")) providers.add("CircleCI");
  return [...providers].sort();
}

async function detectDirs(root: string, candidates: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(root, candidate))) {
      found.push(candidate);
    }
  }
  return found;
}

function detectImportantFiles(files: string[]): string[] {
  const exact = new Set([
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursor/rules/project.mdc",
    ".github/copilot-instructions.md",
    "package.json",
    "pyproject.toml",
    "pom.xml",
    "go.mod",
    "Cargo.toml",
    "docker-compose.yml",
    "Dockerfile"
  ]);
  return files
    .filter((file) => exact.has(file) || file.startsWith(".github/workflows/"))
    .sort()
    .slice(0, 40);
}

function dedupeCommands(commands: DetectedCommand[]): DetectedCommand[] {
  const seen = new Set<string>();
  const result: DetectedCommand[] = [];
  for (const command of commands) {
    const key = `${command.name}:${command.command}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(command);
    }
  }
  return result;
}
