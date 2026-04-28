# Photo Feed Project - Task Breakdown with Test-First Approach

> TDD 원칙: 각 task마다 **test function을 먼저 작성**한 후 구현합니다.

---

## Phase 1: Core Backend Setup

### Task 1.1: Database Initialization & Connection

**Test Function:**
```javascript
// test/db.test.js
async function testDatabaseInitialization() {
  const db = require('../backend/db');
  
  // 1. DB 연결 확인
  const connection = await db.connect();
  assert(connection !== null, 'DB 연결 실패');
  
  // 2. 테이블 존재 확인 (users, bands, feeds, albums, comments, etc.)
  const tableNames = ['users', 'bands', 'feeds', 'albums', 'comments', 
                      'feed_photos', 'album_photos', 'upload_policies', 'thumbnail_jobs'];
  for (const table of tableNames) {
    const result = await db.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table]
    );
    assert(result.length > 0, `테이블 ${table} 없음`);
  }
  
  // 3. 인덱스 확인 (최소 필수 인덱스)
  const indexNames = ['idx_feeds_band_created', 'idx_feeds_band_last_comment', 
                      'idx_albums_band_created', 'idx_comments_target'];
  for (const idx of indexNames) {
    const result = await db.query(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
      [idx]
    );
    assert(result.length > 0, `인덱스 ${idx} 없음`);
  }
  
  // 4. upload_policies 기본값 확인
  const policy = await db.query('SELECT * FROM upload_policies WHERE id=1');
  assert(policy.length > 0, 'upload_policies 기본 레코드 없음');
  assert(policy[0].feed_max_photos === 50, '기본 feed_max_photos 값 오류');
  
  console.log('✓ 데이터베이스 초기화 성공');
}
```

**Implementation:**
- SQLite 연결 설정
- 모든 테이블 생성 (schema.md 참고)
- 필수 인덱스 생성
- `upload_policies` 기본값 초기화
- DB 연결 풀 또는 싱글톤 인스턴스 구성

**Files to Create:**
- `backend/db.js` - DB 초기화 및 연결 관리
- `backend/schema.sql` - DDL 스크립트
- `test/db.test.js` - 테스트

---

### Task 1.2: User Authentication (JWT + Password Hashing)

**Test Function:**
```javascript
// test/auth.test.js
async function testUserAuthentication() {
  const auth = require('../backend/auth');
  const db = require('../backend/db');
  
  // 1. 사용자 생성 (비밀번호 해시)
  const userId = await db.query(
    `INSERT INTO users (username, password_hash, role) 
     VALUES (?, ?, ?) RETURNING id`,
    ['testuser', await auth.hashPassword('password123'), 'user']
  );
  assert(userId[0].id > 0, '사용자 생성 실패');
  
  // 2. JWT 생성 확인
  const token = auth.generateToken({ id: userId[0].id, role: 'user' });
  assert(token && typeof token === 'string', 'JWT 생성 실패');
  
  // 3. JWT 검증 확인
  const decoded = auth.verifyToken(token);
  assert(decoded.id === userId[0].id, 'JWT 검증 실패');
  assert(decoded.role === 'user', '역할 정보 오류');
  
  // 4. 비밀번호 검증
  const match = await auth.verifyPassword('password123', 
    (await db.query('SELECT password_hash FROM users WHERE id=?', [userId[0].id]))[0].password_hash
  );
  assert(match === true, '비밀번호 검증 실패');
  
  // 5. 잘못된 비밀번호 검증
  const nomatch = await auth.verifyPassword('wrongpassword',
    (await db.query('SELECT password_hash FROM users WHERE id=?', [userId[0].id]))[0].password_hash
  );
  assert(nomatch === false, '잘못된 비밀번호가 통과됨');
  
  console.log('✓ 사용자 인증 성공');
}
```

**Implementation:**
- bcrypt 또는 argon2로 비밀번호 해싱
- JWT 토큰 생성 및 검증 (HS256, 만료 시간 설정)
- 토큰 갱신 메커니즘 (refresh token 옵션)

**Files to Create:**
- `backend/auth.js` - 인증 로직
- `test/auth.test.js` - 테스트

---

### Task 1.3: User Login & Profile API Endpoints

