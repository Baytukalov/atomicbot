import React from "react";
import Markdown from "react-markdown";
import { getDesktopApi } from "@ipc/desktopApi";
import { openExternal } from "@shared/utils/openExternal";
import type { ClawHubFileEntry } from "./useClawHubSkills";
import { getFileExt, getExtColor, formatFileSize, isTextFile, clawhubFileUrl } from "./clawhub-formatters";
import type { FileTreeDir } from "./clawhub-formatters";
import s from "./ClawHubDetailPage.module.css";

export function FileRow({ file, slug }: { file: ClawHubFileEntry; slug: string }) {
  const ext = getFileExt(file.path);
  const fileName = file.path.includes("/")
    ? file.path.slice(file.path.lastIndexOf("/") + 1)
    : file.path;
  const canExpand = isTextFile(file);
  const isMd = ext === "md" || ext === "mdx";

  const [expanded, setExpanded] = React.useState(false);
  const [content, setContent] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(false);

  const handleToggle = React.useCallback(() => {
    if (!canExpand) {
      openExternal(clawhubFileUrl(slug, file.path));
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (content !== null) return;
    setFetching(true);
    getDesktopApi()
      .clawhubGetSkillFile({ slug, path: file.path })
      .then((r) => {
        if (r.ok && r.content) setContent(r.content);
        else setContent("(failed to load)");
      })
      .catch(() => setContent("(failed to load)"))
      .finally(() => setFetching(false));
  }, [canExpand, expanded, content, slug, file.path]);

  const handleOpenExternal = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openExternal(clawhubFileUrl(slug, file.path));
    },
    [slug, file.path]
  );

  return (
    <div className={s.UiFileEntry}>
      <button
        type="button"
        className={s.UiFileRow}
        onClick={handleToggle}
        title={canExpand ? "Click to preview" : "Open on ClawHub"}
      >
        {canExpand ? (
          <span className={`${s.UiFileChevron} ${expanded ? s.UiFileChevronOpen : ""}`}>▸</span>
        ) : null}
        <span className={s.UiFileIcon} style={{ background: getExtColor(ext) }} />
        <span className={s.UiFileName}>{fileName}</span>
        <span className={s.UiFileMeta}>
          {ext ? <span className={s.UiFileExt}>.{ext}</span> : null}
          <span className={s.UiFileSize}>{formatFileSize(file.size)}</span>
        </span>
        <span
          className={s.UiFileLinkIcon}
          role="button"
          tabIndex={0}
          aria-label="Open on ClawHub"
          onClick={handleOpenExternal}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleOpenExternal(e as unknown as React.MouseEvent);
          }}
        >
          ↗
        </span>
      </button>
      {expanded ? (
        <div className={s.UiFileContent}>
          {fetching ? (
            <span className={s.UiFileContentLoading}>Loading…</span>
          ) : content !== null && isMd ? (
            <div className={`UiMarkdown ${s.UiFileContentMd}`}>
              <Markdown>{content}</Markdown>
            </div>
          ) : content !== null ? (
            <pre className={s.UiFileContentPre}>{content}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DirGroup({
  dir,
  slug,
  defaultOpen,
}: {
  dir: FileTreeDir;
  slug: string;
  defaultOpen: boolean;
}) {
  return (
    <details className={s.UiFileDirGroup} open={defaultOpen}>
      <summary className={s.UiFileDirHeader}>
        <span className={s.UiFileDirChevron}>▸</span>
        <span className={s.UiFileDirIcon}>📁</span>
        <span className={s.UiFileDirName}>{dir.name}/</span>
        <span className={s.UiFileDirCount}>{dir.files.length}</span>
      </summary>
      <div className={s.UiFileDirChildren}>
        {dir.files.map((f) => (
          <FileRow key={f.path} file={f} slug={slug} />
        ))}
      </div>
    </details>
  );
}
