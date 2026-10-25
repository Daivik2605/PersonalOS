-- Stand-in app views, shaped like each app's contract. Test-only. ostest.make_app(key, with_extra) creates
-- <key>_fx (table), <key>_dashboard_daily and <key>_dashboard_now, secured and granted like a real app.
create function ostest.make_app(p_key text, p_extra boolean default true) returns void language plpgsql as $f$
begin
  execute format($t$create table %1$I (user_id uuid not null references auth.users(id), day date not null, minutes int not null, done int not null)$t$, p_key || '_fx');
  execute format('alter table %I enable row level security', p_key || '_fx');
  execute format($t$create policy "own rows" on %I for all to authenticated using (user_id = auth.uid())$t$, p_key || '_fx');
  execute format($v$create view %1$I with (security_invoker = true) as
    select user_id, day, %2$L::text as app, minutes::int as active_minutes, done::int as items_done, null::int as items_planned,
           null::int as streak_current, (done || ' done')::text as headline, now() as updated_at %3$s
    from %4$I$v$, p_key || '_dashboard_daily', p_key, case when p_extra then ', 7 as an_extra_column' else '' end, p_key || '_fx');
  execute format($v$create view %1$I with (security_invoker = true) as
    select user_id, %2$L::text as app, 1 as contract_version, 'status'::text as status_line, count(*)::int as needs_attention,
           'things'::text as attention_label, max(day)::timestamptz as last_activity_at, now() as updated_at %3$s
    from %4$I group by user_id$v$, p_key || '_dashboard_now', p_key, case when p_extra then ', 3 as another_extra' else '' end, p_key || '_fx');
  execute format('grant select on %I, %I, %I to authenticated', p_key || '_fx', p_key || '_dashboard_daily', p_key || '_dashboard_now');
end $f$;

create function ostest.add_row(p_key text, p_user uuid, p_day date) returns void language plpgsql as $f$
begin
  execute format('insert into %I (user_id, day, minutes, done) values (%L, %L, 30, 2)', p_key || '_fx', p_user, p_day);
end $f$;
