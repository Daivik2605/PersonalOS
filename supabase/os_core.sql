-- PersonalOS Home (prefix os_) — part 1: settings, app kinds, the self-assembling cross-app unions, contract health.
-- Idempotent: safe to re-run any time, never drops user data. RE-RUN THIS FILE after any app publishes or changes
-- its *_dashboard_daily / *_dashboard_now views: new apps are discovered by view name, so the file never needs editing.
-- Owned by dashboard/ (docs/CONTRACT.md "How the dashboard combines them"). Needs Postgres 15+ (security_invoker views).

-- 1. Settings: one row per user, the only thing Home stores (SPEC §2.1) ------------------------------------------------
create table if not exists os_settings (
  user_id             uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  daily_goal_minutes  int  not null default 240 check (daily_goal_minutes between 1 and 1440),
  week_starts_on      int  not null default 1   check (week_starts_on between 0 and 6),   -- 0 = Sunday … 6 = Saturday, 1 = Monday
  timezone            text not null default 'America/Toronto',
  hidden_apps         text[] not null default '{}',
  card_order          text[] not null default '{}',
  theme               text not null default 'system' check (theme in ('system', 'light', 'dark')),
  updated_at          timestamptz not null default now()
);

alter table os_settings enable row level security;
drop policy if exists "own rows" on os_settings;
create policy "own rows" on os_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function os_set_updated_at() returns trigger language plpgsql as
  $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists os_settings_updated_at on os_settings;
create trigger os_settings_updated_at before update on os_settings
  for each row execute function os_set_updated_at();

revoke all on os_settings from anon;
grant select, insert, update, delete on os_settings to authenticated;

-- 2. Contract checks (read the catalog only) ---------------------------------------------------------------------------
-- Standard columns, in order, with types, for kind 'daily' or 'now' (docs/CONTRACT.md). Extras after them are fine.
create or replace function os_columns_ok(p_view text, p_kind text) returns boolean
language sql stable as $$
  with expected(pos, name, typ) as (
    select pos, name, typ from (values
      ('daily', 1, 'user_id', 'uuid'), ('daily', 2, 'day', 'date'), ('daily', 3, 'app', 'text'),
      ('daily', 4, 'active_minutes', 'integer'), ('daily', 5, 'items_done', 'integer'),
      ('daily', 6, 'items_planned', 'integer'), ('daily', 7, 'streak_current', 'integer'),
      ('daily', 8, 'headline', 'text'), ('daily', 9, 'updated_at', 'timestamp with time zone'),
      ('now', 1, 'user_id', 'uuid'), ('now', 2, 'app', 'text'), ('now', 3, 'contract_version', 'integer'),
      ('now', 4, 'status_line', 'text'), ('now', 5, 'needs_attention', 'integer'),
      ('now', 6, 'attention_label', 'text'), ('now', 7, 'last_activity_at', 'timestamp with time zone'),
      ('now', 8, 'updated_at', 'timestamp with time zone')
    ) e(kind, pos, name, typ) where kind = p_kind
  ), actual as (
    select row_number() over (order by a.attnum)::int as pos, a.attname::text as name, format_type(a.atttypid, a.atttypmod) as typ
    from pg_attribute a
    where a.attrelid = to_regclass('public.' || quote_ident(p_view)) and a.attnum > 0 and not a.attisdropped
  )
  select to_regclass('public.' || quote_ident(p_view)) is not null
     and (select count(*) from expected e join actual a using (pos, name, typ)) = (select count(*) from expected)
$$;

-- RLS must still apply (security_invoker) and signed-in users must be able to read the view.
create or replace function os_view_access_ok(p_view text) returns boolean
language sql stable as $$
  select coalesce(
    (select c.relkind = 'v'
        and exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o where o ~* '^security_invoker=(true|on|1)$')
        and has_table_privilege('authenticated', c.oid, 'select')
     from pg_class c where c.oid = to_regclass('public.' || quote_ident(p_view))), false)
$$;

grant execute on function os_columns_ok(text, text), os_view_access_ok(text) to authenticated;

-- 3. os_app_kind: which kind of time an app's minutes count as (used by part 2) ---------------------------------------
-- label = the name used for the fallback tag Study/<label> when an app's minutes have no TaskFlow tag (part 2).
create or replace view os_app_kind with (security_invoker = true) as
  select * from (values ('trading', 'study', 'Trading'), ('dsa', 'study', 'DSA')) k(app, kind, label);

