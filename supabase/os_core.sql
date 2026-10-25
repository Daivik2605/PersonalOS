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

-- 3. os_app_kind: which kind of time an app's minutes count as (used by phase 3) ---------------------------------------
create or replace view os_app_kind with (security_invoker = true) as
  select * from (values ('trading', 'study'), ('dsa', 'study')) k(app, kind);

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

-- 5. Grants ------------------------------------------------------------------------------------------------------------
revoke all on os_app_kind, os_daily_activity, os_apps_now, os_contract_health from anon;
grant select on os_app_kind, os_daily_activity, os_apps_now, os_contract_health to authenticated;
