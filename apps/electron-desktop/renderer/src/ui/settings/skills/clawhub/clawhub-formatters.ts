import type { ClawHubFileEntry } from "./useClawHubSkills";

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatDate(timestamp: number) {
  if (!timestamp) return "Unknown";
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

export function formatIsoDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return null;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Extension → color for the file type dot indicator
export const EXT_COLORS: Record<string, string> = {
  md: "#519aba",
  mdx: "#519aba",
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f1e05a",
  jsx: "#f1e05a",
  mjs: "#f1e05a",
  json: "#e8a427",
  sh: "#89e051",
  bash: "#89e051",
  css: "#563d7c",
  html: "#e34c26",
  yaml: "#cb171e",
  yml: "#cb171e",
  toml: "#9c4221",
  py: "#3572a5",
  txt: "#9da5b4",
};

export function getFileExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? path.slice(dot + 1).toLowerCase() : "";
}

export function getExtColor(ext: string): string {
  return EXT_COLORS[ext] ?? "#9da5b4";
}

export type FileTreeDir = {
  name: string;
  files: ClawHubFileEntry[];
};

export function groupFilesByDir(files: ClawHubFileEntry[]): {
  rootFiles: ClawHubFileEntry[];
  dirs: FileTreeDir[];
} {
  const dirMap = new Map<string, ClawHubFileEntry[]>();
  const rootFiles: ClawHubFileEntry[] = [];

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf("/");
    if (lastSlash === -1) {
      rootFiles.push(file);
    } else {
      const dir = file.path.slice(0, lastSlash);
      const existing = dirMap.get(dir);
      if (existing) {
        existing.push(file);
      } else {
        dirMap.set(dir, [file]);
      }
    }
  }

  const dirs: FileTreeDir[] = [];
  for (const [name, dirFiles] of dirMap) {
    dirs.push({ name, files: dirFiles });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  return { rootFiles, dirs };
}

export function clawhubFileUrl(slug: string, filePath: string): string {
  return `https://clawhub.com/skill/${encodeURIComponent(slug)}?file=${encodeURIComponent(filePath)}`;
}

export const TEXT_CONTENT_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/x-shellscript",
  "text/javascript",
  "text/typescript",
  "text/html",
  "text/css",
  "application/json",
  "application/x-yaml",
]);

export function isTextFile(file: ClawHubFileEntry): boolean {
  if (file.contentType && TEXT_CONTENT_TYPES.has(file.contentType)) return true;
  const ext = getFileExt(file.path);
  return [
    "md",
    "mdx",
    "txt",
    "sh",
    "bash",
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "json",
    "yaml",
    "yml",
    "toml",
    "css",
    "html",
    "py",
    "rb",
    "rs",
  ].includes(ext);
}
