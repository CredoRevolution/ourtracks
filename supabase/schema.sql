-- ============================================================================
--  ourtracks — full database schema
--  Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.
--  Safe to re-run: everything is written with "if not exists" / "or replace".
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. The allowlist
--     A shared map is only shared with the people we invite. Anyone can click
--     "Sign in with Google", but only e-mails listed here become members and
--     get to see or create pins. Everyone else lands on a polite waiting room.
-- ----------------------------------------------------------------------------
create table if not exists public.circle_invites (
  email      text primary key,
  note       text,
  invited_at timestamptz not null default now()
);

comment on table public.circle_invites is
  'Allowlist of e-mails permitted into the circle. Add a row to invite someone.';

-- Seed yourself. Change this to the address you actually sign in with,
-- then add one row per person you invite.
insert into public.circle_invites (email, note)
values ('nikita1997miki@gmail.com', 'owner')
on conflict (email) do nothing;


-- ----------------------------------------------------------------------------
--  2. Profiles
--     One row per signed-in user, mirroring auth.users with the bits we want to
--     display (name, avatar) plus the membership flag.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  is_member    boolean not null default false,
  created_at   timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
--  3. Pins — a place, a memory, and the song attached to it
-- ----------------------------------------------------------------------------
create table if not exists public.pins (
  id             uuid primary key default gen_random_uuid(),
  -- Points at profiles rather than auth.users on purpose: the API can only
  -- join a pin to its author when the foreign key lands on a table it can see.
  author_id      uuid not null references public.profiles(id) on delete cascade,

  title          text not null,
  note           text,

  lat            double precision not null,
  lng            double precision not null,
  place_label    text,

  -- Spotify: we never store audio, only a pointer to the track plus the
  -- metadata their public oEmbed endpoint hands back (title + cover art).
  spotify_url    text,
  spotify_id     text,
  spotify_kind   text,          -- track | album | playlist | episode
  spotify_title  text,
  spotify_thumb  text,

  happened_on    date,          -- when the memory happened, not when it was typed
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint pins_lat_range check (lat between -90 and 90),
  constraint pins_lng_range check (lng between -180 and 180),
  constraint pins_title_not_blank check (length(btrim(title)) > 0)
);

create index if not exists pins_author_id_idx  on public.pins (author_id);
create index if not exists pins_created_at_idx on public.pins (created_at desc);


-- ----------------------------------------------------------------------------
--  4. Photos attached to a pin
--     The file itself lives in Storage; this table only remembers its path
--     and the order the photos should appear in.
-- ----------------------------------------------------------------------------
create table if not exists public.pin_photos (
  id           uuid primary key default gen_random_uuid(),
  pin_id       uuid not null references public.pins(id) on delete cascade,
  storage_path text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists pin_photos_pin_id_idx on public.pin_photos (pin_id, sort_order);


-- ----------------------------------------------------------------------------
--  5. Keep updated_at honest
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pins_touch_updated_at on public.pins;
create trigger pins_touch_updated_at
  before update on public.pins
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
--  6. Create a profile automatically on sign-up
--     Google and GitHub put the name/avatar in different keys, so we try each.
--     Membership is decided here, once, against the allowlist.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, is_member)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(coalesce(new.email, 'someone@unknown'), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    exists (
      select 1 from public.circle_invites ci
      where lower(ci.email) = lower(new.email)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
--  7. is_member() — the single gate every policy leans on
--     SECURITY DEFINER so that reading profiles from inside a profiles policy
--     does not send Postgres into infinite recursion.
-- ----------------------------------------------------------------------------
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_member from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;


-- ----------------------------------------------------------------------------
--  8. Row Level Security
--     Nothing is readable without a session, and nothing is readable by a
--     signed-in stranger who is not on the allowlist.
-- ----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.pins           enable row level security;
alter table public.pin_photos     enable row level security;
alter table public.circle_invites enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles readable by the circle" on public.profiles;
create policy "profiles readable by the circle"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_member());

drop policy if exists "own profile is editable" on public.profiles;
create policy "own profile is editable"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ...but nobody promotes themselves into the circle from the client.
revoke update (is_member, email, id) on public.profiles from authenticated;

-- pins ----------------------------------------------------------------------
drop policy if exists "members see every pin" on public.pins;
create policy "members see every pin"
  on public.pins for select
  to authenticated
  using (public.is_member());

drop policy if exists "members add their own pins" on public.pins;
create policy "members add their own pins"
  on public.pins for insert
  to authenticated
  with check (public.is_member() and author_id = auth.uid());

drop policy if exists "authors edit their own pins" on public.pins;
create policy "authors edit their own pins"
  on public.pins for update
  to authenticated
  using (author_id = auth.uid() and public.is_member())
  with check (author_id = auth.uid());

drop policy if exists "authors delete their own pins" on public.pins;
create policy "authors delete their own pins"
  on public.pins for delete
  to authenticated
  using (author_id = auth.uid() and public.is_member());

-- pin_photos ----------------------------------------------------------------
drop policy if exists "members see every photo" on public.pin_photos;
create policy "members see every photo"
  on public.pin_photos for select
  to authenticated
  using (public.is_member());

drop policy if exists "authors attach photos to their pins" on public.pin_photos;
create policy "authors attach photos to their pins"
  on public.pin_photos for insert
  to authenticated
  with check (
    public.is_member()
    and exists (
      select 1 from public.pins p
      where p.id = pin_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "authors remove photos from their pins" on public.pin_photos;
create policy "authors remove photos from their pins"
  on public.pin_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.pins p
      where p.id = pin_id and p.author_id = auth.uid()
    )
  );

-- circle_invites -------------------------------------------------------------
-- Deliberately no policies: the table is invisible to the client and is only
-- ever touched by you in the SQL editor or by the SECURITY DEFINER trigger.


-- ----------------------------------------------------------------------------
--  9. Storage bucket for photos
--     Private bucket. The app hands out short-lived signed links instead of
--     leaving family photos on a public URL forever.
--     Layout: pin-photos/<user-id>/<pin-id>/<file>.jpg
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pin-photos',
  'pin-photos',
  false,
  10485760,                                        -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read pin photos" on storage.objects;
create policy "members read pin photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pin-photos' and public.is_member());

drop policy if exists "members upload into their own folder" on storage.objects;
create policy "members upload into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pin-photos'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members delete from their own folder" on storage.objects;
create policy "members delete from their own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ----------------------------------------------------------------------------
--  10. Live updates
--      With this, a pin your wife drops in Brest shows up on your screen
--      without a refresh.
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.pins;
exception
  when duplicate_object then null;
end
$$;
