# MVP API 범위 및 최소 스키마 설계 (Synology NAS 1GB)

> 기준: 현재 서버 시작점(`index.js`)에서 확장하는 MVP 범위
> 목표: **가볍게 시작** + 이후 확장 가능

## 0) 확정 결정사항

- 권한 범위: **B** (관리자 = 모더레이션 + 밴드 정책 변경)
  - 가능: 게시물/댓글 모더레이션, 밴드 정책 변경(업로드 정책 포함)
  - 제외: 사용자 제재(정지/차단)는 MVP 범위 밖(Phase 2)
- 프론트엔드 전략: **C** (하이브리드 점진 전환)
  - MVP는 경량 화면부터 시작
  - 고상호작용 화면부터 React를 점진 도입
  - 비핵심 화면은 단순 구조로 유지하여 메모리/빌드 오버헤드 최소화

## 1) MVP API 범위

### 공통
- Base URL: `/api`
- 인증: `Authorization: Bearer <JWT>`
- 역할: `admin`, `user`
- 페이징: cursor 기반 (`limit`, `cursor`)

### Auth
- `POST /api/auth/login`
  - 입력: `{ username, password }`
  - 출력: `{ accessToken, user }`
- `GET /api/auth/me`
  - 출력: `{ id, username, role, createdAt }`

### User
- `GET /api/users/:id`
  - 출력: 공개 프로필 최소 정보

### Band
- `GET /api/bands`
  - 설명: 모든 사용자에게 밴드 목록 공개
- `POST /api/bands`
  - 권한: `admin|user`
  - 입력: `{ name, description? }`
- `GET /api/bands/:bandId`
- `PATCH /api/bands/:bandId`
  - 권한: 생성자 또는 `admin`
- `DELETE /api/bands/:bandId`
  - 권한: `admin`

### Admin Upload Policy
- `GET /api/admin/upload-policy`
  - 권한: `admin`
  - 설명: 현재 업로드 정책(개수/용량/MIME) 조회
- `PATCH /api/admin/upload-policy`
  - 권한: `admin`
  - 입력 예시:
    - `{ feedMaxPhotos, albumMaxPhotos, maxFileSizeMB, allowedMimeTypes }`
  - 설명: 서버 강제 업로드 제한 정책 변경

### Feed
- `GET /api/bands/:bandId/feeds?sort=newest|oldest|new-comments&limit=20&cursor=...`
  - 응답: 요약 텍스트(`previewText`) + 썸네일 중심 (목록 전용)
  - 원칙: 본문 전체(`text`)와 원본 이미지(`original_path`)는 목록에서 제외
- `POST /api/bands/:bandId/feeds`
  - 권한: `admin|user`
  - 입력: `multipart/form-data` (`text`, `photos[]`)
  - 제한: 사진 최대 **50장**
- `GET /api/feeds/:feedId`
  - 응답: 전체 본문 + 원본/썸네일 경로 (상세 전용)
  - 원칙: 상세 클릭 시에만 본문/원본 로드

### Album
- `GET /api/bands/:bandId/albums?limit=20&cursor=...`
- `POST /api/bands/:bandId/albums`
  - 권한: `admin|user`
  - 입력: `multipart/form-data` (`title`, `description?`, `photos[]`)
  - 제한: 사진 최대 **1000장**
- `GET /api/albums/:albumId`

### Comment
- `GET /api/comments?targetType=feed|album&targetId=:id&limit=50&cursor=...`
- `POST /api/comments`
  - 입력: `{ targetType: "feed"|"album", targetId, content }`
- `PATCH /api/comments/:commentId`
  - 권한: 작성자 또는 `admin`
- `DELETE /api/comments/:commentId`
  - 권한: 작성자 또는 `admin`

---

## 2) 최소 데이터 스키마 (핵심 5개)

아래는 SQLite 기준 최소 컬럼입니다.

## `users`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 사용자 ID |
| username | TEXT | UNIQUE NOT NULL | 로그인 ID |
| password_hash | TEXT | NOT NULL | 비밀번호 해시 |
| role | TEXT | NOT NULL CHECK(role IN ('admin','user')) | 권한 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 수정일 |

## `bands`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 밴드 ID |
| name | TEXT | NOT NULL | 밴드명 |
| description | TEXT | NULL | 설명 |
| created_by | INTEGER | NOT NULL FK users(id) | 생성자 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 수정일 |

## `feeds`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 피드 ID |
| band_id | INTEGER | NOT NULL FK bands(id) | 소속 밴드 |
| author_id | INTEGER | NOT NULL FK users(id) | 작성자 |
| text | TEXT | NOT NULL | 본문 |
| preview_text | TEXT | NOT NULL | 미리보기 텍스트(첫 몇 줄) |
| photo_count | INTEGER | NOT NULL DEFAULT 0 | 첨부 사진 수(최대 50) |
| comment_count | INTEGER | NOT NULL DEFAULT 0 | 댓글 수 캐시 |
| last_commented_at | TEXT | NULL | 최근 댓글 시각 (`new-comments` 정렬용) |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 수정일 |

