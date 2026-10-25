-- Scenarios for os_core.sql. Run by run-local.sh with -v schema=<path> -v checks=<path>. Every check prints PASSED or aborts.
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
insert into auth.users (id) values (:'A'), (:'B');
select set_config('ostest.a', :'A', false) as _ \gset
select set_config('ostest.b', :'B', false) as _ \gset

-- ── 1. zero app views ────────────────────────────────────────────────────────────────────────────────────────────
\i :schema
\i :schema
select ostest.ok('1 runs twice cleanly on an empty database', true);
select ostest.ok('1 os_daily_activity exists with the standard columns and no rows',
  (select count(*) from os_daily_activity) = 0
  and (select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'os_daily_activity'::regclass and attnum > 0)
      = 'user_id,day,app,active_minutes,items_done,items_planned,streak_current,headline,updated_at');
select ostest.ok('1 os_apps_now exists with the standard columns and no rows',
  (select count(*) from os_apps_now) = 0
  and (select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'os_apps_now'::regclass and attnum > 0)
      = 'user_id,app,contract_version,status_line,needs_attention,attention_label,last_activity_at,updated_at');
select ostest.ok('1 health lists the four known apps x2 views, none existing',
  (select count(*) from os_contract_health) = 8 and (select bool_and(not exists) from os_contract_health)
  and (select array_agg(distinct app order by app) from os_contract_health) = array['dsa','money','taskflow','trading']);
select ostest.ok('1 os_app_kind maps trading and dsa to study', (select count(*) from os_app_kind where kind = 'study') = 2);
select ostest.ok('1 anon has no access to any os_ object',
  not has_table_privilege('anon', 'os_settings', 'select') and not has_table_privilege('anon', 'os_daily_activity', 'select')
  and not has_table_privilege('anon', 'os_apps_now', 'select') and not has_table_privilege('anon', 'os_contract_health', 'select')
  and not has_table_privilege('anon', 'os_app_kind', 'select'));

-- ── 2. settings: defaults, constraints, updated_at ────────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
insert into os_settings default values;
select ostest.ok('2 settings defaults', (select (daily_goal_minutes, week_starts_on, timezone, theme, hidden_apps, card_order)::text
  from os_settings) = '(240,1,America/Toronto,system,{},{})');
update os_settings set updated_at = '2020-01-01';
select ostest.ok('2 updated_at is bumped by the trigger on update', (select updated_at > now() - interval '1 minute' from os_settings));
do $$ begin
  begin update os_settings set daily_goal_minutes = 0; raise exception 'accepted a 0 minute goal'; exception when check_violation then null; end;
  begin update os_settings set theme = 'neon'; raise exception 'accepted a bad theme'; exception when check_violation then null; end;
  begin update os_settings set week_starts_on = 7; raise exception 'accepted week_starts_on 7'; exception when check_violation then null; end;
end $$;
select ostest.ok('2 bad goal, theme and week start are rejected', true);
reset role;

-- ── 3. one app (trading) ──────────────────────────────────────────────────────────────────────────────────────────
select ostest.make_app('trading') as _ \gset
select ostest.add_row('trading', :'A', '2026-10-24') as _ \gset
select ostest.add_row('trading', :'A', '2026-10-25') as _ \gset
select ostest.add_row('trading', :'B', '2026-10-25') as _ \gset
select ostest.ok('3 before re-running, the view is valid but not in the unions (health says re-run)',
  (select bool_and(exists and columns_ok and access_ok and not in_unions) from os_contract_health where app = 'trading'));
\i :schema
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('3 user A sees only their two trading days in os_daily_activity',
  (select count(*) from os_daily_activity) = 2 and (select bool_and(app = 'trading') from os_daily_activity));
