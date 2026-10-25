-- Scenarios for os_core.sql PART 2 (os_tag_daily, os_productive_daily, os_streak, os_week). Run by run-local.sh on its OWN
-- fresh database, with -v schema=<path>. Every check prints PASSED or aborts. Streak scenarios are relative to today in Toronto.
\set U1 '10000000-0000-0000-0000-000000000001'
\set U2 '10000000-0000-0000-0000-000000000002'
\set U3 '10000000-0000-0000-0000-000000000003'
\set U4 '10000000-0000-0000-0000-000000000004'
\set U5 '10000000-0000-0000-0000-000000000005'
\set U6 '10000000-0000-0000-0000-000000000006'
\set U7 '10000000-0000-0000-0000-000000000007'
\set U8 '10000000-0000-0000-0000-000000000008'
\set U9 '10000000-0000-0000-0000-000000000009'
insert into auth.users (id) values (:'U1'), (:'U2'), (:'U3'), (:'U4'), (:'U5'), (:'U6'), (:'U7'), (:'U8'), (:'U9');

create function ostest.today() returns date language sql stable as $$ select (now() at time zone 'America/Toronto')::date $$;
-- minutes of an app's own measurement (trading_fx / dsa_fx made by ostest.make_app)
create function ostest.app_min(p_key text, p_user uuid, p_day date, p_min int) returns void language plpgsql as $f$
begin execute format('insert into %I (user_id, day, minutes, done) values (%L, %L, %s, 1)', p_key || '_fx', p_user, p_day, p_min); end $f$;

-- ── P1. no TaskFlow at all: app minutes only ─────────────────────────────────────────────────────────────────────
select ostest.make_app('trading') as _ \gset
select ostest.make_app('dsa') as _ \gset
select ostest.app_min('trading', :'U2', '2026-10-20', 30) as _ \gset
select ostest.app_min('dsa', :'U2', '2026-10-20', 45) as _ \gset
\i :schema
\i :schema
select ostest.ok('P1 runs twice cleanly with no TaskFlow views', true);
select ostest.ok('P1 os_tag_daily has the documented columns, tag_path last',
  (select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'os_tag_daily'::regclass and attnum > 0)
  = 'user_id,day,parent_tag,tag,kind,app_key,minutes,source,tag_path');
select ostest.ok('P1 no TaskFlow: app minutes only, as Study/<label> rows with source app',
  (select count(*) from os_tag_daily where user_id = :'U2') = 2
  and (select minutes = 30 and parent_tag = 'Study' and tag = 'Trading' and tag_path = 'Study/Trading' and kind = 'study' and source = 'app' and app_key = 'trading'
       from os_tag_daily where user_id = :'U2' and app_key = 'trading')
  and (select minutes = 45 and tag = 'DSA' and tag_path = 'Study/DSA' from os_tag_daily where user_id = :'U2' and app_key = 'dsa'));
select ostest.ok('P1 productive = 75 and not a day off', (select minutes = 75 and not is_day_off from os_productive_daily where user_id = :'U2'));
select ostest.ok('P1 optional TaskFlow views are reported as not existing and unused',
  (select bool_and(not exists and not columns_ok and not in_use) from os_optional_health) and (select count(*) from os_optional_health) = 2);
select ostest.ok('P1 os_week: per-app sums and productive minutes, no TaskFlow or Money metrics',
  (select value = 30 from os_week where user_id = :'U2' and app = 'trading' and metric = 'active_minutes')
  and (select value = 75 from os_week where user_id = :'U2' and app = 'os' and metric = 'productive_minutes')
  and (select count(*) from os_week where app in ('taskflow', 'money')) = 0);

-- ── P2. TaskFlow publishes: max-rule ─────────────────────────────────────────────────────────────────────────────
create table tf_area_fx (user_id uuid not null, day date not null, parent_tag text not null, tag text not null, tag_path text not null,
                         kind text not null, app_key text, minutes int not null);
