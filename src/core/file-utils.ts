import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function readTextFile(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

export async function writeTextFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}
