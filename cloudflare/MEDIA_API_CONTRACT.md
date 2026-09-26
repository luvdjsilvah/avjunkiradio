# AV Junki Radio Cloudflare media Worker

`worker.js` is a single-file replacement for the current `av-junki-radio-admin-api`
Worker. It includes the existing station drop and music routes, the media routes
used by `radio.js` and `admin/index.html`, and additive D1 schema updates.

## Deploy together

1. Create a long, random secret named `ADMIN_API_TOKEN` in the Worker's settings.
   Keep its value out of GitHub and the Worker source. Enter that same value in
   the admin page's **Admin API key** field when making changes. The page holds
   the key in memory for that tab only.
2. Retain the existing `DB` D1 binding and `AUDIO_BUCKET` R2 binding. Videos,
   images, MP3s, and drops all use that R2 bucket; no new bucket is required.
3. Replace the current deployed Worker with `worker.js`. On first request it
   adds `artwork_key` to existing music and drop tables, `pool` to drop records,
   and creates image ad, video, and pending-upload tables. Existing records and
   drop slot defaults are preserved.
4. Publish `admin/index.html` and `radio.js` from the same branch once the
   Worker and secret are ready. Until both sides are published, new controls
   will call routes the old Worker does not have.
5. Run `node --test cloudflare/worker.test.mjs` before publishing. Then test a
   real upload and playback in a browser using the actual Cloudflare bindings.

All mutating `/api/` requests require `Authorization: Bearer <ADMIN_API_TOKEN>`.
Missing secrets fail closed with HTTP 503. Public music, drop, image ad, and
video reads do not require the key. CORS allows the admin Authorization header,
and R2 stream responses support byte ranges for seeking and video playback.

## Media endpoints

| Read | Write |
| --- | --- |
| `GET /api/music`, `GET /api/music/:id/audio`, `GET /api/music/:id/artwork` | `POST /api/music/upload` (MP3, genre, duration, enabled, optional artwork), `POST /api/music/:id/artwork`, `PATCH /api/music/:id` (enabled) |
| `GET /api/drops`, `GET /api/audio/:slot`, `GET /api/drops/:slot/artwork` | `POST /api/drops/:slot/upload` (MP3, duration, pool, optional artwork), `POST /api/drops/:slot/artwork`, `PATCH /api/drops/:slot` (pool) |
| `GET /api/image-ads`, `GET /api/image-ads/:id/image` | `POST /api/image-ads/upload` (image, title, pool, enabled), `PATCH /api/image-ads/:id` (enabled) |
| `GET /api/videos`, `GET /api/videos/:id/stream`, `GET /api/videos/:id/thumbnail` | `POST /api/videos/uploads`, `PUT /api/videos/uploads/:id/parts/:number`, `POST /api/videos/uploads/:id/complete`, `POST /api/videos/:id/thumbnail` |

Pool values are `jazz`, `nightlife` (shared by Hip Hop, R&B, and House),
`reggae`, and `gospel`. The video form takes one MP4 or WebM with embedded audio
and splits its upload into 10 MiB R2 multipart requests. Pending uploads expire
after 24 hours when next accessed. Thumbnail and artwork files are optional.

The radio's Web Audio graph applies EQ, compression, and limiting in the
listener's browser. It is a listening-time chain; uploads are not permanently
normalized, and the Worker does not transcode video or analyze LUFS. Audio
mastering still needs a separate processing service if measured broadcast
loudness is required across devices.
