import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Concept, Resource, ResourceIdea, TeachDeltaResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { BackBar, Button, Divider, ErrorState, Gutter, LoadingState, Row, Screen, SectionLabel } from "@/components/ui";
import { openExternal } from "@/lib/links";
import { hostOf, SOURCE_TYPE_LABEL, sourceDate, STAGE_COPY } from "@/lib/resources";
import { color, font, space } from "@/theme/tokens";

const POLL_MS = 1200;

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

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <BackBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/library"))} />
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
    <Gutter style={{ paddingTop: space.x4 }}>
      <T variant="meta">{hostOf(resource.url)}</T>
      <T variant="title" style={{ marginTop: space.s }} numberOfLines={3}>
        {resource.title}
      </T>
      <View style={styles.stage} accessibilityLiveRegion="polite">
        <ActivityIndicator color={color.coral} />
        <T variant="body">{STAGE_COPY[resource.stage]}</T>
      </View>
      <T variant="support" style={{ marginTop: space.m }}>
        Thinketh is working out which parts you already understand and which are genuinely new.
      </T>
    </Gutter>
  );
}

function Failed({ resource }: { resource: Resource }) {
  return (
    <Gutter style={{ paddingTop: space.x4 }}>
      <T variant="meta">{hostOf(resource.url)}</T>
      <T variant="title" style={{ marginTop: space.s }}>
        Thinketh couldn&apos;t reliably read this source yet.
      </T>
      {resource.error && resource.error !== "Thinketh couldn't reliably read this source yet." ? (
        <T variant="support" style={{ marginTop: space.m }}>
          {resource.error}
        </T>
      ) : null}
      <View style={{ marginTop: space.xxl, gap: space.m }}>
        <Button label="Try another link" onPress={() => router.replace("/resource/add")} />
        <Button kind="quiet" label="Open the original" style={{ alignSelf: "center" }} onPress={() => openExternal(resource.url)} />
      </View>
    </Gutter>
  );
}