-- 4. The self-assembling views -----------------------------------------------------------------------------------------
-- Sources are DISCOVERED by name (any public view called <key>_dashboard_daily / _now), then VALIDATED (security_invoker,
-- readable by signed-in users, standard columns/types in order). Invalid ones are skipped and show up in os_contract_health.
do $$
declare
  r record;
  d text[] := '{}';
  n text[] := '{}';
  nd text[] := '{}';
  daily_cols constant text := 'user_id, day, app, active_minutes, items_done, items_planned, streak_current, headline, updated_at';
  now_cols   constant text := 'user_id, app, contract_version, status_line, needs_attention, attention_label, last_activity_at, updated_at';
begin
  for r in
    select c.relname::text as name, substring(c.relname from '_dashboard_(daily|now)$') as kind
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'v'
      and c.relname ~ '^[a-z][a-z0-9]*_dashboard_(daily|now)$' and c.relname !~ '^os_'
    order by c.relname
  loop
    if os_columns_ok(r.name, r.kind) and os_view_access_ok(r.name) then
      if r.kind = 'daily' then d := d || format('select %s from public.%I', daily_cols, r.name);
      else
        n := n || format('select %s from public.%I', now_cols, r.name);
        nd := nd || format('select %L::text, max(contract_version)::int, max(updated_at) from public.%I', r.name, r.name);
      end if;
    end if;
  end loop;

  execute 'create or replace view os_daily_activity with (security_invoker = true) as ' ||
    case when cardinality(d) = 0 then
      'select null::uuid as user_id, null::date as day, null::text as app, null::int as active_minutes, null::int as items_done, '
      'null::int as items_planned, null::int as streak_current, null::text as headline, null::timestamptz as updated_at where false'
    else array_to_string(d, ' union all ') end;

  execute 'create or replace view os_apps_now with (security_invoker = true) as ' ||
    case when cardinality(n) = 0 then
      'select null::uuid as user_id, null::text as app, null::int as contract_version, null::text as status_line, null::int as needs_attention, '
      'null::text as attention_label, null::timestamptz as last_activity_at, null::timestamptz as updated_at where false'
    else array_to_string(n, ' union all ') end;

  -- os_contract_health: one row per (app, view). Apps = the KNOWN list (so "not published yet" can be shown) plus every
  -- app discovered by name. exists / columns_ok / access_ok are live from the catalog; in_unions is true when the
  -- union views above already include the view (false while valid = "re-run os_core.sql"); contract_version and
  -- last_updated_at come from each valid *_dashboard_now view (generated here, one branch per source).
  execute 'create or replace view os_contract_health with (security_invoker = true) as ' || $q$
    with known(app) as (values ('trading'), ('dsa'), ('taskflow'), ('money')),
    found(app) as (
      select substring(c.relname from '^([a-z][a-z0-9]*)_dashboard_(?:daily|now)$')
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind = 'v' and c.relname ~ '^[a-z][a-z0-9]*_dashboard_(daily|now)$' and c.relname !~ '^os_'
    ),
    apps(app) as (select app from known union select app from found),
    views as (
      select a.app, a.app || '_dashboard_' || k.kind as view_name, k.kind,
             case k.kind when 'daily' then 'os_daily_activity' else 'os_apps_now' end as union_view
      from apps a cross join (values ('daily'), ('now')) k(kind)
    ),
    state as (
      select v.app, v.view_name, v.kind,
             to_regclass('public.' || quote_ident(v.view_name)) is not null as is_present,
             os_columns_ok(v.view_name, v.kind) as cols_ok,
             os_view_access_ok(v.view_name) as acc_ok,
             pg_get_viewdef(v.union_view::regclass) ~ ('\m' || v.view_name || '\M') as in_u
      from views v
    ),
    now_data(view_name, contract_version, last_updated_at) as ( $q$ ||
    case when cardinality(nd) = 0 then 'select null::text, null::int, null::timestamptz where false'
    else array_to_string(nd, ' union all ') end
    || $q$ )
    select s.app, s.view_name as view, s.is_present as exists, s.cols_ok as columns_ok,
           case when s.kind = 'now' then nd.contract_version end as contract_version,
           case when s.kind = 'now' then nd.last_updated_at end as last_updated_at,
           s.acc_ok as access_ok, s.in_u as in_unions
    from state s left join now_data nd on nd.view_name = s.view_name
    order by s.app, s.view_name
  $q$;
