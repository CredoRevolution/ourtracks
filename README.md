# ourtracks

A shared map of places and the songs that belong to them. Drop a pin where
something happened, attach the Spotify track that was playing, add photos and a
few words, and it stays there.

Built for a closed circle — you, your wife, a couple of friends. Anyone can sign
in, but only invited addresses see anything.

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

## Setup

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