create table tf_off_fx (user_id uuid not null, day date not null, kind text not null default 'rest', label text);
create table tf_daily_fx (user_id uuid not null, day date not null, active_minutes int not null default 0, items_done int not null default 0,
                          work_minutes int, sleep_minutes int, mood numeric, cigarettes int);
create view taskflow_dashboard_area_daily with (security_invoker = true) as
  select user_id, day, parent_tag, tag, tag_path, kind, app_key, minutes from tf_area_fx;
create view taskflow_dashboard_days_off with (security_invoker = true) as select user_id, day, kind, label from tf_off_fx;
create view taskflow_dashboard_daily with (security_invoker = true) as
  select user_id, day, 'taskflow'::text as app, active_minutes, items_done, null::int as items_planned, null::int as streak_current,
         'tf'::text as headline, now() as updated_at, work_minutes, sleep_minutes, mood, cigarettes from tf_daily_fx;
create view taskflow_dashboard_now with (security_invoker = true) as
  select user_id, 'taskflow'::text as app, 1 as contract_version, 'tf'::text as status_line, 0 as needs_attention, null::text as attention_label,
         null::timestamptz as last_activity_at, now() as updated_at from tf_daily_fx group by user_id;
alter table tf_area_fx enable row level security; alter table tf_off_fx enable row level security; alter table tf_daily_fx enable row level security;
create policy "own rows" on tf_area_fx for all to authenticated using (user_id = auth.uid());
create policy "own rows" on tf_off_fx for all to authenticated using (user_id = auth.uid());
create policy "own rows" on tf_daily_fx for all to authenticated using (user_id = auth.uid());
grant select on tf_area_fx, tf_off_fx, tf_daily_fx, taskflow_dashboard_area_daily, taskflow_dashboard_days_off, taskflow_dashboard_daily, taskflow_dashboard_now to authenticated;

-- U1: D1 = DSA 40 (TaskFlow) + Cert 30, DSA app 55, trading app 30 (trading has no TaskFlow tag)
insert into tf_area_fx values
  (:'U1', '2026-10-20', 'Study', 'DSA',  'Study/DSA',  'study',    'dsa', 40),
  (:'U1', '2026-10-20', 'Study', 'Cert', 'Study/Cert', 'study',    null,  30),
  (:'U1', '2026-10-20', 'Work',  'Oland','Work/Oland', 'work',     null,  450),
  (:'U1', '2026-10-20', 'Break', 'Break','Break',      'break',    null,  20),
  -- D2: TaskFlow 70 beats the app's 55
  (:'U1', '2026-10-21', 'Study', 'DSA',  'Study/DSA',  'study',    'dsa', 70),
  -- D4: only Cert in TaskFlow; DSA app minutes go under the linked tag (known from other days)
  (:'U1', '2026-10-23', 'Study', 'Cert', 'Study/Cert', 'study',    null,  25),
  (:'U1', '2026-10-23', 'Hustle','Projects','Hustle/Projects','hustle', null, 15),
  -- an archived tag that still carries the app_key, long ago: the most recently used tag is the linked one
  (:'U1', '2026-10-01', 'Study', 'OldDSA','Study/OldDSA','study',   'dsa', 10);
select ostest.app_min('dsa',     :'U1', '2026-10-20', 55) as _ \gset
select ostest.app_min('trading', :'U1', '2026-10-20', 30) as _ \gset
select ostest.app_min('dsa',     :'U1', '2026-10-21', 55) as _ \gset
select ostest.app_min('dsa',     :'U1', '2026-10-22', 50) as _ \gset
select ostest.app_min('dsa',     :'U1', '2026-10-23', 20) as _ \gset
-- TaskFlow's own daily number must NOT be added on top:
insert into tf_daily_fx (user_id, day, active_minutes) values (:'U1', '2026-10-20', 70);
-- U2 has TaskFlow tags too but different numbers (isolation)
insert into tf_area_fx values (:'U2', '2026-10-20', 'Study', 'DSA', 'Study/DSA', 'study', 'dsa', 10);

