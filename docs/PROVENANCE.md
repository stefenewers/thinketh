# Source provenance audit (2026-09-26)

Every source visible in the demo was checked. Before this pass, all 13 backend sources were placeholders with "(demo)" publishers and no links. The mock sources (the app's offline fallback) were worse: invented titles credited to real organizations (Anthropic, Google DeepMind, OpenAI, Meta AI, The Gradient), linking to those sites' home pages.

**Rule applied:** a source was replaced with a real one only where a real page genuinely supports the claim that cites it. Each real page was fetched on 2026-09-26 to confirm its title, publisher and URL. A date is shown only where the page states one (for example, arXiv submission dates); otherwise it's left blank rather than guessed. Anything without a real supporting source stays marked "(demo)", with no link and no real organization's name.

## Backend seed (`packages/intelligence/src/seed/corpus.ts`, also synced to MongoDB)

| Source id | Claim it backs | Real source |
|---|---|---|
| `src-memory-engineering-post` | Agents write facts to a persistent store and recall them in later sessions | Anthropic, *Managing context on the Claude Developer Platform*: https://claude.com/blog/context-management |
| `src-memory-paper` | Consolidating memories at write time beats storing raw transcripts | *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory*, arXiv 2504.19413 (2025-04-28) |
| `src-memory-repo` | Persistent memory store with scoped recall | GitHub `letta-ai/letta` |
| `src-evaluator-report` | A separate evaluator catches more errors than self-critique | *Large Language Models Cannot Self-Correct Reasoning Yet*, arXiv 2310.01798 (2023-10-03). This is **partial support**: the paper shows the limits of intrinsic self-correction, not a head-to-head evaluator comparison. |
| `src-mcp-spec-update` | Servers can pause a task to ask the user for input | MCP specification 2025-06-18, *Elicitation* |
| `src-compaction-docs` | Compaction moves into the model API | Claude Platform Docs, *Compaction overview* |
| `src-tool-reliability` | Report tool-call reliability alongside accuracy | *τ-bench*, arXiv 2406.12045 (2024-06-17), which introduces the pass^k reliability metric |
| `src-function-calling-explainer` | Function calling returns structured tool arguments | Claude Platform Docs, *Tool use with Claude* |
| `src-context-window-primer` | (not cited by a development) | Claude Platform Docs, *Context windows* |
| `src-rag-primer` | (not cited by a development) | *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*, arXiv 2005.11401 |
| `src-tool-use-guide` | (not cited by a development) | Anthropic, *Building Effective AI Agents* |

### Flagged: no real source found that supports the claim

| Source id | Claim | Status |
|---|---|---|
| `src-memory-critique` | "Persistent memory can entrench mistakes" (challenges) | Still "(demo)", no link. Replace it if you find a real evaluation of memory error entrenchment. |
| `src-memory-vs-rag-benchmark` | "Retrieval scores don't predict multi-session memory performance" | Still "(demo)", no link. LongMemEval (arXiv 2410.10813) benchmarks long-term memory but doesn't make this exact claim, so it wasn't attached. |

Development dates (`happenedAt`) and significance scores remain part of the seeded demo scenario. They describe the demo's "today", not the real pages' publication dates.

## Mock fixtures (`apps/mobile/src/api/fixtures.ts`)

- **Real:** `src-am-1` (Anthropic context management), `src-am-2` (Claude *Memory tool* docs), `src-am-4` (Letta), `src-ev-2` (*Building Effective AI Agents*), `src-mcp-1` (MCP 2025-03-26 *Key Changes*, which covers Streamable HTTP and OAuth).
- **Relabeled "(demo)", with links and real-org credits removed:** `src-am-3`, `src-mm-1`, `src-ev-1`, `src-rm-1`, `src-cu-1`.

## In the app

The development screen's "Go deeper" shows a source class, derived only from what the source is: *Primary source, Documentation, Preprint, Research, Repository, Article*. It then shows the real title, and the publisher and date. A ↗ appears only when there's a real link, and links open only if they're http(s).