select ostest.ok('3 user A sees their one trading row in os_apps_now', (select count(*) from os_apps_now) = 1);
select set_config('request.jwt.claim.sub', :'B', false) as _ \gset
select ostest.ok('3 user B sees only their own row', (select count(*) from os_daily_activity) = 1 and (select count(*) from os_apps_now) = 1);
select ostest.ok('3 health: trading ok, in unions, contract version and update time read', (select bool_and(exists and columns_ok and access_ok and in_unions) from os_contract_health where app = 'trading')
  and (select contract_version = 1 and last_updated_at is not null from os_contract_health where view = 'trading_dashboard_now')
  and (select contract_version is null and last_updated_at is null from os_contract_health where view = 'trading_dashboard_daily'));
select ostest.ok('3 health: the other known apps are still not published', (select bool_and(not exists) from os_contract_health where app <> 'trading'));
select ostest.ok('3 extra columns on a source are fine and not exposed by the union',
  (select count(*) from pg_attribute where attrelid = 'os_daily_activity'::regclass and attnum > 0) = 9);
reset role;

-- ── 4. three apps ─────────────────────────────────────────────────────────────────────────────────────────────────
select ostest.make_app('dsa') as _ \gset
select ostest.make_app('taskflow', false) as _ \gset
select ostest.add_row('dsa', :'A', '2026-10-25') as _ \gset
select ostest.add_row('taskflow', :'A', '2026-10-25') as _ \gset
select ostest.add_row('taskflow', :'B', '2026-10-25') as _ \gset
\i :schema
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('4 three apps: A sees 4 daily rows across three apps', (select count(*) from os_daily_activity) = 4
  and (select array_agg(distinct app order by app) from os_daily_activity) = array['dsa','taskflow','trading']);
select ostest.ok('4 three apps: A sees 3 apps_now rows', (select count(*) from os_apps_now) = 3);
select ostest.ok('4 health: money is the only known app still not published', (select array_agg(distinct app) from os_contract_health where not exists) = array['money']);
reset role;

-- ── 5. an unknown app key is picked up with no edit to the file ───────────────────────────────────────────────────
select ostest.make_app('demo') as _ \gset
select ostest.add_row('demo', :'A', '2026-10-25') as _ \gset
select ostest.ok('5 demo is in health as valid-but-not-in-unions before the re-run',
  (select bool_and(exists and columns_ok and access_ok and not in_unions) from os_contract_health where app = 'demo'));
\i :schema
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('5 unknown app "demo" appears in os_daily_activity and os_apps_now after re-running os_core.sql',
  (select count(*) from os_daily_activity where app = 'demo') = 1 and (select count(*) from os_apps_now where app = 'demo') = 1);
select ostest.ok('5 demo is in health and in the unions', (select bool_and(in_unions and columns_ok) from os_contract_health where app = 'demo')
  and (select count(*) from os_contract_health where app = 'demo') = 2);
reset role;

-- ── 6. invalid sources are skipped and reported; look-alike names are ignored ─────────────────────────────────────
create view badcols_dashboard_daily with (security_invoker = true) as
  select day, user_id, 'badcols'::text as app, minutes::int as active_minutes, done::int as items_done, null::int as items_planned,
         null::int as streak_current, 'x'::text as headline, now() as updated_at from trading_fx;
create view wrongtype_dashboard_daily with (security_invoker = true) as
  select user_id, day, 'wrongtype'::text as app, minutes::bigint as active_minutes, done::int as items_done, null::int as items_planned,
         null::int as streak_current, 'x'::text as headline, now() as updated_at from trading_fx;
create view nosec_dashboard_daily as
  select user_id, day, 'nosec'::text as app, minutes::int as active_minutes, done::int as items_done, null::int as items_planned,
         null::int as streak_current, 'x'::text as headline, now() as updated_at from trading_fx;
create view ungranted_dashboard_daily with (security_invoker = true) as
  select user_id, day, 'ungranted'::text as app, minutes::int as active_minutes, done::int as items_done, null::int as items_planned,
         null::int as streak_current, 'x'::text as headline, now() as updated_at from trading_fx;
