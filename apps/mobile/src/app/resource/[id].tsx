import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Concept, Resource, ResourceIdea, TeachDeltaResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { ArtHeader, BriefRow, BriefSection, DotLine } from "@/components/brief/Brief";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { AppTopBar, ListCard, SegmentedTabs } from "@/components/system";
import { openExternal } from "@/lib/links";
import { StageSteps } from "@/components/StageSteps";
import { consumeVerb, hostOf, READ_VIA_COPY, RELEVANCE_LABEL, SOURCE_TYPE_LABEL, sourceDate, STAGE_COPY } from "@/lib/resources";
import { color, font, space } from "@/theme/tokens";

const POLL_MS = 1200;

const SOURCE_NOUN: Partial<Record<Resource["sourceType"], string>> = {
  research: "paper",
  preprint: "paper",
  video: "video",
  documentation: "docs",
  repository: "repository",
  document: "document",
};
/** Storyboard 06: "Read full paper" / "Watch full video" / "Read full article". */
const fullLabel = (r: Resource) => {
  const verb = consumeVerb(r);
  return `${verb[0]!.toUpperCase()}${verb.slice(1)} full ${SOURCE_NOUN[r.sourceType] ?? "article"}`;
};

type Tab = "summary" | "new" | "delta" | "sources";
const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "new", label: "What's new" },
  { key: "delta", label: "New for you" },
  { key: "sources", label: "Sources" },
];

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/library"));

export default function ResourceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Poll while Thinketh is reading; stop once it's ready or failed.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await api.getResource(id);
        if (cancelled) return;
        setResource(r);
        setFailed(false);
        if (r.status === "processing") timer = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    tick();
    api
      .getKnowledge()
      .then((k) => !cancelled && setConcepts(k.items.map((i) => i.concept)))
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, attempt]);

  const briefing = !!resource && (resource.status === "ready" || resource.status === "learned");
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      {!briefing ? <AppTopBar onBack={goBack} /> : null}
      {failed && !resource ? (
        <ErrorState onRetry={() => setAttempt((n) => n + 1)} />
      ) : !resource ? (
        <LoadingState message="Opening your saved source…" />
      ) : resource.status === "processing" ? (
        <Processing resource={resource} />
      ) : resource.status === "failed" ? (
        <Failed resource={resource} />
      ) : (
        <Ready resource={resource} concepts={concepts} />
      )}
    </View>
  );
}

function Processing({ resource }: { resource: Resource }) {
  return (
    <Gutter style={{ paddingTop: space.l }}>
      <T style={styles.typeLabel}>{hostOf(resource.url)}</T>
      <T style={styles.title} numberOfLines={3} accessibilityRole="header">
        {resource.title}
      </T>
      <View style={styles.processCard}>
        <StageSteps stage={resource.stage} />
        <View style={styles.stage} accessibilityLiveRegion="polite">
          <ActivityIndicator color={color.ink3} />
          <T variant="body" style={{ flex: 1 }}>
            {resource.sourceType === "video" && resource.stage === "reading" ? "Reading the transcript…" : STAGE_COPY[resource.stage]}
          </T>
        </View>
      </View>
      <T variant="support" style={{ marginTop: space.m }}>
        Thinketh is working out which parts you already understand and which are genuinely new.
      </T>
    </Gutter>
  );
}

function Failed({ resource }: { resource: Resource }) {
  return (
    <Gutter style={{ paddingTop: space.l }}>
      <T style={styles.typeLabel}>{hostOf(resource.url)}</T>
      <T style={styles.title} accessibilityRole="header">
        Thinketh couldn&apos;t reliably read this source yet.
      </T>
      {resource.error && resource.error !== "Thinketh couldn't reliably read this source yet." ? (
        <T variant="support" style={{ marginTop: space.m }}>
          {resource.error}
        </T>
      ) : null}
      <View style={{ marginTop: space.xxl, gap: space.m }}>
        <Button label="Try another link" onPress={() => router.replace("/resource/add")} />
        <Button kind="secondary" label="Open the original" onPress={() => openExternal(resource.url)} />
      </View>
    </Gutter>
  );
}

