# Plan 2 — Implementation Plan

> Based on: original `plan2.md` features + current codebase state (React + Express/SQLite)

---

## Feature 1 — Photo Albums (Cross-linking with Feeds)

### Goal
- Each band has independent **albums** and **feeds**.
- Photos can live in both places simultaneously; deleting from one does **not** affect the other.
- When uploading to a feed → easy "Save to Album" flow.
- When uploading to an album → easy "Post to Feed" flow.

---

### Current state
- `feed_photos` and `album_photos` are separate tables.
- `unique_photos` table already exists (hash-based dedup).
- Albums page exists with list + detail view.
- No cross-linking buttons exist yet.

---

### Schema changes

#### Choice A — How to track cross-links

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A1 (Recommended)** | Store `unique_photo_id` in both `feed_photos` and `album_photos` | Clean FK, easy to query cross-refs | Requires schema migration |
| A2 | Match by `original_path` string equality | No migration | Fragile if paths change |

> **Decision:** A1.


**Schema migration (A1):**
```sql
ALTER TABLE feed_photos  ADD COLUMN unique_photo_id INTEGER REFERENCES unique_photos(id);
ALTER TABLE album_photos ADD COLUMN unique_photo_id INTEGER REFERENCES unique_photos(id);
```

---

### Backend API — New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/feeds/:feedId/photos/to-album` | Feed photos → add to album |
| `POST` | `/api/albums/:albumId/photos/to-feed` | Album photos → post to feed |

**`POST /api/feeds/:feedId/photos/to-album` body:**
```json
{
  "photoIds": [1, 2, 3],
  "albumId": 5,          // existing album (optional)
  "newAlbumTitle": "Summer"  // OR create new album
}
```

**`POST /api/albums/:albumId/photos/to-feed` body:**
```json
{
  "photoIds": [1, 2, 3],
  "feedId": 10,              // existing feed (optional)
  "newFeedText": "Check this out"  // OR create new feed
}
```

#### Choice B — "Post to Feed" from album

| Option | Description |
|--------|-------------|
| B1 | Always create a new feed |
| **B2 (Recommended)** | Let user pick: new feed OR append to an existing feed |

> **Decision:** B2.


---

### Frontend changes

- **`FeedDetailPage.jsx`**: Add "Select" toggle → checkboxes on photos → "💾 Save to Album" action bar.
- **`AlbumDetailView`**: Same selection → "📤 Post to Feed" action bar.
- **New `PhotoSelectGrid.jsx`**: Shared photo grid with selection mode (used in both pages).
- **New `CrossLinkModal.jsx`**: Modal for "Save to Album" / "Post to Feed" flows.

### Deletion independence
- Delete from feed → removes `feed_photos` row only (file untouched).
- Delete from album → removes `album_photos` row only (file untouched).
- File on disk deleted only when no `feed_photos` or `album_photos` reference it.

---

### Implementation steps (Feature 1)

**Backend:**
- [ ] Schema migration: add `unique_photo_id` to `feed_photos` + `album_photos`
- [ ] Update `uploadService.js`: set `unique_photo_id` on photo insert
- [ ] Add `POST /api/feeds/:feedId/photos/to-album` controller + route
- [ ] Add `POST /api/albums/:albumId/photos/to-feed` controller + route

**Frontend:**
- [ ] Create `PhotoSelectGrid.jsx`
- [ ] Create `CrossLinkModal.jsx`
- [ ] Wire into `FeedDetailPage.jsx`
- [ ] Wire into `AlbumsPage.jsx` AlbumDetailView
- [ ] Update `api.js` with two new API functions

---

## Feature 2 — Photo Preview Lightbox

### Goal
- Click a photo in a feed → full-screen lightbox overlay with the original image.
- Swipe left/right (or arrow keys) to navigate all photos in that feed.
- Close with `Esc` or click outside.

---

### New component: `PhotoLightbox.jsx`

Props: `photos[]`, `initialIndex`, `onClose`

Features:
- `createPortal` into `document.body` (same pattern as `SearchModal`).
- Fullscreen dark overlay (`position: fixed; inset: 0; z-index: 9999`).
- `object-fit: contain` centered image.
- Previous/Next buttons.
- Keyboard: `←`/`→` navigate, `Esc` close.
- Touch swipe: `touchstart`/`touchend` delta.

#### Choice C — Navigation UI

| Option | Description |
|--------|-------------|
| **C1 (Recommended)** | Thumbnail strip at bottom for quick jump |
| C2 | Counter only ("3 / 12") |

> **Decision:** C2.

#### Choice D — Loading UX