revoke all on ungranted_dashboard_daily from authenticated;
create view taskflow_dashboard_area_daily with (security_invoker = true) as select user_id, day, minutes from trading_fx;
create view my_app_dashboard_daily with (security_invoker = true) as
  select user_id, day, 'my_app'::text as app, minutes::int as active_minutes, done::int as items_done, null::int as items_planned,
         null::int as streak_current, 'x'::text as headline, now() as updated_at from trading_fx;
grant select on badcols_dashboard_daily, wrongtype_dashboard_daily, nosec_dashboard_daily, taskflow_dashboard_area_daily, my_app_dashboard_daily to authenticated;
\i :schema
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('6 views with wrong column order, wrong type, no security_invoker or no grant are NOT in the union',
  (select count(*) from os_daily_activity where app in ('badcols','wrongtype','nosec','ungranted')) = 0);
select ostest.ok('6 ...and health reports each reason',
  (select not columns_ok from os_contract_health where view = 'badcols_dashboard_daily')
  and (select not columns_ok from os_contract_health where view = 'wrongtype_dashboard_daily')
  and (select columns_ok and not access_ok from os_contract_health where view = 'nosec_dashboard_daily')
  and (select columns_ok and not access_ok from os_contract_health where view = 'ungranted_dashboard_daily')
  and (select bool_and(not in_unions) from os_contract_health where app in ('badcols','wrongtype','nosec','ungranted')));
select ostest.ok('6 taskflow_dashboard_area_daily and a key with an underscore are not treated as apps',
  not exists (select 1 from os_contract_health where view like '%area%' or app like 'my%')
  and (select count(*) from os_daily_activity where app = 'my_app') = 0);
select ostest.ok('6 valid sources are unaffected by the bad ones', (select count(*) from os_daily_activity) = 5);
reset role;

-- ── 7. isolation and write rules for settings ─────────────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false) as _ \gset
select ostest.ok('7 B cannot see A''s settings', (select count(*) from os_settings) = 0);
update os_settings set daily_goal_minutes = 5;
select ostest.ok('7 B cannot change A''s settings', (select count(*) from os_settings) = 0);
do $$ begin
  begin insert into os_settings (user_id) values (current_setting('ostest.a')::uuid); raise exception 'B wrote a row for A';
  exception when insufficient_privilege then null; end;
end $$;
select ostest.ok('7 B cannot insert a row owned by A', true);
insert into os_settings default values;
select ostest.ok('7 B gets their own row', (select count(*) from os_settings) = 1);
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('7 A''s goal is untouched', (select daily_goal_minutes from os_settings) = 240);
reset role;
set role anon;
do $$ begin
  begin perform 1 from os_settings; raise exception 'anon read settings'; exception when insufficient_privilege then null; end;
  begin perform 1 from os_daily_activity; raise exception 'anon read the union'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select ostest.ok('7 anon is refused', true);

-- ── 8. idempotent, keeps data, recovers after a source disappears ─────────────────────────────────────────────────
select pg_get_viewdef('os_daily_activity'::regclass) as def_before \gset
select count(*) as settings_before from os_settings \gset
\i :schema
\i :schema
select ostest.ok('8 re-running changes no view definition and loses no settings',
  pg_get_viewdef('os_daily_activity'::regclass) = :'def_before' and (select count(*) from os_settings) = :settings_before);
do $$ begin
  begin execute 'drop view demo_dashboard_daily'; raise exception 'dropped a view the union depends on';
  exception when dependent_objects_still_exist then null; end;
end $$;
select ostest.ok('8 a source the union uses cannot be dropped by accident (apps must use create or replace)', true);
drop view demo_dashboard_daily cascade;
\i :schema
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) as _ \gset
select ostest.ok('8 after a forced drop, re-running rebuilds the unions without it',
  (select count(*) from os_daily_activity where app = 'demo') = 0 and (select count(*) from os_daily_activity) = 4
  and (select not exists from os_contract_health where view = 'demo_dashboard_daily')
  and (select exists from os_contract_health where view = 'demo_dashboard_now'));
reset role;