function Ready({ resource: r, concepts }: { resource: Resource; concepts: Concept[] }) {
  const name = (id?: string) => concepts.find((c) => c.id === id)?.name;
  const [tab, setTab] = useState<Tab>("summary");
  const [lesson, setLesson] = useState<TeachDeltaResponse | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [teachError, setTeachError] = useState(false);
  const date = sourceDate(r.publishedAt);
  const publisher = r.publisher ?? hostOf(r.url);
  const openOriginal = () => openExternal(r.canonicalUrl ?? r.url);

  const teach = async () => {
    setTeaching(true);
    setTeachError(false);
    try {
      setLesson(await api.teachResource(r.id));
      setTab("delta");
    } catch {
      setTeachError(true);
    } finally {
      setTeaching(false);
    }
  };
  const checkConcept = lesson?.conceptId ?? r.newToYou.find((i) => i.conceptId)?.conceptId ?? r.matchedConceptIds[0];
  const nothingNew = r.newToYou.length === 0;

  // The one primary action: teach the delta (hidden when there is none), then check it.
  const teachBlock =
    !lesson && nothingNew ? (
      // No delta, nothing to teach: say so instead of offering an empty lesson.
      <T variant="support" style={{ textAlign: "center" }}>
        {r.relevance?.level === "outside" ? "This is outside the topics you follow, so Thinketh didn't find anything that connects to your Mind yet." : "You already have what this source offers."}
      </T>
    ) : !lesson ? (
      <>
        <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }}>
          Or explore what matters for you
        </T>
        <Pressable
          onPress={teach}
          disabled={teaching}
          accessibilityRole="button"
          accessibilityState={{ busy: teaching }}
          style={({ pressed }) => [styles.deltaRow, pressed && { backgroundColor: color.surfaceMuted }]}
        >
          <T style={styles.deltaLabel}>{teaching ? "Finding what's new for you…" : "Show what's new for me"}</T>
          {teaching ? <ActivityIndicator color={color.ink2} /> : <Icon name="arrow" size={16} color={color.ink} />}
        </Pressable>
        <T variant="support" style={{ marginTop: space.xs }}>
          {teachError ? "Couldn't prepare the lesson just now. Try again." : "Skips what you already know. About as long as the useful part."}
        </T>
      </>
    ) : null;

  const checkButton =
    lesson && checkConcept ? (
      <Button label="Check my understanding" icon="arrow" onPress={() => router.push({ pathname: "/diagnostic", params: { conceptId: checkConcept } })} />
    ) : null;

  return (
    <Screen topInset={false} contentStyle={{ paddingTop: 0 }}>
      {/* A saved source opens on its title: no decorative tile above it. */}
      <ArtHeader conceptIds={r.matchedConceptIds} fallback="document" onBack={goBack} art={false} />
      <Gutter>
        <T style={styles.typeLabel}>{SOURCE_TYPE_LABEL[r.sourceType]}</T>
        <T style={styles.title} accessibilityRole="header">
          {r.title}
        </T>
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          {[publisher, r.author, date, r.estimatedReadMinutes ? `${r.estimatedReadMinutes} min ${consumeVerb(r)}` : undefined].filter(Boolean).join(" · ")}
        </T>
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} style={{ marginTop: space.xl, justifyContent: "space-between", gap: 0 }} />

        {tab === "summary" ? (
          <View>
            {r.relevance ? (
              <View style={styles.relevance}>
                <View style={[styles.signalDot, r.relevance.level !== "core" && { backgroundColor: color.ink3 }]} />
                <View style={{ flex: 1 }}>
                  <T style={styles.smallCaps}>{RELEVANCE_LABEL[r.relevance.level]}</T>
                  <T variant="support" style={{ marginTop: 2 }}>
                    {r.relevance.reason}
                  </T>
                </View>
              </View>
            ) : null}

            <View style={styles.times} accessibilityRole="summary">
              <View style={{ flex: 1 }}>
                <T style={styles.timeValue}>~{r.estimatedReadMinutes ?? "?"} min</T>
                <T style={styles.smallCaps}>Full {consumeVerb(r)}</T>
              </View>
              <View style={[styles.timeCell, { flex: 1 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <T style={styles.timeValue}>~{r.estimatedUsefulMinutes ?? "?"} min</T>
                  <View style={styles.signalDot} />
                </View>
                <T style={styles.smallCaps}>Useful for you</T>
              </View>
            </View>

            {r.summary ? (
              <BriefSection title="Overview">
                <T variant="body" style={{ color: color.ink2 }}>
                  {r.summary}
                </T>
              </BriefSection>
            ) : null}

            <View style={{ marginTop: space.xxl, gap: space.s }}>
              <Button label={fullLabel(r)} icon="arrow" accessibilityRole="link" accessibilityHint="Opens the original source" onPress={openOriginal} />
              {teachBlock}
              {lesson ? <Button kind="secondary" label="Read what's new for you" icon="arrow" onPress={() => setTab("delta")} /> : null}
            </View>
          </View>
        ) : null}

        {tab === "new" ? (
          <View>
            <BriefSection title="New to you">
              {nothingNew ? <T variant="body">Nothing here goes beyond what you already understand.</T> : <IdeaList ideas={r.newToYou} name={name} accent />}
            </BriefSection>
            {r.whyNow ? (
              <BriefSection title="Why this matters">
                <T variant="body">{r.whyNow}</T>
              </BriefSection>
            ) : null}
            {!lesson && !nothingNew ? <View style={{ marginTop: space.xxl }}>{teachBlock}</View> : null}
          </View>
        ) : null}

        {tab === "delta" ? (
          <View>
            {r.alreadyUnderstood.length ? (
              <BriefSection title="You already understand">
                <IdeaList ideas={r.alreadyUnderstood} name={name} />
              </BriefSection>
            ) : null}
            {lesson ? (
              <BriefSection title="What's new for you">
                <Lesson lesson={lesson} />
              </BriefSection>
            ) : (
              <View style={{ marginTop: space.xxl }}>{teachBlock}</View>
            )}
            {checkButton ? <View style={{ marginTop: space.xl }}>{checkButton}</View> : null}
            {r.relevantConnections.length ? (
              <BriefSection title="Connects to your Mind">
                <T variant="meta" style={{ color: color.ink3, marginBottom: space.s }}>
                  Reading adds information. A book in your Mind changes only when you show understanding in a check.
                </T>
                <ListCard>
                  {r.relevantConnections.map((c, i) => (
                    <BriefRow
                      book
                      key={c.conceptId}
                      title={name(c.conceptId) ?? c.conceptId}
                      subtitle={c.why}
                      last={i === r.relevantConnections.length - 1}
                      onPress={() => router.push({ pathname: "/mind", params: { concept: c.conceptId, from: "source" } })}
                    />
                  ))}
                </ListCard>
              </BriefSection>
            ) : null}
          </View>
        ) : null}

        {tab === "sources" ? (
          <View>
            <BriefSection title="Original source">
              <ListCard>
                <BriefRow
                  icon="external"
                  kicker={SOURCE_TYPE_LABEL[r.sourceType]}
                  title={r.title}
                  meta={[publisher, r.author, date].filter(Boolean).join(" · ")}
                  last
                  accessibilityRole="link"
                  accessibilityLabel={`Open original source: ${r.title}, opens in browser`}
                  onPress={openOriginal}
                />
              </ListCard>
            </BriefSection>
            <T variant="meta" style={{ marginTop: space.xl, color: color.ink3 }}>
              {r.readVia ? `${READ_VIA_COPY[r.readVia]} ` : ""}
              {r.analyzedBy === "claude" ? "Compared with your knowledge state by Claude." : "Compared with your knowledge state from the source text."}
            </T>
          </View>
        ) : null}

        <T variant="meta" style={{ marginTop: space.x3, textAlign: "center", color: color.ink3 }}>
          Reading doesn&apos;t change what Thinketh thinks you know; checking your understanding does.
        </T>
      </Gutter>
    </Screen>
  );
}

function IdeaList({ ideas, name, accent }: { ideas: ResourceIdea[]; name: (id?: string) => string | undefined; accent?: boolean }) {
  return (
    <View>
      {ideas.map((i) => (
        <View key={i.idea} style={{ marginBottom: space.xs }}>
          {name(i.conceptId) ? (
            <T style={[styles.smallCaps, { marginLeft: 17, marginBottom: 2 }]}>{name(i.conceptId)!}</T>
          ) : null}
          <DotLine tone={accent ? "signal" : "muted"}>{i.idea}</DotLine>
        </View>
      ))}
    </View>
  );
}

function Lesson({ lesson }: { lesson: TeachDeltaResponse }) {
  return (
    <View accessibilityLiveRegion="polite">
      {lesson.sections.map((s, n) => (
        <View key={s.heading} style={{ marginTop: n ? space.xl : 0 }}>
          <T variant="section" style={{ fontSize: 16, lineHeight: 22 }}>
            {s.heading}
          </T>
          {s.body.split(/\n{2,}/).map((p) => (
            <T key={p} variant="body" style={{ marginTop: space.s }}>
              {p}
            </T>
          ))}
        </View>
      ))}
      {lesson.skipped.length ? (
        <T variant="support" style={{ marginTop: space.xl }}>
          Skipped because you already understand: {lesson.skipped.join("; ")}.
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deltaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingHorizontal: space.l, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.canvas },
  deltaLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.ink },
  typeLabel: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.3, textTransform: "uppercase", color: color.ink3 },
  title: { fontFamily: font.sansSemibold, fontSize: 25, lineHeight: 31, letterSpacing: -0.6, color: color.ink, marginTop: space.s },
  smallCaps: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1, textTransform: "uppercase", color: color.ink3 },
  stage: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.l },
  processCard: { marginTop: space.xxl, padding: space.l, borderRadius: 18, backgroundColor: color.surfaceMuted },
  relevance: { flexDirection: "row", gap: space.m, marginTop: space.xl, padding: space.m, borderRadius: 14, backgroundColor: color.surfaceMuted },
  signalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral, marginTop: 4 },
  times: { flexDirection: "row", marginTop: space.xl },
  timeCell: { paddingLeft: space.l, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline },
  timeValue: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 29, letterSpacing: -0.6, color: color.ink, fontVariant: ["tabular-nums"], marginBottom: 2 },
});
