-- 음원재생기: Supabase SQL Editor에서 한 번 실행
-- 1) 사용자별 설정(버튼 목록·색·모양) 한 줄
create table if not exists public.player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.player_state enable row level security;

drop policy if exists "player_state own" on public.player_state;
create policy "player_state own" on public.player_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.player_state to authenticated;

-- 2) 음원 파일 저장소(비공개, 파일 하나 50MB까지, 본인 폴더만)
insert into storage.buckets (id, name, public, file_size_limit)
values ('player-audio', 'player-audio', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "player-audio own read" on storage.objects;
drop policy if exists "player-audio own insert" on storage.objects;
drop policy if exists "player-audio own delete" on storage.objects;

create policy "player-audio own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "player-audio own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "player-audio own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-audio' and (storage.foldername(name))[1] = auth.uid()::text);