| Option | Description |
|--------|-------------|
| **D1 (Recommended)** | Show blurred thumbnail, crossfade to original when loaded |
| D2 | Show spinner while original loads |

> **Decision:** Anything light and fast. maybe D2? or D3.

---

### Implementation steps (Feature 2)

- [ ] Create `PhotoLightbox.jsx` with keyboard + swipe support
- [ ] Replace `<a href>` with `<button onClick>` in `FeedDetailPage.jsx`
- [ ] Add lightbox to `AlbumDetailView`
- [ ] Add lightbox CSS to `styles.css`

---

## Feature 3 — Thumbnails for Fast Loading

### Goal
- Feed list cards show thumbnail images (not originals).
- Thumbnail pipeline already exists (DB queue + single Sharp worker); fix edge cases.

---

### Current state

| Location | Behavior |
|----------|----------|
| Feed list card | Shows `photo_count` number, no thumbnails |
| Feed detail | `thumb_path \|\| original_path` — OK |
| Album detail | `thumb_path \|\| original_path` — OK |

---

### Choice E — Thumbnail timing

| Option | Description |
|--------|-------------|
| **E1 (Current, Recommended)** | Async: upload returns fast, thumbnail generated in background |
| E2 | Sync: upload waits for thumbnail | Slow, bad for 1GB NAS |

> **Decision:** E1.

### Choice F — Thumbnail size

| Option | Size |
|--------|------|
| **F1 (Recommended)** | 400px square (one size, NAS RAM constraint) |
| F2 | Two sizes: 400px grid + 800px lightbox |
| F3 | 800px only |

> **Decision:** F1

### Choice G — Feed card photo display

| Option | Description |
|--------|-------------|
| G1 | First photo only |
| **G2 (Recommended, from plan.md)** | Up to 3 thumbnails per feed card |
| G3 | Count number only |

> **Decision:** G2

---

### Implementation steps (Feature 3)

**Backend:**
- [ ] Feed list API: include `thumb_path` for first 3 photos per feed in response

**Frontend:**
- [ ] `FeedCard.jsx`: render up to 3 thumbnails; spinner placeholder for `thumb_path: null`
- [ ] Add `loading="lazy"` to all list-view `<img>` tags
- [ ] Lightbox: load `original_path` only when opened

---

## Summary of Decisions Needed

| # | Choice | Options | Recommendation |
|---|--------|---------|----------------|
| A | Cross-link tracking | A1 (FK) / A2 (path match) | **A1** |
| B | Post-to-feed UX | B1 (new feed) / B2 (pick or create) | **B2** |
| C | Lightbox nav UI | C1 (thumbnail strip) / C2 (counter) | **C1** |
| D | Lightbox loading | D1 (blur+crossfade) / D2 (spinner) | **D1** |
| E | Thumbnail timing | E1 (async) / E2 (sync) | **E1** |
| F | Thumbnail size | F1 (400px) / F2 (400+800px) / F3 (800px) | **F1** |
| G | Feed card photos | G1 (1) / G2 (3) / G3 (count) | **G2** |

---

## Suggested Implementation Order

```
Feature 3 (thumbnails)    → fix existing UX quickly
        ↓
Feature 2 (lightbox)      → builds on stable photo display
        ↓
Feature 1 (cross-linking) → depends on lightbox + photo model
```

---

## Files to Create / Modify

| File | Action | Feature |
|------|--------|---------|
| `backend/schema.sql` | Add `unique_photo_id` columns | 1 |
| `backend/services/uploadService.js` | Set `unique_photo_id` on insert | 1 |
| `backend/controllers/feedController.js` | Add to-album endpoint + 3-thumb list response | 1, 3 |
| `backend/controllers/albumController.js` | Add to-feed endpoint | 1 |
| `backend/routes/feeds.js` | Register new route | 1 |
| `backend/routes/albums.js` | Register new route | 1 |
| `frontend/src/components/PhotoSelectGrid.jsx` | **New** | 1 |
| `frontend/src/components/CrossLinkModal.jsx` | **New** | 1 |
| `frontend/src/components/PhotoLightbox.jsx` | **New** | 2 |
| `frontend/src/pages/FeedDetailPage.jsx` | Selection mode + lightbox | 1, 2 |
| `frontend/src/pages/AlbumsPage.jsx` | Selection mode + lightbox | 1, 2 |
| `frontend/src/components/FeedCard.jsx` | Up to 3 thumbnails + lazy | 3 |
| `frontend/src/api.js` | Cross-link API functions | 1 |
| `frontend/src/styles.css` | Lightbox + selection CSS | 2, 3 |