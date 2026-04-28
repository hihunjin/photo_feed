# 개발( macOS ) + 배포(DSM) 가이드

이 문서는 macOS에서 개발하고 Synology DSM에 배포하는 워크플로우와 예제 명령을 간단히 정리합니다.

## 전제
- 개발 환경: macOS
- 배포 대상: Synology NAS (DSM)
- 서버 런타임: Node.js, DB: SQLite (또는 필요 시 외부 DB)

---

## 1. macOS — 개발(로컬)

1) 의존성 설치
```bash
# 루트 프로젝트
npm install
# 프론트엔드가 별도 폴더인 경우
cd frontend
npm install
```

2) 개발 서버 실행
```bash
# 백엔드 (핫 리로딩 사용 시 nodemon 등)
npm run dev
# 프론트엔드
cd frontend
npm run dev
```

3) 환경 변수
- 개발용 `.env` 파일에 DB 경로, JWT 시크릿, 포트 등을 설정하세요.
- 예: `PORT=3000`, `JWT_SECRET=devsecret`, `DATABASE=./data/dev.sqlite3`

4) 빌드(프로덕션 준비)
   
   번들링 없이 CDN + 로컬 JS 방식 사용 (가장 경량):
   - React/React-DOM은 CDN에서 로드 (프로덕션 최적화 버전)
   - 로컬 JS 파일(app.js 등)은 그대로 서빙 (번들 생략)
   - 압축은 Express Gzip 미들웨어로 자동 처리
   
   예시 구조:
   ```
   backend/
   ├── public/
   │   ├── index.html        (CDN 링크 포함)
   │   └── js/
   │       └── app.js        (React 컴포넌트, 번들링 없음)
   ├── index.js              (Express 서버)
   └── package.json
   ```

   HTML 예시 (public/index.html):
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8">
     <title>Photo Feed</title>
     <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
     <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
   </head>
   <body>
     <div id="root"></div>
     <script src="/js/app.js"></script>
   </body>
   </html>
   ```

   백엔드 express 설정 예시 (gzip 압축 포함):
   ```javascript
   const express = require('express');
   const compression = require('compression');
   const app = express();
   
   // Gzip 압축 활성화
   app.use(compression());
   app.use(express.static('public'));
   
   // 나머지 라우트
   app.get('/api/...', (req, res) => { ... });
   
   app.listen(3000);
   ```

   빌드 절차 (macOS):
   ```bash
   # 의존성 설치 (프로덕션만)
   npm ci --production
   # 또는
   npm install --omit=dev
   ```

   빌드 결과물 배포:
   ```bash
   # backend 디렉터리 전체를 NAS로 복사
   rsync -az --delete --exclude 'node_modules' --exclude '.git' \
     ./backend/ admin@NAS_IP:/volume1/photo_feed/backend/
   ```

---

## 2. DSM (Synology) — Docker Compose 배포 준비

### 전제: Container Manager 설치 (DSM 7.2 이상 필수)
1. DSM 제어판 → 패키지 센터 → "Container Manager" 검색 및 설치
2. Container Manager는 docker-compose.yml 파일을 GUI에서 프로젝트로 관리 가능

### 2-1) 프로젝트 디렉터리 준비
```bash
# NAS에 프로젝트 디렉터리 생성
ssh admin@NAS_IP
mkdir -p /volume1/photo_feed/{backend,data/originals,data/thumbnails}
chmod -R 755 /volume1/photo_feed/data
```

### 2-2) docker-compose.yml 작성
NAS의 `/volume1/photo_feed/` 에 다음 파일을 생성:

```yaml
# filepath: /volume1/photo_feed/docker-compose.yml
version: '3.8'

services:
  photo_feed:
    image: node:18-alpine
    container_name: photo_feed
    working_dir: /app
    volumes:
      - ./backend:/app
      - ./data/originals:/app/data/originals
      - ./data/thumbnails:/app/data/thumbnails
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE=/app/data/photo_feed.sqlite3
      - JWT_SECRET=${JWT_SECRET:-your-secret-key}
    ports:
      - "3000:3000"
    command: sh -c "npm ci --production && node index.js"
    restart: unless-stopped
    mem_limit: 512m
    cpus: '1.0'
```

### 2-3) Git Clone 및 준비
NAS에서 Git 리포지토리를 clone 하고 필요한 디렉터리 준비:

```bash
ssh admin@NAS_IP