**Test Function:**
```javascript
// test/api.auth.test.js
async function testAuthAPIs() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 1. 테스트 사용자 생성
  await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    ['alice', await auth.hashPassword('pass123'), 'user']
  );
  
  // 2. 로그인 성공
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'alice', password: 'pass123' });
  assert(loginRes.status === 200, 'Login 상태 오류');
  assert(loginRes.body.accessToken, 'accessToken 없음');
  assert(loginRes.body.user.id > 0, '사용자 정보 없음');
  const token = loginRes.body.accessToken;
  
  // 3. 로그인 실패 (잘못된 비밀번호)
  const failRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'alice', password: 'wrongpass' });
  assert(failRes.status === 401, '잘못된 비밀번호가 통과됨');
  
  // 4. /api/auth/me (현재 사용자 정보)
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert(meRes.status === 200, 'auth/me 상태 오류');
  assert(meRes.body.username === 'alice', '사용자명 오류');
  assert(meRes.body.role === 'user', '역할 오류');
  
  // 5. 인증 없이 접근 실패
  const noAuthRes = await request(app).get('/api/auth/me');
  assert(noAuthRes.status === 401, '인증 없이 접근 가능함');
  
  console.log('✓ 인증 API 성공');
}
```

**Implementation:**
- `POST /api/auth/login` - 사용자 인증
- `GET /api/auth/me` - 현재 사용자 정보 조회
- JWT 미들웨어 (요청 헤더에서 토큰 검증)
- 에러 핸들링 (401, 403 등)

**Files to Create:**
- `backend/routes/auth.js` - 인증 라우트
- `backend/middleware/auth.js` - JWT 검증 미들웨어
- `test/api.auth.test.js` - 테스트

---

## Phase 2: Band Management

### Task 2.1: Band CRUD Operations