end $$;

-- 5. Grants (part 1) ---------------------------------------------------------------------------------------------------
revoke all on os_app_kind, os_daily_activity, os_apps_now, os_contract_health from anon;
grant select on os_app_kind, os_daily_activity, os_apps_now, os_contract_health to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PART 2 — productive time across apps, streak, week (SPEC §2.2). Every view is built only from sources that exist and
-- match their contract, exactly like the unions above, so re-run this file after TaskFlow / Money publish or change views.
-- Days are Toronto dates; os_settings.timezone is display-only (SQL below uses the literal 'America/Toronto').
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- 6. Helpers for optional sources (catalog only) ----------------------------------------------------------------------
-- p_spec = 'name:type,name:type' using format_type names (uuid, date, text, integer, bigint …); extra columns are fine.
create or replace function os_cols_present(p_view text, p_spec text) returns boolean
language sql stable as $$
  select to_regclass('public.' || quote_ident(p_view)) is not null
     and not exists (
       select 1 from unnest(string_to_array(p_spec, ',')) s
       where not exists (
         select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.' || quote_ident(p_view)) and a.attnum > 0 and not a.attisdropped
           and a.attname = split_part(s, ':', 1) and format_type(a.atttypid, a.atttypmod) = split_part(s, ':', 2)))
$$;

-- True when the view has a numeric column of that name (an extra a source may or may not have).
create or replace function os_has_col(p_view text, p_col text) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
    where a.attrelid = to_regclass('public.' || quote_ident(p_view)) and a.attnum > 0 and not a.attisdropped
      and a.attname = p_col and t.typcategory = 'N')
$$;

grant execute on function os_cols_present(text, text), os_has_col(text, text) to authenticated;

