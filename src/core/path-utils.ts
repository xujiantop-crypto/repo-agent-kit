import path from "node:path";

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function relativePath(root: string, file: string): string {
  return toPosixPath(path.relative(root, file));
}

export function normalizeRoot(root: string): string {
  return path.resolve(root);
}
