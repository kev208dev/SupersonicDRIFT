create table if not exists public.app_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from public.app_migrations
    where id = 'add-13s-to-existing-records-2026-05-27'
  ) then
    update public.leaderboard_records
    set lap_ms = least(1800000, lap_ms + 13000),
        updated_at = floor(extract(epoch from now()) * 1000)::bigint;

    insert into public.app_migrations (id)
    values ('add-13s-to-existing-records-2026-05-27');
  end if;
end $$;