**Test Function:**
```javascript
// test/api.band.test.js
async function testBandCRUD() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 테스트 사용자 생성
  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['bandadmin', await auth.hashPassword('pass'), 'user']
  );
  const userId = userRes[0].id;
  const token = auth.generateToken({ id: userId, role: 'user' });
  
  // 1. 밴드 생성
  const createRes = await request(app)
    .post('/api/bands')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'TestBand', description: 'A test band' });
  assert(createRes.status === 201, '밴드 생성 실패');
  assert(createRes.body.id > 0, '생성된 밴드 ID 없음');
  const bandId = createRes.body.id;
  
  // 2. 전체 밴드 목록 조회 (비인증도 가능)
  const listRes = await request(app).get('/api/bands');
  assert(listRes.status === 200, '밴드 목록 조회 실패');
  assert(Array.isArray(listRes.body), '목록이 배열이 아님');
  assert(listRes.body.some(b => b.id === bandId), '생성한 밴드가 목록에 없음');
  
  // 3. 특정 밴드 상세 조회
  const detailRes = await request(app).get(`/api/bands/${bandId}`);
  assert(detailRes.status === 200, '밴드 상세 조회 실패');
  assert(detailRes.body.name === 'TestBand', '밴드명 오류');
  assert(detailRes.body.created_by === userId, '생성자 오류');
  
  // 4. 밴드 수정 (생성자만 가능)
  const updateRes = await request(app)
    .patch(`/api/bands/${bandId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'UpdatedBand', description: 'Updated description' });
  assert(updateRes.status === 200, '밴드 수정 실패');
  assert(updateRes.body.name === 'UpdatedBand', '수정된 밴드명 오류');
  
  // 5. 다른 사용자가 수정 시도 (실패)
  const otherUserRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['otheruser', await auth.hashPassword('pass'), 'user']
  );
  const otherToken = auth.generateToken({ id: otherUserRes[0].id, role: 'user' });
  const unauthorizedRes = await request(app)
    .patch(`/api/bands/${bandId}`)
    .set('Authorization', `Bearer ${otherToken}`)
    .send({ name: 'Hacked' });
  assert(unauthorizedRes.status === 403, '권한 없는 수정이 가능함');
  
  // 6. 밴드 삭제 (admin만 가능)
  const adminRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['admin', await auth.hashPassword('pass'), 'admin']
  );
  const adminToken = auth.generateToken({ id: adminRes[0].id, role: 'admin' });
  const deleteRes = await request(app)
    .delete(`/api/bands/${bandId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteRes.status === 200, '밴드 삭제 실패');
  
  // 7. 삭제 후 조회 실패
  const notFoundRes = await request(app).get(`/api/bands/${bandId}`);
  assert(notFoundRes.status === 404, '삭제한 밴드가 조회됨');
  
  console.log('✓ 밴드 CRUD 성공');
}
```

**Implementation:**
- `GET /api/bands` - 전체 밴드 목록 (페이지네이션)
- `POST /api/bands` - 밴드 생성
- `GET /api/bands/:bandId` - 밴드 상세 조회
- `PATCH /api/bands/:bandId` - 밴드 수정 (생성자 또는 admin)
- `DELETE /api/bands/:bandId` - 밴드 삭제 (admin만)
- 권한 검사 미들웨어

**Files to Create:**
- `backend/routes/bands.js` - 밴드 라우트
- `backend/controllers/bandController.js` - 밴드 컨트롤러
- `test/api.band.test.js` - 테스트

---

## Phase 3: Feed & Comment System

### Task 3.1: Feed CRUD with Multi-Photo Upload

**Test Function:**
```javascript
// test/api.feed.test.js
async function testFeedCRUDWithPhotos() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  const fs = require('fs');
  const path = require('path');
  
  // 테스트 데이터 준비
  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['feeduser', await auth.hashPassword('pass'), 'user']
  );
  const userId = userRes[0].id;
  const token = auth.generateToken({ id: userId, role: 'user' });
  
  const bandRes = await db.query(
    `INSERT INTO bands (name, created_by) VALUES (?, ?) RETURNING id`,
    ['FeedBand', userId]
  );
  const bandId = bandRes[0].id;
  
  // 1. 피드 생성 (사진 포함)
  const createRes = await request(app)
    .post(`/api/bands/${bandId}/feeds`)
    .set('Authorization', `Bearer ${token}`)
    .field('text', 'This is my feed with photos!')
    .attach('photos', path.join(__dirname, 'fixtures/photo1.jpg'))
    .attach('photos', path.join(__dirname, 'fixtures/photo2.jpg'));
  assert(createRes.status === 201, '피드 생성 실패');
  assert(createRes.body.id > 0, '생성된 피드 ID 없음');
  const feedId = createRes.body.id;
  
  // 2. 피드 목록 조회 (thumbnails 기반, preview_text 포함)
  const listRes = await request(app).get(`/api/bands/${bandId}/feeds?sort=newest&limit=10`);
  assert(listRes.status === 200, '피드 목록 조회 실패');
  assert(Array.isArray(listRes.body.items), '목록이 배열이 아님');
  const feed = listRes.body.items.find(f => f.id === feedId);
  assert(feed, '생성한 피드가 목록에 없음');
  assert(feed.preview_text.length < feed.text.length, 'preview_text가 전체 텍스트임');
  assert(!feed.text, '목록에서 full text를 반환함');
  assert(feed.photo_count === 2, '사진 수 오류');
  
  // 3. 피드 상세 조회 (전체 본문 + 원본 경로)
  const detailRes = await request(app).get(`/api/feeds/${feedId}`);
  assert(detailRes.status === 200, '피드 상세 조회 실패');
  assert(detailRes.body.text === 'This is my feed with photos!', 'full text 오류');
  assert(Array.isArray(detailRes.body.photos), 'photos 배열 오류');
  assert(detailRes.body.photos.length === 2, '사진 수 오류');
  detailRes.body.photos.forEach(photo => {
    assert(photo.original_path, 'original_path 없음');
    assert(photo.thumb_path, 'thumb_path 없음');
  });
  
  // 4. 사진 최대 개수 초과 테스트 (50장 제한)
  const tooManyPhotos = await request(app)
    .post(`/api/bands/${bandId}/feeds`)
    .set('Authorization', `Bearer ${token}`)
    .field('text', 'Too many photos');
  for (let i = 0; i < 51; i++) {
    tooManyPhotos.attach('photos', path.join(__dirname, 'fixtures/photo1.jpg'));
  }
  const tooManyRes = await tooManyPhotos;
  assert(tooManyRes.status === 400, '50장 초과 사진이 허용됨');
  
  // 5. 피드 수정 (생성자만)
  const updateRes = await request(app)
    .patch(`/api/feeds/${feedId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Updated feed text' });
  assert(updateRes.status === 200, '피드 수정 실패');
  assert(updateRes.body.text === 'Updated feed text', '수정된 텍스트 오류');
  
  // 6. 피드 삭제 (생성자 또는 admin)
  const deleteRes = await request(app)
    .delete(`/api/feeds/${feedId}`)
    .set('Authorization', `Bearer ${token}`);
  assert(deleteRes.status === 200, '피드 삭제 실패');
  
  console.log('✓ 피드 CRUD 성공');
}
```

**Implementation:**
- `GET /api/bands/:bandId/feeds?sort=newest|oldest|new-comments&limit=20&cursor=...` - 목록 조회
  - 커서 기반 페이지네이션
  - preview_text + thumbnail만 반환
- `POST /api/bands/:bandId/feeds` - 피드 생성
  - multipart/form-data 처리
  - 사진 최대 50장 검증
  - 비동기 썸네일 생성 큐 등록
- `GET /api/feeds/:feedId` - 피드 상세 조회 (전체 본문 + 원본 경로)
- `PATCH /api/feeds/:feedId` - 피드 수정
- `DELETE /api/feeds/:feedId` - 피드 삭제
- 파일 업로드 처리 (multer)
- Sharp를 이용한 썸네일 생성 큐 추가

**Files to Create:**
- `backend/routes/feeds.js` - 피드 라우트
- `backend/controllers/feedController.js` - 피드 컨트롤러
- `backend/services/uploadService.js` - 파일 업로드 처리
- `backend/services/thumbnailQueue.js` - 썸네일 큐 관리
- `test/api.feed.test.js` - 테스트
- `test/fixtures/photo1.jpg`, `photo2.jpg` - 테스트 이미지

---

### Task 3.2: Comment System (Feed & Album)

**Test Function:**
```javascript
// test/api.comment.test.js
async function testCommentSystem() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 테스트 데이터 준비
  const user1 = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['user1', await auth.hashPassword('pass'), 'user']
  );
  const user2 = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['user2', await auth.hashPassword('pass'), 'user']
  );
  const token1 = auth.generateToken({ id: user1[0].id, role: 'user' });
  const token2 = auth.generateToken({ id: user2[0].id, role: 'user' });
  
  const band = await db.query(
    `INSERT INTO bands (name, created_by) VALUES (?, ?) RETURNING id`,
    ['CommentBand', user1[0].id]
  );
  
  const feed = await db.query(
    `INSERT INTO feeds (band_id, author_id, text, preview_text) VALUES (?, ?, ?, ?) RETURNING id`,
    [band[0].id, user1[0].id, 'Test feed', 'Test feed']
  );
  
  // 1. 댓글 작성
  const createRes = await request(app)
    .post('/api/comments')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      targetType: 'feed',
      targetId: feed[0].id,
      content: 'Great post!'
    });
  assert(createRes.status === 201, '댓글 작성 실패');
  assert(createRes.body.id > 0, '생성된 댓글 ID 없음');
  const commentId = createRes.body.id;
  
  // 2. 댓글 목록 조회
  const listRes = await request(app)
    .get(`/api/comments?targetType=feed&targetId=${feed[0].id}&limit=50`);
  assert(listRes.status === 200, '댓글 목록 조회 실패');
  assert(Array.isArray(listRes.body.items), '목록이 배열이 아님');
  assert(listRes.body.items.some(c => c.id === commentId), '작성한 댓글이 목록에 없음');
  
  // 3. 피드의 comment_count가 증가했는지 확인
  const feedRes = await request(app).get(`/api/feeds/${feed[0].id}`);
  assert(feedRes.body.comment_count === 1, 'comment_count가 업데이트 안 됨');
  
  // 4. 댓글 수정 (작성자만)
  const updateRes = await request(app)
    .patch(`/api/comments/${commentId}`)
    .set('Authorization', `Bearer ${token2}`)
    .send({ content: 'Updated comment' });
  assert(updateRes.status === 200, '댓글 수정 실패');
  assert(updateRes.body.content === 'Updated comment', '수정된 내용 오류');
  
  // 5. 다른 사용자가 수정 시도 (실패)
  const unauthorizedRes = await request(app)
    .patch(`/api/comments/${commentId}`)
    .set('Authorization', `Bearer ${token1}`)
    .send({ content: 'Hacked' });
  assert(unauthorizedRes.status === 403, '권한 없는 수정이 가능함');
  
  // 6. 댓글 삭제 (작성자 또는 admin)
  const deleteRes = await request(app)
    .delete(`/api/comments/${commentId}`)
    .set('Authorization', `Bearer ${token2}`);
  assert(deleteRes.status === 200, '댓글 삭제 실패');
  
  // 7. comment_count 감소 확인
  const feedAfterDelete = await request(app).get(`/api/feeds/${feed[0].id}`);
  assert(feedAfterDelete.body.comment_count === 0, 'comment_count가 감소 안 됨');
  
  // 8. 잘못된 targetType 검증
  const invalidRes = await request(app)
    .post('/api/comments')
    .set('Authorization', `Bearer ${token2}`)
    .send({
      targetType: 'invalid',
      targetId: feed[0].id,
      content: 'Invalid'
    });
  assert(invalidRes.status === 400, '잘못된 targetType이 허용됨');
  
  console.log('✓ 댓글 시스템 성공');
}
```

**Implementation:**
- `GET /api/comments?targetType=feed|album&targetId=:id&limit=50&cursor=...` - 댓글 목록
- `POST /api/comments` - 댓글 작성
- `PATCH /api/comments/:commentId` - 댓글 수정
- `DELETE /api/comments/:commentId` - 댓글 삭제
- comment_count 캐시 업데이트
- targetType, targetId 검증
- 소프트 삭제 옵션 고려

**Files to Create:**
- `backend/routes/comments.js` - 댓글 라우트
- `backend/controllers/commentController.js` - 댓글 컨트롤러
- `test/api.comment.test.js` - 테스트

---

## Phase 4: Album System

### Task 4.1: Album CRUD with Multi-Photo Upload (최대 1000장)

**Test Function:**
```javascript
// test/api.album.test.js
async function testAlbumCRUD() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  const path = require('path');
  
  // 테스트 데이터 준비
  const user = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['albumuser', await auth.hashPassword('pass'), 'user']
  );
  const token = auth.generateToken({ id: user[0].id, role: 'user' });
  
  const band = await db.query(
    `INSERT INTO bands (name, created_by) VALUES (?, ?) RETURNING id`,
    ['AlbumBand', user[0].id]
  );
  
  // 1. 앨범 생성 (사진 포함)
  const createRes = await request(app)
    .post(`/api/bands/${band[0].id}/albums`)
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'My Album')
    .field('description', 'A nice album')
    .attach('photos', path.join(__dirname, 'fixtures/photo1.jpg'))
    .attach('photos', path.join(__dirname, 'fixtures/photo2.jpg'));
  assert(createRes.status === 201, '앨범 생성 실패');
  assert(createRes.body.id > 0, '생성된 앨범 ID 없음');
  const albumId = createRes.body.id;
  
  // 2. 앨범 목록 조회
  const listRes = await request(app)
    .get(`/api/bands/${band[0].id}/albums?limit=20`);
  assert(listRes.status === 200, '앨범 목록 조회 실패');
  assert(Array.isArray(listRes.body.items), '목록이 배열이 아님');
  assert(listRes.body.items.some(a => a.id === albumId), '생성한 앨범이 목록에 없음');
  
  // 3. 앨범 상세 조회 (모든 사진 + 원본 경로)
  const detailRes = await request(app).get(`/api/albums/${albumId}`);
  assert(detailRes.status === 200, '앨범 상세 조회 실패');
  assert(detailRes.body.title === 'My Album', '앨범명 오류');
  assert(Array.isArray(detailRes.body.photos), 'photos 배열 오류');
  assert(detailRes.body.photos.length === 2, '사진 수 오류');
  
  // 4. 사진 최대 개수 초과 테스트 (1000장 제한)
  const tooManyPhotos = await request(app)
    .post(`/api/bands/${band[0].id}/albums`)
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'Too many');
  for (let i = 0; i < 1001; i++) {
    tooManyPhotos.attach('photos', path.join(__dirname, 'fixtures/photo1.jpg'));
  }
  const tooManyRes = await tooManyPhotos;
  assert(tooManyRes.status === 400, '1000장 초과 사진이 허용됨');
  
  // 5. 앨범 수정
  const updateRes = await request(app)
    .patch(`/api/albums/${albumId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Updated Album', description: 'Updated' });
  assert(updateRes.status === 200, '앨범 수정 실패');
  assert(updateRes.body.title === 'Updated Album', '수정된 제목 오류');
  
  // 6. 앨범 삭제
  const deleteRes = await request(app)
    .delete(`/api/albums/${albumId}`)
    .set('Authorization', `Bearer ${token}`);
  assert(deleteRes.status === 200, '앨범 삭제 실패');
  
  console.log('✓ 앨범 CRUD 성공');
}
```

**Implementation:**
- `GET /api/bands/:bandId/albums?limit=20&cursor=...` - 앨범 목록
- `POST /api/bands/:bandId/albums` - 앨범 생성
- `GET /api/albums/:albumId` - 앨범 상세 조회
- `PATCH /api/albums/:albumId` - 앨범 수정
- `DELETE /api/albums/:albumId` - 앨범 삭제
- 사진 최대 1000장 검증
- cover_thumb_path 설정 (첫 번째 사진)

**Files to Create:**
- `backend/routes/albums.js` - 앨범 라우트
- `backend/controllers/albumController.js` - 앨범 컨트롤러
- `test/api.album.test.js` - 테스트

---

## Phase 5: Admin & Upload Policy

### Task 5.1: Admin Upload Policy Management

**Test Function:**
```javascript
// test/api.admin.test.js
async function testAdminUploadPolicy() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 테스트 사용자: admin, user
  const admin = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['admin', await auth.hashPassword('pass'), 'admin']
  );
  const user = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['user', await auth.hashPassword('pass'), 'user']
  );
  const adminToken = auth.generateToken({ id: admin[0].id, role: 'admin' });
  const userToken = auth.generateToken({ id: user[0].id, role: 'user' });
  
  // 1. 업로드 정책 조회 (admin)
  const getPolicyRes = await request(app)
    .get('/api/admin/upload-policy')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(getPolicyRes.status === 200, '정책 조회 실패');
  assert(getPolicyRes.body.feed_max_photos === 50, '기본값 오류');
  assert(getPolicyRes.body.album_max_photos === 1000, '기본값 오류');
  
  // 2. 일반 사용자가 조회 시도 (실패)
  const userGetRes = await request(app)
    .get('/api/admin/upload-policy')
    .set('Authorization', `Bearer ${userToken}`);
  assert(userGetRes.status === 403, '일반 사용자가 정책을 조회함');
  
  // 3. 업로드 정책 변경 (admin)
  const updateRes = await request(app)
    .patch('/api/admin/upload-policy')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      feed_max_photos: 100,
      album_max_photos: 2000,
      max_file_size_mb: 25,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp']
    });
  assert(updateRes.status === 200, '정책 변경 실패');
  assert(updateRes.body.feed_max_photos === 100, '변경값 오류');
  
  // 4. 일반 사용자가 변경 시도 (실패)
  const userUpdateRes = await request(app)
    .patch('/api/admin/upload-policy')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ feed_max_photos: 1 });
  assert(userUpdateRes.status === 403, '일반 사용자가 정책을 변경함');
  
  // 5. 정책 범위 검증 (서버 가드)
  const invalidRes = await request(app)
    .patch('/api/admin/upload-policy')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      feed_max_photos: 300  // 200 초과
    });
  assert(invalidRes.status === 400, '정책 상한이 검증되지 않음');
  
  console.log('✓ 관리자 업로드 정책 성공');
}
```

**Implementation:**
- `GET /api/admin/upload-policy` - 현재 정책 조회 (admin만)
- `PATCH /api/admin/upload-policy` - 정책 변경 (admin만)
- 정책 변경 후 피드/앨범 생성에 즉시 적용
- 상한 검증 (feed_max <= 200, album_max <= 5000 등)

**Files to Create:**
- `backend/routes/admin.js` - 관리자 라우트
- `backend/controllers/adminController.js` - 관리자 컨트롤러
- `test/api.admin.test.js` - 테스트

---

### Task 5.2: Admin Content Moderation (Delete/Hide Posts & Comments)

**Test Function:**
```javascript
// test/api.admin.moderation.test.js
async function testAdminModeration() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 테스트 데이터
  const admin = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['admin', await auth.hashPassword('pass'), 'admin']
  );
  const user = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['user', await auth.hashPassword('pass'), 'user']
  );
  const adminToken = auth.generateToken({ id: admin[0].id, role: 'admin' });
  const userToken = auth.generateToken({ id: user[0].id, role: 'user' });
  
  const band = await db.query(
    `INSERT INTO bands (name, created_by) VALUES (?, ?) RETURNING id`,
    ['Band', user[0].id]
  );
  
  const feed = await db.query(
    `INSERT INTO feeds (band_id, author_id, text, preview_text) VALUES (?, ?, ?, ?) RETURNING id`,
    [band[0].id, user[0].id, 'Inappropriate content', 'Inappropriate']
  );
  
  const comment = await db.query(
    `INSERT INTO comments (author_id, target_type, target_id, content) VALUES (?, ?, ?, ?) RETURNING id`,
    [user[0].id, 'feed', feed[0].id, 'Inappropriate comment']
  );
  
  // 1. Admin이 피드 삭제
  const deleteFeedRes = await request(app)
    .delete(`/api/feeds/${feed[0].id}/admin-delete`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteFeedRes.status === 200, '관리자 피드 삭제 실패');
  
  // 2. 일반 사용자가 관리자 삭제 시도 (실패)
  const unauthorizedDelete = await request(app)
    .delete(`/api/comments/${comment[0].id}/admin-delete`)
    .set('Authorization', `Bearer ${userToken}`);
  assert(unauthorizedDelete.status === 403, '일반 사용자가 관리자 삭제를 수행함');
  
  // 3. Admin이 댓글 삭제
  const deleteCommentRes = await request(app)
    .delete(`/api/comments/${comment[0].id}/admin-delete`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(deleteCommentRes.status === 200, '관리자 댓글 삭제 실패');
  
  console.log('✓ 관리자 모더레이션 성공');
}
```

**Implementation:**
- `DELETE /api/feeds/:feedId/admin-delete` - 피드 관리자 삭제
- `DELETE /api/comments/:commentId/admin-delete` - 댓글 관리자 삭제
- Admin 권한 검사
- 소프트 삭제 처리

**Files to Create:**
- `backend/middleware/adminCheck.js` - 관리자 권한 확인 미들웨어
- `test/api.admin.moderation.test.js` - 테스트

---

## Phase 6: Thumbnail Pipeline

### Task 6.1: Async Thumbnail Generation Queue

**Test Function:**
```javascript
// test/thumbnail.test.js
async function testThumbnailPipeline() {
  const db = require('../backend/db');
  const thumbnailQueue = require('../backend/services/thumbnailQueue');
  const fs = require('fs');
  const path = require('path');
  
  // 1. 썸네일 작업 큐에 등록
  const feedPhotoRes = await db.query(
    `INSERT INTO feed_photos (feed_id, original_path, thumb_path) 
     VALUES (?, ?, ?) RETURNING id`,
    [1, '/data/originals/photo1.jpg', '/data/thumbnails/photo1_thumb.jpg']
  );
  const photoId = feedPhotoRes[0].id;
  
  const jobRes = await db.query(
    `INSERT INTO thumbnail_jobs (target_type, target_id, status) 
     VALUES (?, ?, ?) RETURNING id`,
    ['feed_photo', photoId, 'queued']
  );
  const jobId = jobRes[0].id;
  assert(jobRes[0].status === 'queued', '작업 큐 등록 실패');
  
  // 2. 워커 시작 및 처리
  thumbnailQueue.start();
  
  // 비동기 처리 대기 (최대 10초)
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // 3. 작업 상태 확인 (완료)
  const jobCheck = await db.query(
    `SELECT status FROM thumbnail_jobs WHERE id=?`,
    [jobId]
  );
  assert(jobCheck[0].status === 'done', '썸네일 생성 실패');
  
  // 4. 썸네일 파일 존재 확인
  const thumbPath = path.join('/data/thumbnails/photo1_thumb.jpg');
  assert(fs.existsSync(thumbPath), '썸네일 파일 없음');
  
  // 5. 썸네일 크기 확인 (원본보다 작음)
  const originalPath = path.join('/data/originals/photo1.jpg');
  const originalSize = fs.statSync(originalPath).size;
  const thumbSize = fs.statSync(thumbPath).size;
  assert(thumbSize < originalSize, '썸네일이 원본보다 큼');
  
  // 6. 싱글 워커 확인 (동시 처리 1개만)
  const concurrentJobs = await db.query(
    `SELECT COUNT(*) as count FROM thumbnail_jobs WHERE status='processing'`
  );
  assert(concurrentJobs[0].count <= 1, '다중 워커로 처리됨');
  
  thumbnailQueue.stop();
  
  console.log('✓ 썸네일 파이프라인 성공');
}
```

**Implementation:**
- Thumbnail Job 큐 테이블 활용
- 단일 워커로 순차 처리 (메모리 효율성)
- Sharp로 썸네일 생성 (500x500 또는 설정값)
- 원본/썸네일 경로 분리 저장
- 실패 시 재시도 (최대 3회)

**Files to Create:**
- `backend/services/thumbnailQueue.js` - 썸네일 큐 및 워커
- `backend/services/imageProcessor.js` - Sharp 기반 이미지 처리
- `test/thumbnail.test.js` - 테스트

---

## Phase 7: Feed Sorting & Pagination

### Task 7.1: Cursor-Based Pagination with Multiple Sort Options

**Test Function:**
```javascript
// test/pagination.test.js
async function testFeedPagination() {
  const request = require('supertest');
  const app = require('../backend/index');
  const db = require('../backend/db');
  const auth = require('../backend/auth');
  
  // 테스트 데이터: 30개 피드 생성
  const user = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id`,
    ['user', await auth.hashPassword('pass'), 'user']
  );
  const band = await db.query(
    `INSERT INTO bands (name, created_by) VALUES (?, ?) RETURNING id`,
    ['Band', user[0].id]
  );
  
  for (let i = 0; i < 30; i++) {
    await db.query(
      `INSERT INTO feeds (band_id, author_id, text, preview_text) VALUES (?, ?, ?, ?)`,
      [band[0].id, user[0].id, `Feed ${i}`, `Feed ${i}`]
    );
  }
  
  // 1. newest 정렬 - 첫 페이지
  const page1 = await request(app).get(`/api/bands/${band[0].id}/feeds?sort=newest&limit=10`);
  assert(page1.status === 200, '첫 페이지 조회 실패');
  assert(page1.body.items.length === 10, '페이지 크기 오류');
  assert(page1.body.hasMore === true, 'hasMore 플래그 오류');
  const cursor1 = page1.body.cursor;
  
  // 2. newest 정렬 - 다음 페이지
  const page2 = await request(app)
    .get(`/api/bands/${band[0].id}/feeds?sort=newest&limit=10&cursor=${cursor1}`);
  assert(page2.status === 200, '다음 페이지 조회 실패');
  assert(page2.body.items.length === 10, '다음 페이지 크기 오류');
  assert(page1.body.items[0].id !== page2.body.items[0].id, '중복된 데이터');
  
  // 3. oldest 정렬 확인 (생성일 오름차순)
  const oldestRes = await request(app)
    .get(`/api/bands/${band[0].id}/feeds?sort=oldest&limit=10`);
  assert(oldestRes.status === 200, 'oldest 정렬 실패');
  // 첫 번째 아이템이 가장 오래된 것
  
  // 4. new-comments 정렬 (댓글 최신순)
  // 피드에 댓글 추가
  const targetFeed = page1.body.items[0];
  await db.query(
    `INSERT INTO comments (author_id, target_type, target_id, content) VALUES (?, ?, ?, ?)`,
    [user[0].id, 'feed', targetFeed.id, 'Comment']
  );
  await db.query(
    `UPDATE feeds SET comment_count=comment_count+1, last_commented_at=CURRENT_TIMESTAMP WHERE id=?`,
    [targetFeed.id]
  );
  
  const newCommentsRes = await request(app)
    .get(`/api/bands/${band[0].id}/feeds?sort=new-comments&limit=10`);
  assert(newCommentsRes.status === 200, 'new-comments 정렬 실패');
  // 댓글이 있는 피드가 상위에 위치
  
  console.log('✓ 페이지네이션 성공');
}
```

**Implementation:**
- 커서 기반 페이지네이션 (오프셋 금지)
- 정렬 옵션: `newest`, `oldest`, `new-comments`
- cursor 파라미터로 다음 페이지 추적
- hasMore 플래그로 마지막 페이지 표시
- 응답에 cursor 포함 (다음 요청용)

**Files to Create:**
- `backend/services/paginationService.js` - 페이지네이션 로직
- `test/pagination.test.js` - 테스트

---

## Phase 8: Frontend UI Components (React)

### Task 8.1: Login & Feed List (React)

**Test Function:**
```javascript
// test/frontend.feed.test.js (e2e with Playwright)
const { test, expect } = require('@playwright/test');