# 프로젝트 클론
cd /volume1
git clone https://github.com/YOUR_USERNAME/photo_feed.git photo_feed
cd /volume1/photo_feed

# 데이터 디렉터리 생성
mkdir -p data/originals data/thumbnails
chmod -R 755 data
```

---

## 3. DSM에서 실행 (Docker Compose)

### 3-1) NAS에서 직접 빌드 및 실행
```bash
ssh admin@NAS_IP

# root 권한 획득 (권장)
sudo -i

cd /volume1/photo_feed

# docker-compose.yml의 명령이 자동으로 npm ci와 app 시작을 수행
docker-compose up -d --build
```

# 로그 확인
docker-compose logs -f photo_feed
```

### 3-2) Container Manager GUI에서 관리
1. Container Manager 실행 → 프로젝트 탭
2. "새로 만들기" → docker-compose.yml 경로 지정: `/volume1/photo_feed/docker-compose.yml`
3. "빌드" → "시작" 클릭
4. 로그는 GUI의 "로그" 탭에서 확인 가능

### 3-3) 중지/재시작
```bash
cd /volume1/photo_feed
docker-compose stop
docker-compose restart
docker-compose down  # 완전 제거
```

### 3-4) 메모리/모니터링
- DSM 리소스 모니터에서 컨테이너 메모리 사용량 확인
- docker-compose.yml에서 `mem_limit: 512m`으로 메모리 제한 설정
- 필요시 제한값 조정 (1GB NAS 환경에서 보수적으로)

---

## 4. 베어 프로세스 vs Docker Compose 비교

| 항목 | 베어 프로세스 | Docker Compose |
|------|------------|-----------------|
| 설정 복잡도 | 낮음 | 중간 (docker-compose.yml) |
| 메모리 오버헤드 | 거의 없음 | ~50-100MB (컨테이너) |
| 격리 수준 | 없음 | 높음 (격리된 환경) |
| 재시작 관리 | pm2 필요 | 자동 (restart policy) |
| 프로세스 모니터링 | pm2 logs | docker-compose logs / GUI |
| DSM 제어판 통합 | 제한적 | Container Manager GUI 지원 |
| 권장 환경 | 1GB RAM, 간단 설정 | 메모리 여유 있을 때 |

---

## 5. Synology 패키지(옵션): SSH + synopkg
- SSH 활성화: DSM 제어판 → 터미널 & SNMP → SSH 활성화
- 패키지 관리 (모델/DSM에 따라 명령이 다를 수 있음)
```bash
synopkg list
synopkg install /path/to/package.spk
# or synopkg install_from_server ...
synopkg start <package-name>
synopkg stop <package-name>
synopkg status <package-name>
```
- Package Center에서 제공하는 공식 패키지가 있으면 우선 사용하세요.

---

## 6. 권장 배포 흐름 요약 (Git + Docker Compose)
1. macOS에서 개발 및 테스트 (`npm run dev`)
2. 변경사항을 Git에 push
3. NAS에서 SSH 접속 후 `sudo -i`로 root 권한 획득
4. `cd /volume1` 후 `git clone https://github.com/hihunjin/photo_feed`
5. `cd photo_feed` 후 `docker-compose up -d --build` 실행
6. `docker-compose logs` 또는 Container Manager GUI에서 모니터링

---

## 7. 환경 변수 관리 (.env 파일)
docker-compose.yml 실행 시 .env 파일 사용 예:

```bash
# filepath: /volume1/photo_feed/.env
NODE_ENV=production
PORT=3000
DATABASE=/app/data/photo_feed.sqlite3
JWT_SECRET=your-production-secret-key
```

docker-compose.yml에서 참조:
```yaml
environment:
  - JWT_SECRET=${JWT_SECRET:-default-secret}
```

---

## 8. 유의사항
- DSM 버전·NAS 모델에 따라 일부 패키지가 제한될 수 있습니다.
- 1GB RAM 환경: docker-compose.yml의 `mem_limit`을 보수적으로 설정하세요 (예: 512m).
- 보안: 외부 접근 시 DSM 리버스 프록시 또는 프록시+TLS 사용 권장.
- 데이터 영속성: `volumes` 설정으로 컨테이너 재시작 후에도 DB·사진 파일 유지.