function Ready({ resource: r, concepts }: { resource: Resource; concepts: Concept[] }) {
  const name = (id?: string) => concepts.find((c) => c.id === id)?.name;
  const [lesson, setLesson] = useState<TeachDeltaResponse | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [teachError, setTeachError] = useState(false);
  const date = sourceDate(r.publishedAt);

  const teach = async () => {
    setTeaching(true);
    setTeachError(false);
    try {
      setLesson(await api.teachResource(r.id));
    } catch {
      setTeachError(true);
    } finally {
      setTeaching(false);
    }
  };
  const checkConcept = lesson?.conceptId ?? r.newToYou.find((i) => i.conceptId)?.conceptId ?? r.matchedConceptIds[0];

  return (
    <Screen topInset={false} contentStyle={{ paddingTop: space.s }}>
      <Gutter>
        <SectionLabel>{SOURCE_TYPE_LABEL[r.sourceType]}</SectionLabel>
        <T variant="title" style={{ fontSize: 28, lineHeight: 35 }} accessibilityRole="header">
          {r.title}
        </T>
        <T variant="meta" style={{ marginTop: space.s }}>
          {[r.publisher ?? hostOf(r.url), r.author, date].filter(Boolean).join(" · ")}
        </T>
        <Pressable onPress={() => openExternal(r.canonicalUrl ?? r.url)} accessibilityRole="link" style={styles.original} hitSlop={6}>
          <T variant="meta" style={{ color: color.ink }}>
            Open original source
          </T>
          <Icon name="external" size={13} color={color.ink} />
        </Pressable>

        <View style={styles.times}>
          <View>
            <T variant="label">Full read</T>
            <T variant="display" style={styles.minutes}>
              ~{r.estimatedReadMinutes ?? "?"} min
            </T>
          </View>
          <View>
            <T variant="label" tone="coral">
              Useful for you
            </T>
            <T variant="display" style={[styles.minutes, { color: color.coral }]}>
              ~{r.estimatedUsefulMinutes ?? "?"} min
            </T>
          </View>
        </View>
        {r.summary ? (
          <T variant="support" style={{ marginTop: space.xl }}>
            {r.summary}
          </T>
        ) : null}
      </Gutter>

      <Gutter style={{ marginTop: space.x3 }}>
        {r.alreadyUnderstood.length ? (
          <IdeaList label="You already understand" ideas={r.alreadyUnderstood} name={name} />
        ) : null}
        {r.newToYou.length ? (
          <IdeaList label="New to you" ideas={r.newToYou} name={name} accent style={{ marginTop: space.xl }} />
        ) : (
          <T variant="body" style={{ marginTop: space.xl }}>
            Nothing here goes beyond what you already understand.
          </T>
        )}
      </Gutter>

      {r.whyNow ? (
        <Gutter style={{ marginTop: space.x3 }}>
          <T variant="label" style={{ marginBottom: space.m }}>
            Why this matters
          </T>
          <T variant="statement" style={{ fontSize: 22, lineHeight: 31 }}>
            {r.whyNow}
          </T>
        </Gutter>
      ) : null}

      {r.relevantConnections.length ? (
        <View style={{ marginTop: space.x3 }}>
          <Gutter>
            <SectionLabel>Connects to your Mind</SectionLabel>
          </Gutter>
          <Divider />
          {r.relevantConnections.map((c) => (
            <Row key={c.conceptId} onPress={() => router.push({ pathname: "/mind", params: { concept: c.conceptId } })}>
              <T variant="body" style={{ fontFamily: font.sansMedium }}>
                {name(c.conceptId) ?? c.conceptId}
              </T>
              <T variant="support">{c.why}</T>
            </Row>
          ))}
        </View>
      ) : null}

      <Gutter style={{ marginTop: space.x3 }}>
        {!lesson ? (
          <>
            <Button kind="decisive" label={teaching ? "Finding the actual delta…" : "Teach me the delta"} icon="arrow" loading={teaching} onPress={teach} />
            <T variant="support" style={{ marginTop: space.m, textAlign: "center" }}>
              {teachError ? "Couldn't prepare the lesson just now. Try again." : "Skips what you already know. About as long as the useful part."}
            </T>
          </>
        ) : (
          <Lesson lesson={lesson} />
        )}
      </Gutter>

      {lesson ? (
        <Gutter style={{ marginTop: space.xl }}>
          {checkConcept ? (
            <Button
              kind="decisive"
              label="Check my understanding"
              icon="arrow"
              onPress={() => router.push({ pathname: "/diagnostic", params: { conceptId: checkConcept } })}
            />
          ) : null}
        </Gutter>
      ) : null}

      <Gutter style={{ marginTop: space.xl }}>
        <T variant="meta" style={{ textAlign: "center" }}>
          {r.analyzedBy === "claude" ? "Compared with your knowledge state by Claude." : "Compared with your knowledge state from the source text."} Reading doesn&apos;t change what Thinketh thinks you know; checking your understanding does.
        </T>
      </Gutter>
    </Screen>
  );
}

function IdeaList({ label, ideas, name, accent, style }: { label: string; ideas: ResourceIdea[]; name: (id?: string) => string | undefined; accent?: boolean; style?: object }) {
  return (
    <View style={[styles.rule, { borderLeftColor: accent ? color.coral : color.edge }, style]}>
      <T variant="label" tone={accent ? "coral" : undefined} style={{ marginBottom: space.m }}>
        {label}
      </T>
      {ideas.map((i) => (
        <View key={i.idea} style={{ marginBottom: space.m }}>
          {name(i.conceptId) ? <T variant="meta">{name(i.conceptId)}</T> : null}
          <T variant="body" style={!accent ? { color: color.ink2 } : undefined}>
            {i.idea}
          </T>
        </View>
      ))}
    </View>
  );
}

function Lesson({ lesson }: { lesson: TeachDeltaResponse }) {
  return (
    <View accessibilityLiveRegion="polite">
      <T variant="label" tone="coral" style={{ marginBottom: space.l }}>
        The delta, for you
      </T>
      {lesson.sections.map((s, n) => (
        <View key={s.heading} style={{ marginTop: n ? space.xl : 0 }}>
          <T variant="section">{s.heading}</T>
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
  stage: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.xxl },
  original: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" },
  times: { flexDirection: "row", gap: space.x3, marginTop: space.l },
  minutes: { fontSize: 30, lineHeight: 36, marginTop: space.xs },
  rule: { borderLeftWidth: 2, paddingLeft: space.l },
});