test('Feed list page loads and displays feeds', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // 1. 로그인
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'pass123');
  await page.click('button:has-text("Login")');
  
  // 2. 피드 목록 표시
  await expect(page.locator('.feed-item')).toHaveCount(10);
  
  // 3. 썸네일 로드 확인
  const thumbs = await page.locator('.feed-thumbnail img').all();
  expect(thumbs.length).toBeGreaterThan(0);
  
  // 4. 스크롤 시 다음 페이지 로드 (infinite scroll)
  await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await expect(page.locator('.feed-item')).toHaveCount(20);
  
  // 5. 정렬 변경
  await page.selectOption('select[name="sort"]', 'oldest');
  await page.waitForLoadingState('networkidle');
  const feedTexts = await page.locator('.feed-item').allTextContents();
  // oldest 순서 확인
  
  // 6. 피드 상세 클릭
  await page.click('.feed-item:first-child');
  await expect(page).toHaveURL(/\/feeds\/\d+/);
  
  // 7. 전체 본문 표시
  await expect(page.locator('.feed-full-text')).toBeVisible();
});
```

**Implementation:**
- Login 페이지 (HTML/간단한 JS)
- Feed List 페이지 (React)
  - 무한 스크롤
  - 정렬 옵션 (newest, oldest, new-comments)
  - 썸네일 표시 + preview_text
- Feed Detail 페이지 (React)
  - 전체 본문 + 원본 이미지
  - 댓글 표시

**Files to Create:**
- `frontend/src/pages/LoginPage.jsx` - 로그인
- `frontend/src/pages/FeedListPage.jsx` - 피드 목록
- `frontend/src/pages/FeedDetailPage.jsx` - 피드 상세
- `frontend/src/components/FeedCard.jsx` - 피드 카드
- `frontend/src/components/CommentSection.jsx` - 댓글 섹션
- `frontend/src/hooks/usePagination.js` - 페이지네이션 훅
- `test/frontend.feed.test.js` - 테스트

---

## 실행 순서

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```

각 Phase 완료 후:
1. 모든 Test 함수 실행
2. Test 통과 확인
3. 다음 Phase로 진행

---

## Test 실행 명령어

```bash
# 전체 테스트
npm test

# 특정 Phase 테스트
npm test -- --grep "^Task 1"

# 특정 테스트 파일
npm test test/db.test.js

# 커버리지 확인
npm test -- --coverage
```

---

## Checklist Template (각 Task 마다)

- [ ] Test 함수 작성 완료
- [ ] Test 함수 실행 및 실패 확인 (RED)
- [ ] 구현 코드 작성
- [ ] Test 통과 확인 (GREEN)
- [ ] 코드 리팩토링 (REFACTOR)
- [ ] 문서 업데이트
