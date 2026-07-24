# ourtracks

**Live: [ourtracks.gitignore.space](https://ourtracks.gitignore.space)**

A shared map of places and the songs that belong to them. Drop a pin where
something happened, attach the Spotify track that was playing, add photos and a
few words, and it stays there.

Built for a closed circle — you, your wife, a couple of friends. Anyone can sign
in, but only invited addresses see anything.

## Where things live

| What | Where |
| --- | --- |
| Site | <https://ourtracks.gitignore.space> (Vercel, auto-deploys from `main`) |
| Database, auth, files | Supabase project `ourtracks` (`chcbaljzzodlripqqbpl`, Frankfurt) |
| Google sign-in | Google Cloud project `ourtracks` → Auth Platform |
| GitHub sign-in | not wired up yet — see "Known gaps" |

## Inviting someone

Two steps, both required:

```sql
-- 1. Supabase SQL editor: let them past the door
insert into public.circle_invites (email, note) values ('their@gmail.com', 'who they are');
```

2. Google Cloud → **Auth Platform → Audience → Test users → Add users**: the same
   address. While the consent screen is in *Testing*, Google turns away anyone
   who is not on that list. The cap is 100 people, which is 96 more than we need.

If they signed in before being invited, flip the flag once by hand:

```sql
update public.profiles set is_member = true where email = 'their@gmail.com';
```

## Known gaps

- **GitHub sign-in is a dead button.** The OAuth app exists
  (`github.com/settings/applications/3751038`) but issuing its client secret
  needs a phone confirmation, so Supabase has no credentials for it yet. Until
  then the button will error. Google works.
- **A Yandex address is not a Google account.** `unikorn.crazy@yandex.by` is on
  both allowlists, but Google sign-in only works if that address is registered
  as a Google account. If it is not, the simplest fix is inviting her Gmail
  instead, or finishing GitHub sign-in, or adding e-mail magic links.
- **The old Google client secret** (the one created with the client, ending
  `sWQp`) is unused and unreadable. Delete it in Google Cloud → Clients →
  ourtracks web once you have confirmed sign-in works.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Nuxt 4 | Same stack as AutoHQ, nothing new to learn |
| Database, auth, files | Supabase | Google/GitHub login, Postgres, Storage and realtime in one box |
| Map | MapLibre GL + CARTO basemap | Free vector maps, no API key anywhere |
| Styling | Tailwind 4 | |
| Music | Spotify oEmbed + embed player | We store a link, never audio |
| Place names | OpenStreetMap Nominatim | Free search and reverse lookup |

No paid service, no API key, no card on file. The only account you need is Supabase.

## Setup from scratch

Already done for the live instance — kept here for a rebuild, or for a second
copy of the project.

### 1. Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**. Pick the region closest to
   Brest (Frankfurt).
2. **Project Settings → Data API** and **API Keys**: copy the project URL and the
   `anon` public key into `.env`:

   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_KEY=eyJhbGciOi...
   ```

### 2. Create the schema

Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it.
It creates the tables, the security policies, the photo bucket and the
allowlist, and seeds your own e-mail as the first member.

To invite someone later:

```sql
insert into public.circle_invites (email, note) values ('her@gmail.com', 'wife');
```

If they already signed in before being invited, flip the flag by hand once:

```sql
update public.profiles set is_member = true where email = 'her@gmail.com';
```

### 3. Turn on the logins

**Authentication → Sign In / Providers**:

- **Google** — enable it, then create an OAuth client at
  <https://console.cloud.google.com> → APIs & Services → Credentials → OAuth client ID
  → Web application. Put the callback URL that Supabase shows you into
  *Authorised redirect URIs*, and paste the client id and secret back into Supabase.
- **GitHub** — enable it, then <https://github.com/settings/developers> → New OAuth App,
  same callback URL, paste id and secret back.

**Authentication → URL Configuration**: set *Site URL* to `http://localhost:3000`
while developing, and add your deployed address to *Redirect URLs* later.

### 4. Run it

```bash
npm install
npm run dev
```

Node 20 or newer. On this machine: `nvm use 22.16.0`.

## How it fits together

```
app/
  pages/index.vue        the whole screen: map, panels, filters
  pages/login.vue        Google / GitHub buttons
  components/
    TheMap.client.vue    MapLibre wrapper, markers, click-to-place
    PinPanel.vue         reading a memory
    PinEditor.vue        writing one
    SpotifyEmbed.vue     the player iframe
    PhotoGallery.vue     thumbnails + lightbox
    TopBar.vue           search, author filter, account menu
  composables/
    usePins.ts           load / create / update / delete + realtime
    usePhotos.ts         upload, downscale, sign, delete
    useMembership.ts     is this person in the circle
server/api/
  spotify.get.ts         resolve a pasted link into id + title + cover
  geocode.get.ts         place search
  reverse-geocode.get.ts coordinates to a place name
shared/utils/spotify.ts  link parsing, shared by client and server
supabase/schema.sql      tables, policies, storage, realtime
```

## Things worth knowing

- **We never host audio.** A pin stores a Spotify link and the cover art their
  public oEmbed endpoint returns. Playback happens inside Spotify's own iframe,
  which means listeners without Premium hear a 30-second preview. That is
  Spotify's rule and there is no legal way around it.
- **Photos are private.** The Storage bucket is not public; the app hands out
  signed links that expire after an hour.
- **The database, not the interface, decides who sees what.** Every table has row
  level security, and every policy runs through `public.is_member()`. Hiding a
  button would not have been enough.
- **Photos are downscaled in the browser** to 2000px on the long edge before
  upload, so the free 1 GB lasts.
