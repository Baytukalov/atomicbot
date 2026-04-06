import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { CheckboxRow, SelectDropdown, TextInput } from "@shared/kit";
import { addToast, addToastError } from "@shared/toast";
import { routes } from "@ui/app/routes";
import { useClawHubSkills } from "./useClawHubSkills";
import type { ClawHubSortField } from "./useClawHubSkills";
import { ClawHubGrid } from "./ClawHubGrid";
import type { GatewayRpc } from "../skillDefinitions";
import { BUILTIN_SKILL_IDS } from "../skillDefinitions";
import { installSkillWithRetry } from "./install-with-retry";

const VALID_SORT_FIELDS = new Set<ClawHubSortField>([
  "downloads",
  "stars",
  "installs",
  "updated",
  "newest",
  "name",
]);

type SkillActionKind = "install" | "remove" | null;

const SORT_OPTIONS: Array<{ value: ClawHubSortField; label: string }> = [
  { value: "downloads", label: "Downloads" },
  { value: "stars", label: "Stars" },
  { value: "installs", label: "Installs" },
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
];

export function ClawHubTab(props: {
  gw: GatewayRpc;
  installedSkillDirs: string[];
  onInstalledSkillsChanged: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSort = searchParams.get("sort") as ClawHubSortField | null;
  const initialQuery = searchParams.get("q") ?? "";
  const initialSafe = searchParams.get("safe") !== "0";

  const {
    skills,
    loading,
    loadingMore,
    error,
    searchQuery,
    setSearchQuery: setSearchQueryRaw,
    hideSuspicious,
    setHideSuspicious: setHideSuspiciousRaw,
    sortField,
    setSortField: setSortFieldRaw,
    hasMore,
    loadMore,
  } = useClawHubSkills({
    query: initialQuery,
    sort: initialSort && VALID_SORT_FIELDS.has(initialSort) ? initialSort : undefined,
    hideSuspicious: initialSafe,
  });

  const syncParams = React.useCallback(
    (q: string, sort: ClawHubSortField, safe: boolean) => {
      const next = new URLSearchParams();
      if (q) next.set("q", q);
      if (sort !== "downloads") next.set("sort", sort);
      if (!safe) next.set("safe", "0");
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const setSearchQuery = React.useCallback(
    (q: string) => {
      setSearchQueryRaw(q);
      syncParams(q, sortField, hideSuspicious);
    },
    [setSearchQueryRaw, syncParams, sortField, hideSuspicious]
  );

  const setSortField = React.useCallback(
    (sort: ClawHubSortField) => {
      setSortFieldRaw(sort);
      syncParams(searchQuery, sort, hideSuspicious);
    },
    [setSortFieldRaw, syncParams, searchQuery, hideSuspicious]
  );

  const setHideSuspicious = React.useCallback(
    (safe: boolean) => {
      setHideSuspiciousRaw(safe);
      syncParams(searchQuery, sortField, safe);
    },
    [setHideSuspiciousRaw, syncParams, searchQuery, sortField]
  );

  const [actionSlug, setActionSlug] = React.useState<string | null>(null);
  const [actionKind, setActionKind] = React.useState<SkillActionKind>(null);

  const handleInstall = React.useCallback(
    async (slug: string) => {
      setActionSlug(slug);
      setActionKind("install");
      try {
        await installSkillWithRetry(props.gw, slug);
        addToast(`Installed "${slug}" from ClawHub`);
        await props.onInstalledSkillsChanged();
      } catch (err) {
        const msg = err instanceof Error ? err.message : err && typeof err === "object" && "message" in err ? String((err as Record<string, unknown>).message) : null;
        addToastError(msg || `Failed to install "${slug}"`);
      } finally {
        setActionSlug(null);
        setActionKind(null);
      }
    },
    [props]
  );

  const handleRemove = React.useCallback(
    async (slug: string) => {
      const api = getDesktopApiOrNull();
      if (!api?.removeCustomSkill) {
        addToastError("Remove skill is not available in this build");
        return;
      }
      setActionSlug(slug);
      setActionKind("remove");
      try {
        const result = await api.removeCustomSkill(slug);
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to remove "${slug}"`);
        }
        addToast(`Removed "${slug}"`);
        await props.onInstalledSkillsChanged();
      } catch (err) {
        addToastError(err instanceof Error ? err.message : `Failed to remove "${slug}"`);
      } finally {
        setActionSlug(null);
        setActionKind(null);
      }
    },
    [props]
  );

  const installedSlugs = React.useMemo(
    () => new Set(props.installedSkillDirs),
    [props.installedSkillDirs]
  );

  const handleOpenDetails = React.useCallback(
    (slug: string) => {
      navigate(`${routes.clawhubDetail}/${slug}`);
    },
    [navigate]
  );

  const filteredSkills = React.useMemo(
    () => skills.filter((sk) => !BUILTIN_SKILL_IDS.has(sk.slug)),
    [skills]
  );

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 220px",
          gap: 12,
          alignItems: "end",
          marginBottom: 12,
        }}
      >
        <div className="UiInputRow" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 6 }}>Filter</div>
          <TextInput
            type="text"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search ClawHub skills…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            isSearch={true}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 6 }}>Sort</div>
          <SelectDropdown<ClawHubSortField>
            value={sortField}
            onChange={setSortField}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <CheckboxRow checked={hideSuspicious} onChange={setHideSuspicious}>
          Hide suspicious
        </CheckboxRow>
      </div>

      <ClawHubGrid
        skills={filteredSkills}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        actionSlug={actionSlug}
        actionKind={actionKind}
        installedSlugs={installedSlugs}
        hasMore={hasMore}
        onInstall={(slug) => void handleInstall(slug)}
        onRemove={(slug) => void handleRemove(slug)}
        onOpenDetails={handleOpenDetails}
        onLoadMore={loadMore}
        emptyStateText="No ClawHub packages match the current filters"
        emptyStateSubtext="Try clearing filters or changing the search query."
      />
    </>
  );
}
