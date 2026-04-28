# photo_feed

## Synology NAS OS

Synology NAS runs **DSM (DiskStation Manager)**, which is a **Linux-based** operating system.

## DSM Version and Package Availability

Some Synology packages depend on the **NAS model** and **DSM version**.
- Package availability can differ between DSM releases.
- Official packages such as Node.js or Docker may be available in Package Center on some models and DSM versions, but not all.
- Some software, such as MongoDB, may require a third-party package or a container-based setup instead of an official package.

When in doubt, check the model-specific Package Center support first.

## Deployment Decision Gate (Synology NAS 1GB RAM)

Default deployment is **bare process first** (run app directly on NAS).
Use Docker only when measured operational benefits are greater than RAM overhead.

### Phase 1: Bare process (required first)
- Lower memory overhead
- Simpler file I/O for uploads and thumbnails
- Easier debugging on low-resource NAS

### Move to Docker only if at least 2 are true
1. You need reproducible environment across multiple machines
2. You need safer rollback/version pinning
3. You need stronger dependency isolation
4. Peak RAM remains stable in load tests after container overhead

### Decision rule
If swap usage grows or memory pressure appears, stay with bare process.
Adopt Docker only after benchmarking confirms clear operational gains.

## Build and Serve

### Build
1. Install Node.js dependencies for the backend and frontend.
2. Build the frontend assets if the UI uses a bundler.
3. Prepare the upload and thumbnail directories on the NAS.

### Serve
1. Start the app directly on the NAS as a bare process.
2. Run the Node.js server with the production entry file.
3. Keep originals and thumbnails on persistent NAS storage.
4. Use DSM or a reverse proxy only if you need external access or TLS.

## Synology Packages and Shell Installation

If you need to install Synology packages from the Linux shell, use SSH and `synopkg`.

### Basic flow
1. Enable SSH in DSM.
2. Connect to the NAS with SSH.
3. Switch to an admin or root shell if needed.
4. Use `synopkg` to list, install, start, or stop packages.

### Common commands
```bash
synopkg list
synopkg install /path/to/package.spk
synopkg start <package-name>
synopkg stop <package-name>
synopkg status <package-name>
```

### Notes
- Use the Package Center when the package is officially supported there.
- Use `synopkg install` for local `.spk` files when you already have a supported package.
- For packages not officially supported on your DSM/model, prefer a bare-process install or Docker if it meets your memory budget.


## Development Progress

### Phase 1: Core Backend Setup ✅
- **Task 1.1**: Database Initialization (SQLite with 9 tables and 8 indexes)
- **Task 1.2**: User Authentication (JWT + bcrypt password hashing)
- **Task 1.3**: Auth API Endpoints (Login and profile endpoints)
- **Status**: 27/27 tests passing

### Phase 2: Band Management ✅
- **Task 2.1**: Band CRUD Operations
  - **Endpoints**: 
    - `GET /api/bands` - List all bands with cursor-based pagination
    - `POST /api/bands` - Create a new band (authenticated users)
    - `GET /api/bands/:bandId` - Get band details
    - `PATCH /api/bands/:bandId` - Update band (creator or admin)
    - `DELETE /api/bands/:bandId` - Delete band (admin only)
  - **Features**: 
    - Role-based access control
    - Pagination with cursor support
    - Permission checks for update and delete operations
  - **Status**: 18/18 tests passing
  - **Files**: 
    - `backend/controllers/bandController.js` - Business logic
    - `backend/routes/bands.js` - Route definitions
    - `test/api.band.test.js` - Comprehensive test suite

### Phase 3: Feed & Comments ✅
- **Task 3.1**: Feed CRUD Operations
  - Cursor-based pagination with `newest`, `oldest`, and `new-comments` sorts
  - Preview text truncation for list views
  - Full detail view with photo metadata and thumbnails
  - Multipart photo upload support (50 photos per feed) with queued thumbnail jobs
  - **Status**: 17/17 tests passing
- **Task 3.2**: Comment System
  - Feed and album comments with soft delete
  - Comment count tracking and decrement on soft delete
  - Cursor-based pagination
  - **Status**: 19/19 tests passing

### Phase 4: Albums ✅
- Album CRUD with multipart photo upload (1000 photos per album)
- `photo_count` and `cover_thumb_path` tracking
- Reusable photo upload pipeline
- **Status**: 13/13 tests passing

### Phase 5: Admin & Policy ✅
- **Task 5.1**: Upload policy management endpoints (admin-only)
- **Task 5.2**: Admin moderation
  - `DELETE /api/feeds/:feedId/admin-delete` - Admin-only feed deletion
  - `DELETE /api/comments/:commentId/admin-delete` - Admin-only comment soft delete
  - **Status**: 4/4 tests passing