\i :schema
\i :schema
select ostest.ok('P2 runs twice cleanly with TaskFlow views', true);
select ostest.ok('P2 optional TaskFlow views are valid and in use',
  (select bool_and(exists and columns_ok and access_ok and in_use) from os_optional_health));
select ostest.ok('P2 max-rule: TaskFlow Study/DSA 40 + DSA app 55 = 55 (source max), not 95',
  (select minutes = 55 and source = 'max' and tag = 'DSA' and parent_tag = 'Study' and tag_path = 'Study/DSA' from os_tag_daily where user_id = :'U1' and day = '2026-10-20' and tag_path = 'Study/DSA'));
select ostest.ok('P2 the unlinked Cert tag keeps its TaskFlow minutes', (select minutes = 30 and source = 'taskflow' from os_tag_daily where user_id = :'U1' and day = '2026-10-20' and tag_path = 'Study/Cert'));
select ostest.ok('P2 trading minutes with no TaskFlow tag appear as Study/Trading (parent Study, tag Trading)',
  (select minutes = 30 and source = 'app' and parent_tag = 'Study' and tag = 'Trading' and tag_path = 'Study/Trading' and kind = 'study'
   from os_tag_daily where user_id = :'U1' and day = '2026-10-20' and app_key = 'trading'));
select ostest.ok('P2 TaskFlow wins when it measured more (70 vs 55 stays 70)',
  (select minutes = 70 and source = 'taskflow' from os_tag_daily where user_id = :'U1' and day = '2026-10-21' and tag_path = 'Study/DSA'));
select ostest.ok('P2 app minutes on a day with no TaskFlow row go under the linked tag (not OldDSA, not Study/DSA-label)',
  (select minutes = 50 and source = 'app' and tag = 'DSA' and tag_path = 'Study/DSA' from os_tag_daily where user_id = :'U1' and day = '2026-10-22' and app_key = 'dsa'));
select ostest.ok('P2 app minutes on a day where TaskFlow logged other tags only go under the linked tag as their own row',
  (select count(*) = 1 and bool_and(minutes = 20 and source = 'app' and tag_path = 'Study/DSA') from os_tag_daily where user_id = :'U1' and day = '2026-10-23' and app_key = 'dsa'));
select ostest.ok('P2 the archived tag with the same app_key is just a normal TaskFlow row',
  (select minutes = 10 and source = 'taskflow' from os_tag_daily where user_id = :'U1' and tag_path = 'Study/OldDSA'));
select ostest.ok('P2 productive day totals: study + hustle only (work and break excluded), TaskFlow''s own daily row not added',
  (select minutes = 55 + 30 + 30 from os_productive_daily where user_id = :'U1' and day = '2026-10-20')
  and (select minutes = 70 from os_productive_daily where user_id = :'U1' and day = '2026-10-21')
  and (select minutes = 50 from os_productive_daily where user_id = :'U1' and day = '2026-10-22')
  and (select minutes = 25 + 15 + 20 from os_productive_daily where user_id = :'U1' and day = '2026-10-23'));
select ostest.ok('P2 another user''s numbers are separate (U2: TaskFlow DSA 10 raised to the app''s 45, plus trading 30)',
  (select minutes = 45 + 30 from os_productive_daily where user_id = :'U2' and day = '2026-10-20')
  and (select minutes = 45 and source = 'max' from os_tag_daily where user_id = :'U2' and tag_path = 'Study/DSA'));

