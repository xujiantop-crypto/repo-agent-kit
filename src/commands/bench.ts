import pc from "picocolors";
import { scanRepository } from "../core/scanner.js";
import { buildSmokeBench } from "../core/smoke-bench.js";

export async function runBench(targetPath: string, options: { json?: boolean }): Promise<void> {
  const scan = await scanRepository({ root: targetPath });
  const bench = buildSmokeBench(scan);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(bench, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${pc.bold("Agent Smoke Bench")}: ${colorStatus(bench.overall)}\n\n`);
  for (const task of bench.tasks) {
    process.stdout.write(`${colorStatus(task.status)} ${task.title}\n`);
    process.stdout.write(`  ${pc.dim(task.detail)}\n`);
  }
}

function colorStatus(status: string): string {
  if (status === "pass") return pc.green("pass");
  if (status === "warn") return pc.yellow("warn");
  return pc.red("fail");
}
