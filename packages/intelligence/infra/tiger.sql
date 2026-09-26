-- Tiger Data (TimescaleDB) schema: append-only temporal knowledge history.
-- "Version control for human understanding."
-- Applied by `npm run seed:tiger`. Statements are executed one at a time.

create table if not exists knowledge_observations (
  id text not null,
  user_id text not null,
  concept_id text not null,
  kind text not null,
  weight double precision not null,
  correctness double precision,
  source_ref text,
  created_at timestamptz not null,
  primary key (id, created_at)
);
select create_hypertable('knowledge_observations', by_range('created_at'), if_not_exists => true);
create index if not exists knowledge_observations_user_concept on knowledge_observations (user_id, concept_id, created_at desc);

create table if not exists knowledge_state_transitions (
  id text not null,
  user_id text not null,
  concept_id text not null,
  created_at timestamptz not null,
  observation_id text not null,
  observation_kind text not null,
  mastery_before double precision not null,
  mastery_after double precision not null,
  uncertainty_before double precision not null,
  uncertainty_after double precision not null,
  confidence_after double precision not null,
  evidence_count integer not null,
  reason text not null,
  payload jsonb not null,
  primary key (id, created_at)
);
select create_hypertable('knowledge_state_transitions', by_range('created_at'), if_not_exists => true);
create index if not exists kst_user_concept on knowledge_state_transitions (user_id, concept_id, created_at desc);

create table if not exists world_state_events (
  id text not null,
  development_id text not null,
  kind text not null,
  significance double precision,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  primary key (id, created_at)
);
select create_hypertable('world_state_events', by_range('created_at'), if_not_exists => true);

create table if not exists interaction_events (
  user_id text not null,
  kind text not null,
  ref_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);
select create_hypertable('interaction_events', by_range('created_at'), if_not_exists => true);

-- Daily mastery per user/concept: the Mind view's "how my understanding changed" curve.
create materialized view if not exists daily_concept_mastery
with (timescaledb.continuous) as
select
  user_id,
  concept_id,
  time_bucket('1 day', created_at) as day,
  last(mastery_after, created_at) as mastery,
  last(uncertainty_after, created_at) as uncertainty,
  count(*) as transitions
from knowledge_state_transitions
group by user_id, concept_id, time_bucket('1 day', created_at)
with no data;

select add_continuous_aggregate_policy('daily_concept_mastery',
  start_offset => interval '30 days',
  end_offset => interval '1 hour',
  schedule_interval => interval '1 hour',
  if_not_exists => true);