-- ── P3. streak ───────────────────────────────────────────────────────────────────────────────────────────────────
-- U3: T-6..T-4 productive, T-3 day off (0), T-2..T productive  -> current 6 (days off bridge)
select ostest.app_min('trading', :'U3', ostest.today() - n, 30) as _ from generate_series(0, 6) n where n <> 3;
insert into tf_off_fx (user_id, day) values (:'U3', ostest.today() - 3);
-- U4: T-3..T-1 productive, today nothing -> current 3 (today at 0 does not break)
select ostest.app_min('trading', :'U4', ostest.today() - n, 30) as _ from generate_series(1, 3) n;
-- U5: T-5..T-3, T-2 missed, T-1 productive, today nothing -> current 1, longest 3
select ostest.app_min('trading', :'U5', ostest.today() - n, 30) as _ from generate_series(1, 5) n where n <> 2;
-- U6: T-5..T-3 then nothing since -> yesterday missed -> current 0, longest 3
select ostest.app_min('trading', :'U6', ostest.today() - n, 30) as _ from generate_series(3, 5) n;
-- U7: T-3 productive, T-2 day off WITH 40 productive minutes (must not extend), T-1, T productive -> current 3
select ostest.app_min('trading', :'U7', ostest.today() - n, 30) as _ from generate_series(0, 3) n where n <> 2;
select ostest.app_min('trading', :'U7', ostest.today() - 2, 40) as _ \gset
insert into tf_off_fx (user_id, day) values (:'U7', ostest.today() - 2);
-- U8: today only -> current 1
select ostest.app_min('trading', :'U8', ostest.today(), 30) as _ \gset
-- U1..U2 had old activity only (Oct 2026 fixtures): not asserted.
select ostest.ok('P3 days off bridge a streak: 6 productive days across a day off = 6',
  (select "current" = 6 and longest = 6 and last_productive_day = ostest.today() from os_streak where user_id = :'U3'));
select ostest.ok('P3 today at 0 does not break the streak (yesterday''s run still counts)',
  (select "current" = 3 and longest = 3 and last_productive_day = ostest.today() - 1 from os_streak where user_id = :'U4'));
select ostest.ok('P3 a missed day breaks it: current 1, longest 3',
  (select "current" = 1 and longest = 3 from os_streak where user_id = :'U5'));
select ostest.ok('P3 yesterday at 0 means current 0 (today not yet over cannot save it), longest kept',
  (select "current" = 0 and longest = 3 and last_productive_day = ostest.today() - 3 from os_streak where user_id = :'U6'));
select ostest.ok('P3 minutes on a day off neither extend nor break: T-3, (off), T-1, T = 3',
  (select "current" = 3 and longest = 3 from os_streak where user_id = :'U7'));
select ostest.ok('P3 a streak that began today is 1', (select "current" = 1 and longest = 1 from os_streak where user_id = :'U8'));
select ostest.ok('P3 a user with no productive days has no streak row', (select count(*) from os_streak where user_id = :'U9') = 0);
select ostest.ok('P3 os_streak columns', (select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'os_streak'::regclass and attnum > 0)
  = 'user_id,current,longest,last_productive_day');

-- ── P4. week across the November DST change, week start, TaskFlow and Money extras ───────────────────────────────────
-- Trading minutes for U9: Fri 10-30 30, Sat 10-31 30, Sun 11-01 (clocks go back) 30, Mon 11-02 60
select ostest.app_min('trading', :'U9', d::date, m) as _ from (values ('2026-10-30', 30), ('2026-10-31', 30), ('2026-11-01', 30), ('2026-11-02', 60)) v(d, m);
insert into tf_daily_fx (user_id, day, active_minutes, work_minutes, sleep_minutes, mood, cigarettes) values
  (:'U9', '2026-10-30', 0, 480, 420, 3, 4), (:'U9', '2026-10-31', 0, 0, 0, null, 2), (:'U9', '2026-11-01', 0, 0, 500, 5, 1), (:'U9', '2026-11-02', 0, 450, 460, 4, 3);