-- 7. Reporting for the optional TaskFlow views (the unions' health is os_contract_health) -------------------------------
create or replace view os_optional_health with (security_invoker = true) as
  select v.app, v.view_name as view,
         to_regclass('public.' || quote_ident(v.view_name)) is not null as exists,
         os_cols_present(v.view_name, v.spec) as columns_ok,
         os_view_access_ok(v.view_name) as access_ok,
         pg_get_viewdef(v.used_by::regclass) ~ ('\m' || v.view_name || '\M') as in_use
  from (values
    ('taskflow', 'taskflow_dashboard_area_daily', 'user_id:uuid,day:date,parent_tag:text,tag:text,tag_path:text,kind:text,app_key:text,minutes:integer', 'os_tag_daily'),
    ('taskflow', 'taskflow_dashboard_days_off',   'user_id:uuid,day:date',                                                                               'os_productive_daily')
  ) v(app, view_name, spec, used_by);

-- 8. Productive-time views --------------------------------------------------------------------------------------------
do $$
declare
  area_spec constant text := 'user_id:uuid,day:date,parent_tag:text,tag:text,tag_path:text,kind:text,app_key:text,minutes:integer';
  tf_area text;
  tf_off  text;
  w text[];
  c text; col text; agg text;
begin
  tf_area := case when os_cols_present('taskflow_dashboard_area_daily', area_spec) and os_view_access_ok('taskflow_dashboard_area_daily')
    then 'select user_id, day, parent_tag, tag, tag_path, kind, app_key, minutes from public.taskflow_dashboard_area_daily'
    else 'select null::uuid as user_id, null::date as day, null::text as parent_tag, null::text as tag, null::text as tag_path, '
         'null::text as kind, null::text as app_key, null::int as minutes where false' end;
  tf_off := case when os_cols_present('taskflow_dashboard_days_off', 'user_id:uuid,day:date') and os_view_access_ok('taskflow_dashboard_days_off')
    then 'select user_id, day from public.taskflow_dashboard_days_off'
    else 'select null::uuid as user_id, null::date as day where false' end;

  -- os_tag_daily: TaskFlow minutes per tag per day, raised to what a linked app measured itself (the MAX-RULE).
  --   app_key is unique per user among non-archived TaskFlow tags, so an app links to at most one tag: the tag that
  --   carries its app_key in area_daily (if an archived tag still carries it, the most recently used one wins).
  --   Per user/day/app: minutes = max(TaskFlow minutes on that app_key, the app's own active_minutes); the surplus is
  --   added to the linked tag (source 'max'). App minutes with no linked tag, or whose tag has no row that day, appear
  --   as their own row (source 'app'): under the linked tag, else parent 'Study' / tag <label> / path 'Study/<label>'.
  --   Only apps listed in os_app_kind contribute; TaskFlow's own daily row is never added (no double counting).
  execute replace($t$
  create or replace view os_tag_daily with (security_invoker = true) as
  with tf as (
    select user_id, day, parent_tag, tag, tag_path, kind, app_key, sum(minutes)::int as minutes
    from (<TF_AREA>) x
    group by user_id, day, parent_tag, tag, tag_path, kind, app_key
  ),
  tf_app as (
    select user_id, day, app_key, sum(minutes)::int as tf_minutes
    from tf where app_key is not null group by user_id, day, app_key
  ),
  app as (
    select a.user_id, a.day, a.app, k.kind, k.label, sum(a.active_minutes)::int as app_minutes
    from os_daily_activity a join os_app_kind k on k.app = a.app
    where coalesce(a.active_minutes, 0) > 0
    group by a.user_id, a.day, a.app, k.kind, k.label
  ),
  linked as (
    select distinct on (user_id, app_key) user_id, app_key, parent_tag, tag, tag_path, kind
    from tf where app_key is not null
    order by user_id, app_key, day desc, tag_path
  ),
  gap as (
    select a.user_id, a.day, a.app, a.kind, a.label, a.app_minutes - coalesce(t.tf_minutes, 0) as extra
    from app a
    left join tf_app t on t.user_id = a.user_id and t.day = a.day and t.app_key = a.app
    where a.app_minutes > coalesce(t.tf_minutes, 0)
  )
  select t.user_id, t.day, t.parent_tag, t.tag, t.kind, t.app_key,
         (t.minutes + coalesce(g.extra, 0))::int as minutes,
         case when g.extra is not null then 'max' else 'taskflow' end::text as source,
         t.tag_path
  from tf t
  left join linked l on l.user_id = t.user_id and l.app_key = t.app_key and l.tag_path = t.tag_path
  left join gap g    on g.user_id = t.user_id and g.day = t.day and g.app = t.app_key and l.tag_path is not null
  union all
  select g.user_id, g.day,
         coalesce(l.parent_tag, 'Study'), coalesce(l.tag, g.label), coalesce(l.kind, g.kind), g.app,
         g.extra::int, 'app'::text,
         coalesce(l.tag_path, 'Study/' || g.label)
  from gap g
  left join linked l on l.user_id = g.user_id and l.app_key = g.app
  where not exists (select 1 from tf t where t.user_id = g.user_id and t.day = g.day and t.tag_path = l.tag_path)
  $t$, '<TF_AREA>', tf_area);

  -- os_productive_daily: study + hustle minutes per day; a row exists for every day with minutes or marked day off.
  execute replace($t$
  create or replace view os_productive_daily with (security_invoker = true) as
  with p as (
    select user_id, day, sum(minutes)::int as minutes from os_tag_daily where kind in ('study', 'hustle') group by user_id, day
  ),
  off as (select distinct user_id, day from (<TF_OFF>) x)
  select coalesce(p.user_id, o.user_id) as user_id, coalesce(p.day, o.day) as day,
         coalesce(p.minutes, 0)::int as minutes, (o.day is not null) as is_day_off
  from p full join off o on o.user_id = p.user_id and o.day = p.day
  $t$, '<TF_OFF>', tf_off);

  -- os_week: long format. Day-level facts per app, summed (or averaged) per week; week start from os_settings (default Monday).
  w := array[
    'select user_id, day, app, ''active_minutes''::text, active_minutes::numeric, ''sum''::text from os_daily_activity',
    'select user_id, day, app, ''items_done''::text, items_done::numeric, ''sum''::text from os_daily_activity',
    'select user_id, day, ''os''::text, ''productive_minutes''::text, minutes::numeric, ''sum''::text from os_productive_daily',
    'select user_id, day, ''os''::text, ''days_off''::text, 1::numeric, ''sum''::text from os_productive_daily where is_day_off'];

  if os_columns_ok('taskflow_dashboard_daily', 'daily') and os_view_access_ok('taskflow_dashboard_daily') then
    foreach c in array array['work_minutes:sum', 'cigarettes:sum', 'weed:sum', 'tasks_missed:sum', 'deadlines_missed:sum',
                             'sleep_minutes:avg', 'mood:avg', 'energy:avg'] loop
      col := split_part(c, ':', 1); agg := split_part(c, ':', 2);
      if os_has_col('taskflow_dashboard_daily', col) then
        w := w || format('select user_id, day, %L::text, %L::text, %s::numeric, %L::text from public.taskflow_dashboard_daily',
                         'taskflow', col, case when col = 'sleep_minutes' then format('nullif(%I, 0)', col) else format('%I', col) end, agg);
      end if;
    end loop;
  end if;

  if os_columns_ok('money_dashboard_daily', 'daily') and os_view_access_ok('money_dashboard_daily') then
    foreach col in array array['in_cents', 'out_cents', 'essential_out_cents', 'discretionary_out_cents', 'smoking_out_cents'] loop
      if os_has_col('money_dashboard_daily', col) then
        w := w || format('select user_id, day, %L::text, %L::text, %I::numeric, ''sum''::text from public.money_dashboard_daily', 'money', col, col);
      end if;
    end loop;
    if os_has_col('money_dashboard_daily', 'in_cents') and os_has_col('money_dashboard_daily', 'out_cents') then
      w := w || ('select user_id, day, ''money''::text, ''net_cents''::text, (in_cents - out_cents)::numeric, ''sum''::text from public.money_dashboard_daily')::text;
    end if;
  end if;

  execute replace($t$
  create or replace view os_week with (security_invoker = true) as
  with d(user_id, day, app, metric, value, agg) as (<SOURCES>),
  w as (
    select d.user_id,
           (d.day - ((extract(dow from d.day)::int - coalesce(s.week_starts_on, 1) + 7) % 7))::date as week_start,
           d.app, d.metric, d.value, d.agg
    from d left join os_settings s on s.user_id = d.user_id
    where d.value is not null
  )
  select user_id, week_start, app, metric,
         (case max(agg) when 'avg' then avg(value) else sum(value) end)::numeric as value
  from w group by user_id, week_start, app, metric
  $t$, '<SOURCES>', array_to_string(w, ' union all '));
end $$;

-- os_streak: consecutive productive days (minutes > 0) ending at the last day that can still count.
--   Days off are left out of the sequence, so they neither break nor extend a streak (even if I worked on one).
--   Today with 0 minutes is left out too: it can't break the streak until it is over. Yesterday at 0 does break it.
--   Gaps-and-islands over the remaining days; dates are added as integers, so a DST change can't shift a day.
create or replace view os_streak with (security_invoker = true) as
with today(d) as (select (now() at time zone 'America/Toronto')::date),
first_day as (
  select user_id, min(day) as d from os_productive_daily where minutes > 0 group by user_id
),
cal as (
  select f.user_id, (f.d + n)::date as day
  from first_day f cross join today t
  cross join lateral generate_series(0, t.d - f.d) n
),
counted as (
  select c.user_id, c.day, coalesce(p.minutes, 0) > 0 as prod
  from cal c
  cross join today t
  left join os_productive_daily p on p.user_id = c.user_id and p.day = c.day
  where not coalesce(p.is_day_off, false)
    and not (c.day = t.d and coalesce(p.minutes, 0) = 0)
),
numbered as (
  select user_id, day, prod, row_number() over (partition by user_id order by day) as rn from counted
),
runs as (
  select user_id, day, prod, rn - row_number() over (partition by user_id, prod order by day) as grp from numbered
),
islands as (
  select user_id, count(*)::int as len, max(day) as last_day from runs where prod group by user_id, grp
),
last_counted as (select user_id, max(day) as day from counted group by user_id)
select i.user_id,
       coalesce(max(i.len) filter (where i.last_day = e.day), 0)::int as "current",
       max(i.len)::int as longest,
       max(i.last_day) as last_productive_day
from islands i join last_counted e on e.user_id = i.user_id
group by i.user_id;

-- 9. Grants (part 2) ---------------------------------------------------------------------------------------------------
revoke all on os_optional_health, os_tag_daily, os_productive_daily, os_week, os_streak from anon;
grant select on os_optional_health, os_tag_daily, os_productive_daily, os_week, os_streak to authenticated;
