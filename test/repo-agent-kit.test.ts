import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectMcp } from "../src/core/mcp-inspector.js";
import { profileRepository } from "../src/core/repo-profiler.js";
import { scanRepository } from "../src/core/scanner.js";
import { buildSmokeBench } from "../src/core/smoke-bench.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-agent-kit-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

describe("repo profiler", () => {
  it("detects TypeScript projects, frameworks, commands, and CI", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "demo",
        scripts: {
          test: "vitest run",
          build: "tsc -p tsconfig.json",
          lint: "eslint ."
        },
        dependencies: {
          next: "latest",
          react: "latest"
        },
        devDependencies: {
          vitest: "latest"
        }
      })
    );
    await write("pnpm-lock.yaml", "");
    await write("src/index.ts", "export const value = 1;\n");
    await write(".github/workflows/ci.yml", "name: ci\n");

    const profile = await profileRepository(tempDir);

    expect(profile.name).toBe("demo");
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.frameworks).toContain("Next.js");
    expect(profile.frameworks).toContain("React");
    expect(profile.frameworks).toContain("Vitest");
    expect(profile.commands.map((command) => command.name)).toEqual(expect.arrayContaining(["test", "build", "lint"]));
    expect(profile.ciProviders).toContain("GitHub Actions");
  });

  it("detects static HTML sites without package manifests", async () => {
    await write("README.md", "# Tetris\n");
    await write("index.html", "<!doctype html><script src=\"tetris.js\"></script><link rel=\"stylesheet\" href=\"styles.css\">\n");
    await write("styles.css", "body { margin: 0; }\n");
    await write("tetris.js", "console.log('play');\n");

    const profile = await profileRepository(tempDir);

    expect(profile.languages).toMatchObject({
      HTML: 1,
      CSS: 1,
      JavaScript: 1
    });
    expect(profile.frameworks).toContain("Static HTML site");
    expect(profile.entrypoints).toContain("index.html");
    expect(profile.importantFiles).toEqual(expect.arrayContaining(["README.md", "index.html", "styles.css", "tetris.js"]));
    expect(profile.scanStrategy?.mode).toBe("tiered-fingerprint");
    expect(profile.scanStrategy?.notes.join("\n")).toContain("static HTML site");
  });

  it("does not treat docs index pages as static site roots", async () => {
    await write("pyproject.toml", "[project]\nname = \"docs-demo\"\n");
    await write("docs/index.html", "<!doctype html><title>Docs</title>\n");
    await write("src/demo.py", "print('hello')\n");

    const profile = await profileRepository(tempDir);

    expect(profile.frameworks).not.toContain("Static HTML site");
    expect(profile.entrypoints).not.toContain("docs/index.html");
  });

  it("uses nested package managers and keeps nested manifests important", async () => {
    await write(
      "apps/web/package.json",
      JSON.stringify({
        scripts: {
          build: "vite build"
        },
        dependencies: {
          vite: "latest"
        }
      })
    );
    await write("apps/web/pnpm-lock.yaml", "");
    await write("apps/web/index.html", "<!doctype html>\n");
    await write("apps/web/src/main.ts", "console.log('web');\n");

    const profile = await profileRepository(tempDir);

    expect(profile.frameworks).toContain("Vite");
    expect(profile.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "build",
          command: "pnpm --dir apps/web build",
          source: "apps/web/package.json"
        })
      ])
    );
    expect(profile.importantFiles).toContain("apps/web/package.json");
  });

  it("preserves actual entrypoint casing for frontend app files", async () => {
    await write(
      "package.json",
      JSON.stringify({
        dependencies: {
          vue: "latest",
          vite: "latest"
        }
      })
    );
    await write("index.html", "<!doctype html>\n");
    await write("src/App.vue", "<template>Hello</template>\n");
    await write("src/main.ts", "import './App.vue';\n");

    const profile = await profileRepository(tempDir);

    expect(profile.entrypoints).toContain("src/App.vue");
    expect(profile.entrypoints).not.toContain("src/app.vue");
  });
});

describe("mcp inspector", () => {
  it("flags package-exec, shell, filesystem, and secret env risks", async () => {
    await write(
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          dangerous: {
            command: "npx",
            args: ["-y", "shell-filesystem-mcp"],
            env: {
              API_TOKEN: "redacted"
            }
          }
        }
      })
    );

    const result = await inspectMcp(tempDir);

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]?.riskTags).toEqual(expect.arrayContaining(["package-exec", "shell", "filesystem", "secrets"]));
    expect(result.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["mcp-stdio-package-exec", "mcp-shell-tool", "mcp-filesystem-tool", "mcp-secret-env"])
    );
  });
});

describe("scanner and generators", () => {
  it("builds a readiness scan and generated artifacts", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "demo",
        scripts: {
          test: "vitest run",
          build: "tsc -p tsconfig.json"
        }
      })
    );
    await write("src/index.ts", "export const value = 1;\n");

    const result = await scanRepository({ root: tempDir });

    expect(result.score.total).toBeGreaterThan(0);
    expect(result.generated.agentsMd).toContain("Agent Instructions");
    expect(result.generated.cursorRule).toContain("Project Rules");
    expect(result.generated.contextMap).toContain("Agent Context Map");
    expect(result.generated.githubAction).toContain("repo-agent-kit scan");
  });

  it("runs smoke bench without invoking an LLM", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "demo",
        scripts: {
          test: "vitest run"
        }
      })
    );

    const scan = await scanRepository({ root: tempDir });
    const bench = buildSmokeBench(scan);

    expect(bench.tasks.map((task) => task.id)).toContain("test-command");
    expect(bench.overall).toMatch(/pass|warn|fail/);
  });
});