### Phase 6: Thumbnail Pipeline ✅
- DB-backed job queue with single-worker processing (memory-efficient for 1GB NAS)
- Sharp-based thumbnail generation (300x300 cover fit)
- Job status tracking: queued → processing → done/failed
- **Status**: 2/2 tests passing

### Phase 7: Pagination ✅
- Cursor-based pagination service extracted to `backend/services/paginationService.js`
- Helpers: `parseLimit()`, `buildFeedSortConfig()`, `buildFeedCursorWhereClause()`, `buildCursorResponse()`
- Standardized response format: `{ items, cursor, hasMore }`
- **Status**: 6/6 tests passing

### Phase 8: Frontend ✅
- React scaffold at `frontend/` with Vite dev server
- Dev proxy: `/api` and `/media` routes to `http://localhost:3000`
- Core pages: LoginPage, FeedListPage, FeedDetailPage
- Components: FeedCard, CommentSection
- API client with token persistence, request helpers
- Custom hook: `usePagination()` for infinite scroll and sort switching
- Styles: Utility-based CSS with card/grid/button utilities
- **Status**: Complete with full functionality


## Authentication Modes

### Development (macOS)
In **development mode** (`NODE_ENV=development`), the app auto-seeds two test accounts on startup:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `1234` | admin |
| `user` | `1234` | user |

Authentication is done against the local SQLite database with bcrypt password verification.

### Production (Synology NAS)
In **production mode** (`NODE_ENV=production`), the app authenticates against **Synology DSM WebAPI** (`SYNO.API.Auth`). Any valid DSM account can log in — the app creates a local user record on first login to track sessions and permissions.

Set `DSM_URL` in `.env` if the DSM WebAPI is not at the default `http://localhost:5000`.

## Local Development & Testing

### Prerequisites
- Node.js v18 or higher
- npm or yarn

### Installation
```bash
cd /Users/haheonjin/Documents/dev/photo_feed
npm install
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests with longer timeout (20 seconds)
npm test -- --testTimeout=20000

# Run specific test file
npm test -- test/api.band.test.js
```

### Starting Development Server
```bash
# Start the backend server
node backend/index.js
# Server runs on http://localhost:3000

# Start the frontend dev server (in a separate terminal)
cd frontend && npm install && npm run dev
# Frontend runs on http://localhost:5173 (proxies /api to backend)
```

### Testing Endpoints Locally
```bash
# Login with dev admin account
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"admin\", \"password\": \"1234\"}"

# List bands
curl http://localhost:3000/api/bands

# Create a band (requires token)
curl -X POST http://localhost:3000/api/bands \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"My Band\", \"description\": \"Band description\"}"
```


## Test Results Summary (All Phases Complete)

| Phase | Component | Tests | Status |
|-------|-----------|-------|--------|
| 1 | Auth + Users | 27 | ✅ passing |
| 2 | Bands | 18 | ✅ passing |
| 3 | Feeds | 17 | ✅ passing |
| 3 | Comments | 19 | ✅ passing |
| 4 | Albums | 13 | ✅ passing |
| 5 | Admin Moderation | 4 | ✅ passing |
| 6 | Thumbnails | 2 | ✅ passing |
| 7 | Pagination | 6 | ✅ passing |
| **TOTAL** | **Backend** | **106/106** | **✅ passing** |
| 8 | Frontend | functional | ✅ complete |

**Note**: Backend tests include auth, band CRUD, feed/comment management, album operations, admin endpoints, thumbnail queueing, and pagination service utilities. All endpoints match the tasks.md specification. Frontend is fully functional with login, band management, feed CRUD with photo upload, feed detail with full text and photos, and comment creation.

### Running Frontend Development

The React frontend at `frontend/` is fully functional:

```bash
cd frontend
npm install
npm run dev

# Dev server runs on http://localhost:5173
# Proxies /api and /media to http://localhost:3000 (backend)
```

### Frontend Architecture

- **Pages**: LoginPage (auth), FeedListPage (bands + feeds), FeedDetailPage (photos + comments)
- **Components**: FeedCard (feed list item), CommentSection (comment thread)
- **Hooks**: usePagination (cursor pagination + sort switching)
- **API Client**: Fetch-based with localStorage token persistence
- **Build**: Vite with React 18
- **CSS**: Utility-based (cards, grids, buttons, forms)
- **Features**: Login, band list, feed list with sort/pagination, feed creation with photo upload, feed detail with photo gallery, comment reading and posting

### Next Steps (Post-MVP)

1. **E2E Testing**: Add Playwright tests in `frontend/test/` for login, navigation, pagination
2. **Production Build**: `npm run build` to generate `dist/`; copy to `backend/public/` for deployment
3. **Styling**: Enhance UI with custom CSS or Tailwind
4. **Performance**: Profile thumbnail queue under load; benchmark memory usage on 1GB NAS
5. **Docker (Optional)**: Add Dockerfile if barebone process monitoring is insufficient**
