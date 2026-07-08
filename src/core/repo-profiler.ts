import path from "node:path";
import fg from "fast-glob";
import { pathExists, readJsonFile, readTextFile } from "./file-utils.js";
import type { DetectedCommand, RepoProfile } from "../types.js";

const IGNORE = [
  "**/.git/**",
  "**/.worktrees/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/.gradle/**",
  "**/target/**",
  "**/.venv/**",
  "**/venv/**",
  "**/vendor/**"
];

const MAX_LANGUAGE_SAMPLE = 5_000;
const MAX_PACKAGE_MANIFESTS = 30;

const DISCOVERY_PATTERNS = [
  "README*",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/project.mdc",
  ".github/copilot-instructions.md",
  ".github/workflows/*.{yml,yaml}",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gradlew",
  "gradlew.bat",
  "pyproject.toml",
  "requirements*.txt",
  "go.mod",
  "Cargo.toml",
  "Dockerfile",
  "docker-compose.yml",
  "index.html",
  "*.html",
  "*.css",
  "*.js",
  "*.py",
  "nginx*.conf",
  "*.cron",
  "public/index.html",
  "static/index.html",
  "main.go",
  "cmd/*/main.go",
  "src/{main,index,app}.{ts,tsx,js,jsx,vue,svelte,py,go,rs,java}",
  "src/lib.rs",
  "src/main/java/**/*Application.java",
  "src/main/resources/application*.{yml,yaml,properties}",
  "{apps,packages,services,modules,frontend,backend,web,client,server,crates,cmd,internal}/*/{package.json,pom.xml,build.gradle,build.gradle.kts,pyproject.toml,requirements*.txt,go.mod,Cargo.toml,index.html}",
  "{apps,packages,services,modules,frontend,backend,web,client,server,crates,cmd,internal}/*/src/{main,index,app}.{ts,tsx,js,jsx,vue,svelte,py,go,rs,java}"
];

const LANGUAGE_SAMPLE_PATTERNS = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java,kt,go,rs,rb,php,cs,cpp,c,swift,html,css,vue,svelte}"
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
  ".swift": "Swift",
  ".html": "HTML",
  ".css": "CSS",
  ".vue": "Vue",
  ".svelte": "Svelte"
};

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export async function profileRepository(root: string): Promise<RepoProfile> {
  const discoveryFiles = await collectDiscoveryFiles(root);
  const languageSample = await collectFileSample(root, LANGUAGE_SAMPLE_PATTERNS, MAX_LANGUAGE_SAMPLE);
  const files = mergeFiles(discoveryFiles, languageSample);
  const packageJsons = await readPackageJsons(root, files);
  const rootPackageJson = packageJsons.get("package.json");
  const packageScripts = rootPackageJson?.scripts ?? {};
  const allDeps = collectDependencies(packageJsons);

  const languages = countLanguages(files);
  const packageManager = await detectPackageManager(root);
  const frameworks = await detectFrameworks(root, allDeps, files);
  const commands = await detectCommands(root, packageManager, packageJsons, files);
  const ciProviders = detectCiProviders(files);
  const sourceDirs = await detectDirs(root, ["src", "app", "lib", "packages", "cmd", "internal", "apps", "public", "assets", "static", "frontend", "backend", "web", "client", "server"]);
  const testDirs = await detectDirs(root, ["test", "tests", "__tests__", "spec"]);
  const entrypoints = await detectEntrypoints(root, files);
  const importantFiles = detectImportantFiles(files);

  return {
    root,
    name: rootPackageJson?.name ?? path.basename(root),
    packageManager,
    languages,
    frameworks,
    commands,
    entrypoints,
    importantFiles,
    sourceDirs,
    testDirs,
    ciProviders,
    packageScripts,
    scanStrategy: {
      mode: "tiered-fingerprint",
      sampledFiles: languageSample.length,
      maxSampledFiles: MAX_LANGUAGE_SAMPLE,
      manifestFiles: detectManifestFiles(files),
      entrypointFiles: entrypoints,
      notes: buildScanNotes(languageSample.length, files)
    }
  };
}

async function collectDiscoveryFiles(root: string): Promise<string[]> {
  const files = await fg(DISCOVERY_PATTERNS, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    unique: true,
    ignore: IGNORE,
    followSymbolicLinks: false
  });
  return files.map(normalizeFile);
}

