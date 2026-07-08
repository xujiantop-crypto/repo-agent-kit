import path from "node:path";
import { scanRepository } from "../core/scanner.js";
import { writeTextFile } from "../core/file-utils.js";
import { renderConsoleReport } from "../reporters/console.js";
import { renderMarkdownReport } from "../reporters/markdown.js";

export async function runScan(
  targetPath: string,
  options: { json?: boolean; output?: string }
): Promise<void> {
  const result = await scanRepository({ root: targetPath });
  const payload = options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderConsoleReport(result)}\n`;
  process.stdout.write(payload);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    const output = options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdownReport(result);
    await writeTextFile(outputPath, output);
  }
}
