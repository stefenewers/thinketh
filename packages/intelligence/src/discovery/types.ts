/** Discovery run records (persisted in the doc store, collection "discovery_runs"). */

export type FilterReason =
  /** The same item (canonical URL) was already processed by an earlier run, or appeared twice. */
  | "duplicate"
  /** Not about the covered domain (AI agents / LLM systems) closely enough. */
  | "low_signal"
  /** Published before the discovery window. */
  | "outdated"
  /** No publication date: Thinketh won't guess when something happened. */
  | "undated"
  /** Normalization produced no checkable claims, or the text couldn't be read. */
  | "low_confidence"
  /** Relevant, but past this run's cost bound; eligible again next run. */
  | "over_budget";

export type SourceRunResult = {
  sourceId: string;
  name: string;
  url: string;
  fetched: number;
  /** Why this source failed this run (the rest of the run continues). */
  error?: string;
  ms: number;
};

export type FilteredItem = { url: string; title: string; sourceId: string; reason: FilterReason; detail?: string };

export type DiscoveryRunRecord = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "succeeded" | "partial" | "failed";
  trigger: "cli" | "schedule" | "admin" | "test";
  sources: Array<{ sourceId: string; name: string; url: string; fetched: number; error?: string; ms: number }>;
  /** Source items read this run (after the per-source cap). */
  itemsInspected: number;
  filtered: Partial<Record<FilterReason, number>>;
  /** A sample of filtered items with their reason (bounded), for tracing. */
  filteredItems: FilteredItem[];
  /** Groups of overlapping items that became one development each. */
  groups: Array<{ developmentId?: string; itemUrls: string[]; title: string }>;
  developmentIds: string[];
  /** Normalizations Claude wrote vs. the deterministic fallback. */
  normalizedBy: { claude: number; deterministic: number };
  error?: string;
};
