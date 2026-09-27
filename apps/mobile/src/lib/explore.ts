import type { BriefResponse, KnowledgeResponse, Resource } from "@thinketh/contracts";
import { exploreGroups, type Recommendation } from "@/content/demo";
import { improvedTodayIds, levelOf } from "@/lib/knowledge";

/** `conceptIds`: what the pick is about, for its topic art. */
export type Pick = Recommendation & { resourceId?: string; conceptIds?: string[] };
export type Group = { reason: string; items: Pick[] };

const KNOWN = new Set(["strong", "intermediate"]);

/**
 * Recommendations from real state first: ready saved sources, today's
 * developments against your weakest and strongest concepts, and what connects
 * to what changed today. Every row says why. Seeded picks fill any gap.
 */
export function buildGroups(today: BriefResponse, knowledge: KnowledgeResponse, resources: Resource[]): Group[] {
  const items = knowledge.items;
  const nameOf = (id: string) => items.find((i) => i.concept.id === id)?.concept.name ?? id;
  const masteryOf = (id: string) => items.find((i) => i.concept.id === id)?.state.mastery ?? 0;
  const levelOfId = (id: string) => levelOf(masteryOf(id));
  // Skip developments already understood today; never recommend the same thing twice.
  const understood = new Set(today.understoodDevelopmentIds ?? []);
  const devs = today.developments.filter((d) => !understood.has(d.id));
  const groups: Group[] = [];
  const used = new Set<string>();
  const keyOf = (i: Pick) =>
    i.resourceId ? `res:${i.resourceId}` : i.storylineId ? `story:${i.storylineId}` : i.developmentId ? `dev:${i.developmentId}` : `concept:${i.conceptId ?? i.title}`;
  const add = (reason: string, item: Pick) => {
    if (used.has(keyOf(item)) || groups.some((g) => g.reason === reason)) return;
    used.add(keyOf(item));
    groups.push({ reason, items: [item] });
  };

  const queued = resources.filter((r) => r.status === "ready" && r.newToYou.length > 0).slice(0, 2);
  if (queued.length) {
    const qItems = queued.map((r) => ({
      title: r.title,
      why: `${r.estimatedUsefulMinutes ?? "?"} useful minutes. ${r.whyNow ?? `${r.newToYou.length} ideas new to you.`}`,
      resourceId: r.id,
    }));
    for (const i of qItems) used.add(keyOf(i));
    groups.push({ reason: "From your learning queue", items: qItems });
  }

  // Weakest concept that one of today's developments actually covers.
  const weak = [...items]
    .filter((i) => !KNOWN.has(levelOf(i.state.mastery)))
    .sort((a, b) => a.state.mastery - b.state.mastery)
    .map((i) => ({ i, dev: devs.find((d) => d.conceptIds.includes(i.concept.id)) }))
    .find((x) => x.dev);
  if (weak?.dev) {
    const flag = weak.i.state.misconceptionFlags[0];
    add("Strengthens a weak area", {
      title: weak.dev.title,
      why: `${weak.i.concept.name} is one of your least developed areas${flag ? ", with an open confusion" : ""}, and this development changes it.`,
      developmentId: weak.dev.id,
    });
  }

  // What connects to a concept that improved today, where you're still weaker.
  const improved = [...improvedTodayIds(items)];
  const next = improved
    .flatMap((id) =>
      knowledge.edges
        .filter((e) => e.fromConceptId === id || e.toConceptId === id)
        .map((e) => ({ from: id, to: e.fromConceptId === id ? e.toConceptId : e.fromConceptId })),
    )
    .filter((x) => !improved.includes(x.to) && !KNOWN.has(levelOfId(x.to)))
    .sort((a, b) => masteryOf(a.to) - masteryOf(b.to))[0];
  if (next) {
    const dev = devs.find((d) => d.conceptIds.includes(next.to) && !used.has(`dev:${d.id}`));
    add("Builds on today's learning", {
      title: dev ? dev.title : nameOf(next.to),
      why: `You just strengthened ${nameOf(next.from)}. ${nameOf(next.to)} connects to it and is still ${levelOfId(next.to)} for you.`,
      ...(dev ? { developmentId: dev.id } : { conceptId: next.to }),
    });
  }

  // A development touching two concepts you already understand.
  const bridge = devs
    .map((d) => ({ d, known: d.conceptIds.filter((id) => KNOWN.has(levelOfId(id))) }))
    .find((x) => x.known.length >= 2 && !used.has(`dev:${x.d.id}`));
  if (bridge) {
    add("Connects two things you know", {
      title: bridge.d.title,
      why: `Links ${nameOf(bridge.known[0]!)} and ${nameOf(bridge.known[1]!)}, which you already understand, so it should read quickly.`,
      developmentId: bridge.d.id,
    });
  }

  // Seeded picks fill the reasons real state couldn't.
  for (const g of exploreGroups) {
    const item = g.items.find(
      (i) =>
        !used.has(keyOf(i)) &&
        (!!i.storylineId || (i.developmentId ? devs.some((d) => d.id === i.developmentId) : !!i.conceptId && items.some((k) => k.concept.id === i.conceptId))),
    );
    if (item) add(g.reason, item);
  }
  // What each pick is about (for its topic art): its concept, its development's concepts, or its source's.
  const conceptIdsOf = (i: Pick): string[] =>
    i.conceptId ? [i.conceptId] : i.developmentId ? (today.developments.find((d) => d.id === i.developmentId)?.conceptIds ?? []) : i.resourceId ? (resources.find((r) => r.id === i.resourceId)?.matchedConceptIds ?? []) : [];
  return groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, conceptIds: conceptIdsOf(i) })) }));
}