## `albums`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 앨범 ID |
| band_id | INTEGER | NOT NULL FK bands(id) | 소속 밴드 |
| author_id | INTEGER | NOT NULL FK users(id) | 작성자 |
| title | TEXT | NOT NULL | 앨범명 |
| description | TEXT | NULL | 설명 |
| photo_count | INTEGER | NOT NULL DEFAULT 0 | 사진 수(최대 1000) |
| cover_thumb_path | TEXT | NULL | 커버 썸네일 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 수정일 |

## `comments`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 댓글 ID |
| author_id | INTEGER | NOT NULL FK users(id) | 작성자 |
| target_type | TEXT | NOT NULL CHECK(target_type IN ('feed','album')) | 대상 타입 |
| target_id | INTEGER | NOT NULL | 대상 ID |
| content | TEXT | NOT NULL | 댓글 본문 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 수정일 |
| deleted_at | TEXT | NULL | 소프트 삭제 |

---

## 3) 보조 테이블 (업로드 기능에 사실상 필수)

> 핵심 5개만으로는 "여러 사진 업로드"를 정규화하기 어렵기 때문에, 아래 2개를 함께 권장합니다.

## `feed_photos`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 사진 ID |
| feed_id | INTEGER | NOT NULL FK feeds(id) | 피드 ID |
| original_path | TEXT | NOT NULL | 원본 경로 |
| thumb_path | TEXT | NOT NULL | 썸네일 경로 |
| width | INTEGER | NULL | 원본 너비 |
| height | INTEGER | NULL | 원본 높이 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 정렬 순서 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |

## `album_photos`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 사진 ID |
| album_id | INTEGER | NOT NULL FK albums(id) | 앨범 ID |
| original_path | TEXT | NOT NULL | 원본 경로 |
| thumb_path | TEXT | NOT NULL | 썸네일 경로 |
| width | INTEGER | NULL | 원본 너비 |
| height | INTEGER | NULL | 원본 높이 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 정렬 순서 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 생성일 |

## `upload_policies`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK (항상 1) | 단일 정책 레코드 |
| feed_max_photos | INTEGER | NOT NULL DEFAULT 50 | 피드당 최대 사진 수 |
| album_max_photos | INTEGER | NOT NULL DEFAULT 1000 | 앨범당 최대 사진 수 |
| max_file_size_mb | INTEGER | NOT NULL DEFAULT 20 | 파일 1개당 최대 용량(MB) |
| allowed_mime_types | TEXT | NOT NULL | 허용 MIME(JSON 문자열) |
| updated_by | INTEGER | NULL FK users(id) | 마지막 수정 관리자 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 마지막 수정 시각 |

## `thumbnail_jobs`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 작업 ID |
| target_type | TEXT | NOT NULL CHECK(target_type IN ('feed_photo','album_photo')) | 대상 타입 |
| target_id | INTEGER | NOT NULL | 대상 사진 ID |
| status | TEXT | NOT NULL CHECK(status IN ('queued','processing','done','failed')) DEFAULT 'queued' | 작업 상태 |
| attempts | INTEGER | NOT NULL DEFAULT 0 | 재시도 횟수 |
| error_message | TEXT | NULL | 실패 사유 |
| queued_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 큐 등록 시각 |
| started_at | TEXT | NULL | 처리 시작 시각 |
| finished_at | TEXT | NULL | 처리 완료 시각 |

> 권장 기본 MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
> 
> 운영 안정성을 위해 서버에서 상한 가드도 권장:
> - `feed_max_photos <= 200`
> - `album_max_photos <= 5000`
> - `max_file_size_mb <= 50`

---

## 4) 인덱스 (MVP 필수)

- `CREATE INDEX idx_feeds_band_created ON feeds(band_id, created_at DESC);`
- `CREATE INDEX idx_feeds_band_created_id ON feeds(band_id, created_at DESC, id DESC);`
- `CREATE INDEX idx_feeds_band_last_comment ON feeds(band_id, last_commented_at DESC);`
- `CREATE INDEX idx_feeds_band_last_comment_id ON feeds(band_id, last_commented_at DESC, id DESC);`
- `CREATE INDEX idx_albums_band_created ON albums(band_id, created_at DESC);`
- `CREATE INDEX idx_comments_target ON comments(target_type, target_id, created_at DESC);`
- `CREATE INDEX idx_feed_photos_feed ON feed_photos(feed_id, sort_order);`
- `CREATE INDEX idx_album_photos_album ON album_photos(album_id, sort_order);`

> 피드 정렬/커서 안정성을 위해 `(..., id)` 타이브레이커 인덱스를 함께 사용합니다.

---

## 5) 서버 검증 규칙 (MVP)

- 업로드 제한
  - 서버는 `upload_policies` 값을 **반드시 강제**
  - 피드: `photo_count <= feed_max_photos` (기본 50)
  - 앨범: `photo_count <= album_max_photos` (기본 1000)