create table money_fx (user_id uuid not null, day date not null, in_cents int, out_cents int, essential_out_cents int, discretionary_out_cents int, smoking_out_cents int);
alter table money_fx enable row level security; create policy "own rows" on money_fx for all to authenticated using (user_id = auth.uid());
create view money_dashboard_daily with (security_invoker = true) as
  select user_id, day, 'money'::text as app, 0 as active_minutes, 1 as items_done, null::int as items_planned, null::int as streak_current,
         'm'::text as headline, now() as updated_at, out_cents, in_cents, essential_out_cents, discretionary_out_cents, smoking_out_cents from money_fx;
create view money_dashboard_now with (security_invoker = true) as
  select user_id, 'money'::text as app, 1 as contract_version, 'm'::text as status_line, 0 as needs_attention, null::text as attention_label,
         null::timestamptz as last_activity_at, now() as updated_at from money_fx group by user_id;
grant select on money_fx, money_dashboard_daily, money_dashboard_now to authenticated;
insert into money_fx values (:'U9', '2026-11-02', 100000, 4000, 3000, 1000, 500), (:'U9', '2026-11-03', 0, 1000, 600, 400, 0), (:'U9', '2026-10-30', 0, 2500, 2500, 0, 0);
\i :schema
select ostest.ok('P4 Monday weeks across the DST change: Oct 26 week = 90, Nov 2 week = 60',
  (select value = 90 from os_week where user_id = :'U9' and app = 'os' and metric = 'productive_minutes' and week_start = '2026-10-26')
  and (select value = 60 from os_week where user_id = :'U9' and app = 'os' and metric = 'productive_minutes' and week_start = '2026-11-02')
  and (select count(*) from os_week where user_id = :'U9' and app = 'os' and metric = 'productive_minutes') = 2);
select ostest.ok('P4 week_start is always on the chosen weekday (Monday = dow 1)', (select bool_and(extract(dow from week_start) = 1) from os_week));
insert into os_settings (user_id, week_starts_on) values (:'U9', 0);
select ostest.ok('P4 Sunday weeks: Oct 25 week = 60, Nov 1 week = 90',
  (select value = 60 from os_week where user_id = :'U9' and app = 'os' and metric = 'productive_minutes' and week_start = '2026-10-25')
  and (select value = 90 from os_week where user_id = :'U9' and app = 'os' and metric = 'productive_minutes' and week_start = '2026-11-01'));
delete from os_settings where user_id = :'U9';
select ostest.ok('P4 TaskFlow extras: sums for work/cigarettes, averages for sleep (zero-sleep days skipped) and mood',
  (select value = 480 from os_week where user_id = :'U9' and app = 'taskflow' and metric = 'work_minutes' and week_start = '2026-10-26')
  and (select value = 7 from os_week where user_id = :'U9' and app = 'taskflow' and metric = 'cigarettes' and week_start = '2026-10-26')   -- 4 + 2 + 1
  and (select value = (420 + 500) / 2.0 from os_week where user_id = :'U9' and app = 'taskflow' and metric = 'sleep_minutes' and week_start = '2026-10-26')
  and (select value = 4 from os_week where user_id = :'U9' and app = 'taskflow' and metric = 'mood' and week_start = '2026-10-26')   -- (3 + 5) / 2
  and (select value = 450 from os_week where user_id = :'U9' and app = 'taskflow' and metric = 'work_minutes' and week_start = '2026-11-02'));
select ostest.ok('P4 a TaskFlow column the view does not have (weed, energy) is not invented',
  (select count(*) from os_week where app = 'taskflow' and metric in ('weed', 'energy', 'tasks_missed')) = 0);