async function collectFileSample(root: string, patterns: string[], maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const stream = fg.stream(patterns, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    unique: true,
    ignore: IGNORE,
    followSymbolicLinks: false
  }) as NodeJS.ReadableStream & AsyncIterable<string | Buffer> & { destroy: () => void };

  for await (const entry of stream) {
    files.push(normalizeFile(String(entry)));
    if (files.length >= maxFiles) {
      stream.destroy();
      break;
    }
  }

  return files;
}

function mergeFiles(...groups: string[][]): string[] {
  return [...new Set(groups.flat().map(normalizeFile))].sort();
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, "/");
}

async function readPackageJsons(root: string, files: string[]): Promise<Map<string, PackageJson>> {
  const manifests = files.filter(isPackageJson).sort(byDepthThenName).slice(0, MAX_PACKAGE_MANIFESTS);
  const result = new Map<string, PackageJson>();
  for (const manifest of manifests) {
    const packageJson = await readJsonFile<PackageJson>(path.join(root, manifest));
    if (packageJson) {
      result.set(manifest, packageJson);
    }
  }
  return result;
}

function collectDependencies(packageJsons: Map<string, PackageJson>): Record<string, string> {
  const deps: Record<string, string> = {};
  for (const packageJson of packageJsons.values()) {
    Object.assign(
      deps,
      packageJson.dependencies ?? {},
      packageJson.devDependencies ?? {},
      packageJson.peerDependencies ?? {}
    );
  }
  return deps;
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

  const pomFiles = files.filter((file) => file.endsWith("pom.xml"));
  if (pomFiles.length) {
    const pomText = (await Promise.all(pomFiles.slice(0, 5).map((file) => readTextFile(path.join(root, file))))).join("\n");
    if (pomText.includes("spring-boot")) {
      frameworks.add("Spring Boot");
    } else {
      frameworks.add("Maven");
    }
  }
  if (files.some((file) => file.endsWith("build.gradle") || file.endsWith("build.gradle.kts"))) {
    frameworks.add("Gradle");
  }

  const pythonManifestFiles = files.filter((file) => file.endsWith("pyproject.toml") || path.basename(file).startsWith("requirements")).slice(0, 10);
  if (pythonManifestFiles.length) {
    const pythonText = (await Promise.all(pythonManifestFiles.map((file) => readTextFile(path.join(root, file))))).join("\n");
    if (/django/i.test(pythonText)) frameworks.add("Django");
    if (/fastapi/i.test(pythonText)) frameworks.add("FastAPI");
    if (/flask/i.test(pythonText)) frameworks.add("Flask");
    if (/pytest/i.test(pythonText)) frameworks.add("pytest");
  }

  if (files.some((file) => file.endsWith("go.mod"))) frameworks.add("Go modules");
  if (files.some((file) => file.endsWith("Cargo.toml"))) frameworks.add("Cargo");
  if (isStaticHtmlSite(files)) frameworks.add("Static HTML site");

  return [...frameworks].sort();
}

async function detectCommands(
  root: string,
  packageManager: string | undefined,
  packageJsons: Map<string, PackageJson>,
  files: string[]
): Promise<DetectedCommand[]> {
  const commands: DetectedCommand[] = [];
  commands.push(...detectPackageCommands(packageManager, packageJsons));

  for (const pom of files.filter((file) => file.endsWith("pom.xml")).sort(byDepthThenName).slice(0, 3)) {
    const suffix = pom === "pom.xml" ? "" : ` -f ${pom}`;
    commands.push({ name: "test", command: `mvn${suffix} test`, source: pom });
    commands.push({ name: "build", command: `mvn${suffix} package`, source: pom });
  }

  if (files.includes("gradlew")) {
    commands.push({ name: "test", command: "./gradlew test", source: "gradlew" });
    commands.push({ name: "build", command: "./gradlew build", source: "gradlew" });
  } else if (files.some((file) => file.endsWith("build.gradle") || file.endsWith("build.gradle.kts"))) {
    commands.push({ name: "test", command: "gradle test", source: "build.gradle" });
  }

  for (const manifest of files.filter((file) => file.endsWith("pyproject.toml") || path.basename(file).startsWith("requirements")).sort(byDepthThenName).slice(0, 2)) {
    commands.push({ name: "test", command: commandInDir(path.posix.dirname(manifest), "pytest"), source: manifest });
  }

  for (const goMod of files.filter((file) => file.endsWith("go.mod")).sort(byDepthThenName).slice(0, 3)) {
    commands.push({ name: "test", command: commandInDir(path.posix.dirname(goMod), "go test ./..."), source: goMod });
  }

  for (const cargoToml of files.filter((file) => file.endsWith("Cargo.toml")).sort(byDepthThenName).slice(0, 3)) {
    if (cargoToml === "Cargo.toml") {
      commands.push({ name: "test", command: "cargo test", source: cargoToml });
      commands.push({ name: "build", command: "cargo build", source: cargoToml });
    } else {
      commands.push({ name: "test", command: `cargo test --manifest-path ${cargoToml}`, source: cargoToml });
      commands.push({ name: "build", command: `cargo build --manifest-path ${cargoToml}`, source: cargoToml });
    }
  }

  return dedupeCommands(commands).slice(0, 20);
}