- MIME 검증 (서버 강제)
  - 업로드 파일의 실제 MIME이 `allowed_mime_types`에 포함되어야 함
  - 확장자만 신뢰하지 않고 서버에서 MIME 재검증
- 용량 검증 (서버 강제)
  - 파일 1개당 `size_mb <= max_file_size_mb` 검증
  - 요청 전체 `Content-Length` 상한도 별도로 적용 권장
- 댓글 대상 검증
  - `target_type='feed'`면 `feeds.id` 존재 확인
  - `target_type='album'`면 `albums.id` 존재 확인
- 권한
  - 생성: 로그인 사용자 모두 허용
  - 수정/삭제: 작성자 또는 `admin`
  - 업로드 정책 변경: `admin`만 허용
- 성능
  - 목록 API는 본문 전체/원본 이미지 미포함 (요약/썸네일만 반환)
  - 상세 API에서만 본문/원본 이미지 반환

## 6) 썸네일 파이프라인 정책 (MVP)

- 처리 방식
  - 썸네일 생성은 `thumbnail_jobs` DB 큐를 통해 비동기 처리
  - 워커 동시성은 기본 **1(단일 워커)** 로 고정하여 1GB RAM 환경의 메모리 급증 방지
- 저장 경로 분리 (서버 강제)
  - 원본: `/data/originals/...`
  - 썸네일: `/data/thumbnails/...`
  - DB에는 `original_path`, `thumb_path`를 각각 저장
- API 반환 원칙
  - 목록 API: 썸네일 경로 우선 반환
  - 상세 API: 원본 경로 포함 반환
- 장애 처리
  - 실패 시 `status='failed'`, `attempts` 증가, 제한 횟수 내 재시도
  - 실패 작업은 관리자 점검 대상

---

## 7) 정렬 규칙 정의

- `newest`: `created_at DESC, id DESC`
- `oldest`: `created_at ASC, id ASC`
- `new-comments`: `COALESCE(last_commented_at, created_at) DESC, id DESC`

## 8) 커서 페이지네이션 고정 전략 (Feed)

- 오프셋(`OFFSET`) 기반이 아니라 커서 기반을 **고정 사용**
- 정렬별 커서 키
  - `newest`: `(created_at, id)`
  - `oldest`: `(created_at, id)`
  - `new-comments`: `(COALESCE(last_commented_at, created_at), id)`
- 커서는 마지막 아이템의 정렬 키를 직렬화(base64/json)해 전달
- 다음 페이지 조회 시 정렬 키 비교 연산으로 이어 조회
  - 예: `newest`는 `(created_at, id) < (:cursorCreatedAt, :cursorId)`
- 위 전략은 [인덱스 섹션](schema.md#L205)과 반드시 함께 적용

## 9) 정렬별 커서 SQL 예시 (SQLite)

- 공통 파라미터
  - `:bandId`, `:limit`
  - `:cursorCreatedAt`, `:cursorId`, `:cursorSortAt` (정렬 타입에 따라 사용)

### newest (첫 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at
FROM feeds
WHERE band_id = :bandId
ORDER BY created_at DESC, id DESC
LIMIT :limit;
```

### newest (다음 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at
FROM feeds
WHERE band_id = :bandId
  AND (created_at < :cursorCreatedAt
       OR (created_at = :cursorCreatedAt AND id < :cursorId))
ORDER BY created_at DESC, id DESC
LIMIT :limit;
```

### oldest (첫 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at
FROM feeds
WHERE band_id = :bandId
ORDER BY created_at ASC, id ASC
LIMIT :limit;
```

### oldest (다음 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at
FROM feeds
WHERE band_id = :bandId
  AND (created_at > :cursorCreatedAt
       OR (created_at = :cursorCreatedAt AND id > :cursorId))
ORDER BY created_at ASC, id ASC
LIMIT :limit;
```

### new-comments (첫 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at,
       COALESCE(last_commented_at, created_at) AS sort_at
FROM feeds
WHERE band_id = :bandId
ORDER BY sort_at DESC, id DESC
LIMIT :limit;
```

### new-comments (다음 페이지)

```sql
SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, last_commented_at,
       COALESCE(last_commented_at, created_at) AS sort_at
FROM feeds
WHERE band_id = :bandId
  AND (
    COALESCE(last_commented_at, created_at) < :cursorSortAt
    OR (COALESCE(last_commented_at, created_at) = :cursorSortAt AND id < :cursorId)
  )
ORDER BY sort_at DESC, id DESC
LIMIT :limit;
```

> 목록 응답은 `preview_text`와 썸네일만 포함하고, 본문(`text`)과 원본 경로(`original_path`)는 상세 API에서만 반환합니다.

이 문서는 MVP 시작점으로 충분하며, 이후 신고/차단/대댓글/밴드 멤버십 테이블은 Phase 2에서 확장하면 됩니다.
