-- PersonalOS integration checks. Paste into Supabase → SQL Editor → Run.
-- Read-only. Every query should return ZERO rows except the last two (which are summaries).
-- Known prefixes: os_, trading_, dsa_, taskflow_, timer_, jobs_, habit_, money_

-- 1. Tables or views in public without a known app prefix
select c.relname as object, case c.relkind when 'r' then 'table' when 'v' then 'view' end as kind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v')
  and c.relname !~ '^(os|trading|dsa|taskflow|timer|jobs|habit|money|sql|cert)_';

-- 2. Tables with Row Level Security OFF
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3. Tables with RLS on but no policy (nobody could read them through the app)
select c.relname as table_without_policy
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);

-- 4. Tables missing a user_id column
select c.relname as table_without_user_id
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not exists (select 1 from information_schema.columns i
                  where i.table_schema = 'public' and i.table_name = c.relname and i.column_name = 'user_id');

-- 5. Views NOT using security_invoker (these would bypass RLS)
select c.relname as view_without_security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o
                  where o ~* '^security_invoker=(true|on|1)$');

-- 6. *_dashboard_daily views whose first 9 columns don't match docs/CONTRACT.md
with expected(pos, col) as (values (1,'user_id'),(2,'day'),(3,'app'),(4,'active_minutes'),(5,'items_done'),
                                   (6,'items_planned'),(7,'streak_current'),(8,'headline'),(9,'updated_at')),
views as (select table_name from information_schema.views where table_schema='public' and table_name like '%\_dashboard\_daily')
select v.table_name, e.pos, e.col as expected, i.column_name as actual
from views v cross join expected e
left join information_schema.columns i on i.table_schema='public' and i.table_name=v.table_name and i.ordinal_position=e.pos
where i.column_name is distinct from e.col;

-- 7. *_dashboard_now views whose first 8 columns don't match docs/CONTRACT.md
with expected(pos, col) as (values (1,'user_id'),(2,'app'),(3,'contract_version'),(4,'status_line'),(5,'needs_attention'),
                                   (6,'attention_label'),(7,'last_activity_at'),(8,'updated_at')),
views as (select table_name from information_schema.views where table_schema='public' and table_name like '%\_dashboard\_now')
select v.table_name, e.pos, e.col as expected, i.column_name as actual
from views v cross join expected e
left join information_schema.columns i on i.table_schema='public' and i.table_name=v.table_name and i.ordinal_position=e.pos
where i.column_name is distinct from e.col;

-- 8. Storage buckets without an app prefix
select id as bucket_without_prefix from storage.buckets
where id !~ '^(os|trading|dsa|taskflow|timer|jobs|habit|money|sql|cert)-';

-- 9. SUMMARY: objects per app
select split_part(c.relname, '_', 1) as app,
       count(*) filter (where c.relkind='r') as tables,
       count(*) filter (where c.relkind='v') as views
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v')
group by 1 order by 1;

-- 10. SUMMARY: does each app publish both dashboard views?
select a.app,
       exists (select 1 from information_schema.views where table_schema='public' and table_name = a.app || '_dashboard_daily') as has_daily,
       exists (select 1 from information_schema.views where table_schema='public' and table_name = a.app || '_dashboard_now')   as has_now
from (values ('trading'),('dsa'),('taskflow'),('jobs'),('money'),('sql'),('cert')) a(app);