function detectPackageCommands(packageManager: string | undefined, packageJsons: Map<string, PackageJson>): DetectedCommand[] {
  const commands: DetectedCommand[] = [];
  const manifests = [...packageJsons.entries()].sort(([left], [right]) => byDepthThenName(left, right));
  for (const [manifest, packageJson] of manifests) {
    const scripts = packageJson.scripts ?? {};
    const dir = path.posix.dirname(manifest);
    const run = packageManager ? packageManagerRun(packageManager) : "npm run";
    for (const name of ["test", "lint", "typecheck", "build", "dev", "start"]) {
      if (!scripts[name]) {
        continue;
      }
      commands.push({
        name,
        command: dir === "." ? `${run} ${name}` : packageCommandInDir(packageManager, dir, name),
        source: manifest
      });
    }
  }
  return commands;
}

function packageCommandInDir(packageManager: string | undefined, dir: string, scriptName: string): string {
  if (packageManager === "pnpm") return `pnpm --dir ${dir} ${scriptName}`;
  if (packageManager === "yarn") return `cd ${dir} && yarn ${scriptName}`;
  if (packageManager === "bun") return `cd ${dir} && bun run ${scriptName}`;
  return `cd ${dir} && npm run ${scriptName}`;
}

function packageManagerRun(packageManager: string): string {
  if (packageManager === "yarn") return "yarn";
  if (packageManager === "pnpm") return "pnpm";
  if (packageManager === "bun") return "bun run";
  return "npm run";
}

function commandInDir(dir: string, command: string): string {
  return dir === "." ? command : `cd ${dir} && ${command}`;
}