select ostest.ok('P4 Money: weekly sums and net = in - out',
  (select value = 100000 from os_week where user_id = :'U9' and app = 'money' and metric = 'in_cents' and week_start = '2026-11-02')
  and (select value = 5000 from os_week where user_id = :'U9' and app = 'money' and metric = 'out_cents' and week_start = '2026-11-02')
  and (select value = 95000 from os_week where user_id = :'U9' and app = 'money' and metric = 'net_cents' and week_start = '2026-11-02')
  and (select value = -2500 from os_week where user_id = :'U9' and app = 'money' and metric = 'net_cents' and week_start = '2026-10-26')
  and (select value = 500 from os_week where user_id = :'U9' and app = 'money' and metric = 'smoking_out_cents' and week_start = '2026-11-02'));
select ostest.ok('P4 a day with an off-day marker and no minutes is counted as a day off',
  (select value = 1 from os_week where user_id = :'U3' and app = 'os' and metric = 'days_off'));

-- ── P5. isolation, anon, idempotency ─────────────────────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', :'U1', false) as _ \gset
select ostest.ok('P5 user U1 sees only their own rows in every part-2 view',
  (select count(*) from os_tag_daily where user_id <> :'U1') = 0 and (select count(*) from os_productive_daily where user_id <> :'U1') = 0
  and (select count(*) from os_week where user_id <> :'U1') = 0 and (select count(*) from os_streak where user_id <> :'U1') = 0
  and (select count(*) from os_tag_daily) > 0);
select set_config('request.jwt.claim.sub', :'U3', false) as _ \gset
select ostest.ok('P5 user U3 sees only their own streak', (select count(*) from os_streak) = 1 and (select "current" = 6 from os_streak));
reset role;
select ostest.ok('P5 anon has no access to any part-2 object',
  not has_table_privilege('anon', 'os_tag_daily', 'select') and not has_table_privilege('anon', 'os_productive_daily', 'select')
  and not has_table_privilege('anon', 'os_streak', 'select') and not has_table_privilege('anon', 'os_week', 'select')
  and not has_table_privilege('anon', 'os_optional_health', 'select'));
select pg_get_viewdef('os_tag_daily'::regclass) as d1, pg_get_viewdef('os_week'::regclass) as d2, pg_get_viewdef('os_streak'::regclass) as d3 \gset
select count(*) as n_settings_before from os_settings \gset
\i :schema
select ostest.ok('P5 re-running changes no part-2 definition',
  pg_get_viewdef('os_tag_daily'::regclass) = :'d1' and pg_get_viewdef('os_week'::regclass) = :'d2' and pg_get_viewdef('os_streak'::regclass) = :'d3');
do $$ begin
  begin execute 'drop view taskflow_dashboard_area_daily'; raise exception 'dropped a view os_tag_daily depends on';
  exception when dependent_objects_still_exist then null; end;
end $$;
select ostest.ok('P5 ...a plain drop of taskflow_dashboard_area_daily is blocked', true);

-- ── P6. an invalid area_daily (no tag_path) is skipped and reported ──────────────────────────────────────────────
drop view taskflow_dashboard_area_daily cascade;
create view taskflow_dashboard_area_daily with (security_invoker = true) as
  select user_id, day, parent_tag, tag, kind, app_key, minutes from tf_area_fx;
grant select on taskflow_dashboard_area_daily to authenticated;
\i :schema
select ostest.ok('P6 area_daily without tag_path is invalid: reported, not used',
  (select exists and not columns_ok and not in_use from os_optional_health where view = 'taskflow_dashboard_area_daily'));
select ostest.ok('P6 ...so os_tag_daily falls back to app minutes only (U1 has no TaskFlow rows any more)',
  (select count(*) from os_tag_daily where user_id = :'U1' and source <> 'app') = 0 and (select count(*) from os_tag_daily where user_id = :'U1') > 0);
select ostest.ok('P6 ...and the other optional view (days off) still works', (select columns_ok and in_use from os_optional_health where view = 'taskflow_dashboard_days_off'));
select ostest.ok('P6 ...and the streak views still exist (os_streak was dropped by the cascade, then rebuilt by the re-run)', (select "current" = 6 from os_streak where user_id = :'U3'));