function detectCiProviders(files: string[]): string[] {
  const providers = new Set<string>();
  if (files.some((file) => file.startsWith(".github/workflows/") || file.includes("/.github/workflows/"))) providers.add("GitHub Actions");
  if (files.some((file) => file.endsWith(".gitlab-ci.yml"))) providers.add("GitLab CI");
  if (files.some((file) => file.endsWith("azure-pipelines.yml"))) providers.add("Azure Pipelines");
  if (files.some((file) => path.basename(file) === "Jenkinsfile")) providers.add("Jenkins");
  if (files.some((file) => file.endsWith(".circleci/config.yml"))) providers.add("CircleCI");
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

async function detectEntrypoints(root: string, files: string[]): Promise<string[]> {
  const entrypoints = files
    .filter((file) => {
      const base = path.basename(file);
      const segments = file.split("/");
      if (base === "index.html") return true;
      if (segments.length === 1 && /\.(py|go)$/.test(base)) return true;
      if (/^(main|app|manage)\.py$/.test(base)) return true;
      if (file === "src/main.ts" || file === "src/main.tsx" || file === "src/main.js" || file === "src/main.jsx") return true;
      if (file === "src/app.vue" || file === "src/App.vue" || file === "src/app.svelte" || file === "src/App.svelte") return true;
      if (file === "src/main.rs" || file === "src/lib.rs") return true;
      if (file === "main.go" || /^cmd\/[^/]+\/main\.go$/.test(file)) return true;
      if (/^application.*\.(yml|yaml|properties)$/.test(base)) return true;
      if (/^nginx.*\.conf$/.test(base)) return true;
      if (base.endsWith(".cron")) return true;
      return false;
    })
    .sort(byEntrypointPriority);

  const javaEntrypoints = await detectJavaEntrypoints(root, files);
  return [...new Set([...entrypoints, ...javaEntrypoints])]
    .sort(byEntrypointPriority)
    .slice(0, 30);
}

async function detectJavaEntrypoints(root: string, files: string[]): Promise<string[]> {
  const candidates = files
    .filter((file) => file.endsWith("Application.java"))
    .sort(byDepthThenName)
    .slice(0, 20);
  const entrypoints: string[] = [];
  for (const candidate of candidates) {
    const content = await readTextFile(path.join(root, candidate));
    if (content?.includes("@SpringBootApplication") || content?.includes("public static void main")) {
      entrypoints.push(candidate);
    }
  }
  return entrypoints;
}

function detectImportantFiles(files: string[]): string[] {
  const exact = new Set([
    "README.md",
    "README",
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
    "Dockerfile",
    "index.html",
    "styles.css",
    "style.css",
    "script.js",
    "main.js"
  ]);
  return files
    .filter((file) => exact.has(file) || file.startsWith(".github/workflows/") || isRootStaticAsset(file) || /^nginx.*\.conf$/.test(path.basename(file)) || path.basename(file).endsWith(".cron"))
    .sort(byImportantFilePriority)
    .slice(0, 40);
}

function detectManifestFiles(files: string[]): string[] {
  return files
    .filter((file) => isPackageJson(file) || ["pom.xml", "build.gradle", "build.gradle.kts", "pyproject.toml", "go.mod", "Cargo.toml"].some((name) => file.endsWith(name)) || path.basename(file).startsWith("requirements"))
    .sort(byDepthThenName)
    .slice(0, 40);
}

function buildScanNotes(sampledFiles: number, files: string[]): string[] {
  const notes = ["Checked high-signal manifests and entrypoints before language sampling."];
  if (sampledFiles >= MAX_LANGUAGE_SAMPLE) {
    notes.push(`Language counts are capped at ${MAX_LANGUAGE_SAMPLE} files to keep large repositories responsive.`);
  }
  if (isStaticHtmlSite(files)) {
    notes.push("Detected a static HTML site from index.html and browser assets without requiring package.json.");
  }
  return notes;
}

function isStaticHtmlSite(files: string[]): boolean {
  const hasHtmlEntry = files.includes("index.html") || files.some((file) => file.endsWith("/index.html"));
  const hasPackageJson = files.some(isPackageJson);
  return hasHtmlEntry && !hasPackageJson;
}

function isPackageJson(file: string): boolean {
  return file === "package.json" || file.endsWith("/package.json");
}

function isRootStaticAsset(file: string): boolean {
  if (file.includes("/")) {
    return false;
  }
  const extension = path.extname(file).toLowerCase();
  return [".html", ".css", ".js", ".mjs", ".py"].includes(extension);
}

function byDepthThenName(left: string, right: string): number {
  return depth(left) - depth(right) || left.localeCompare(right);
}

function byEntrypointPriority(left: string, right: string): number {
  return entrypointRank(left) - entrypointRank(right) || byDepthThenName(left, right);
}

function byImportantFilePriority(left: string, right: string): number {
  return importantRank(left) - importantRank(right) || byDepthThenName(left, right);
}

function depth(file: string): number {
  return file.split("/").length;
}

function entrypointRank(file: string): number {
  const base = path.basename(file);
  if (base === "index.html") return 0;
  if (/^nginx.*\.conf$/.test(base)) return 1;
  if (base.endsWith(".cron")) return 2;
  if (/^(main|index|app)\./.test(base)) return 3;
  if (/Application\.java$/.test(base)) return 3;
  if (/^application/.test(base)) return 4;
  return 9;
}

function importantRank(file: string): number {
  const ranks = new Map<string, number>([
    ["README.md", 0],
    ["README", 0],
    ["AGENTS.md", 1],
    ["CLAUDE.md", 2],
    ["package.json", 3],
    ["pyproject.toml", 3],
    ["pom.xml", 3],
    ["go.mod", 3],
    ["Cargo.toml", 3],
    ["index.html", 4],
    ["styles.css", 5],
    ["style.css", 5],
    ["script.js", 6],
    ["main.js", 6],
    ["Dockerfile", 7],
    ["docker-compose.yml", 7]
  ]);
  return ranks.get(file) ?? (file.startsWith(".github/workflows/") ? 8 : 9);
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
