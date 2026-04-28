I'm planning to make a photo feed app.
it is running on synology nas.

# Permission
synology nas can make admin and user accounts with different permissions.
I hope this app also has different access levels for admin and user accounts.


# Features
admin and user can create bands. and all bands can be shown by all users.
in each band, there are taps. feeds, and photo albums.
there's a sorting feature for the feeds. newest, and oldest, and new comments.
anyone can create feeds and photo albums in the bands.
the user can upload a text and photos to the feeds and photo albums.
there is comment section for each feed and photo album, where users can leave comments and interact with each other.
for fast loading, I want to use thumbnail images for the feeds and photo albums, and users can click on them to view the full-size images.
also for fast loading, feeds shows only the first few lines of text, and users can click to expand and read the full content.
also for fast loading, feeds shows only first few feed items.
upload limit for each feed and photo album. 50 photos per feed and 1000 photos per photo album.

# Note
because I'm on synology nas with 1 gb ram, I want to make this app as lightweight as possible.

# Performance Targets
- 목표 메모리 사용량: 250MB
- 피드 목록 응답시간: < 500ms
- 썸네일 생성 큐 대기시간: 10 sec

# Frontend Roadmap
- MVP 경량 화면 유지 방식: C. 최소한만 HTML
    - 로그인/정적 페이지만 HTML
    - 나머지는 빠르게 React로 전환
- React 우선 도입 화면: A. 피드 목록
    - 무한 스크롤, 정렬, 펼치기 UI 최적화
- 빌드 번들 크기 제약: B. 보수적
    - 초기 JS 번들 200KB 이하

# Confirmed Decisions
1. **Admin scope**: **B** (moderation + band policy changes)
    - Admin can moderate content (delete/hide posts or comments)
    - Admin can change band-level policies (including upload policy)
    - User sanctions (suspend/ban) are out of MVP scope

2. **Frontend strategy**: **C** (hybrid incremental transition)
    - Start MVP with lightweight pages/components first
    - Introduce React gradually for high-interaction screens only
    - Keep non-critical screens simple to reduce memory/build overhead

# Technology Stack
To create a lightweight photo feed app that runs efficiently on a Synology NAS with 1 GB of RAM, you can consider the following technology stack:
1. **Backend**: 
   - **Node.js** with Express.js: A lightweight and efficient server-side framework that can handle API requests and manage user authentication. Not bun.
   - **SQLite**: A lightweight, file-based database that is suitable for small applications and can run efficiently on limited resources.
2. **Frontend**:
    - **React**: A popular JavaScript library for building user interfaces. It allows for efficient rendering and can be optimized for performance.
    - **Tailwind CSS**: A utility-first CSS framework that can help you quickly style your application without adding much overhead.
3. **Image Handling**:
   - **Sharp**: A high-performance image processing library for Node.js that can be used to create thumbnails and optimize images for fast loading.
4. **Authentication**:
   - **JWT (JSON Web Tokens)**: A compact and secure way to handle user authentication and manage access levels for admin and user accounts.
5. **File Storage**:
   - **Local File System**: Since you're running on a Synology NAS, you can utilize the local file system to store uploaded photos and thumbnails, ensuring fast access and minimal overhead.
6. **Deployment**:
   - **Docker**: Containerizing your application can help manage dependencies and ensure consistent performance across different environments, especially on a NAS.
By using this technology stack, you can create a lightweight and efficient photo feed app that meets your requirements while running smoothly on your Synology NAS with limited resources.

# Implementation Steps
1. **Set Up the Backend**:
    - Initialize a Node.js project and install necessary dependencies (Express.js, SQLite, Sharp, JWT).
    - Create API endpoints for user authentication, band management, feed and photo album creation, and comment handling.
    - Implement middleware for authentication and access control based on user roles (admin and user).
2. **Set Up the Frontend**:
    - Initialize a React project and install Tailwind CSS for styling.
    - Create components for the main feed, band management, feed and photo album creation, and comment sections.
    - Implement state management to handle user interactions and API calls efficiently.
3. **Image Handling**:
    - Use Sharp in the backend to process uploaded images, create thumbnails, and optimize them for fast loading.
    - Store the original and thumbnail images in the local file system, and serve them through the backend API.
        - Use DB queue + single worker.
        - Separate storage paths for originals and thumbnails.

### Thumbnail Pipeline Policy (Server-side)
- Thumbnail generation must use a DB-backed queue.
- A single worker processes thumbnail jobs sequentially to reduce RAM spikes on 1GB NAS.
- Original and thumbnail files must be stored in different paths.
    - Example: `/data/originals/...` and `/data/thumbnails/...`
- API list responses should prefer thumbnail paths; full-size paths are loaded on detail view.
4. **Implement Sorting and Pagination**:
    - Add sorting options for feeds (newest, oldest, new comments) in the backend and implement pagination to load only a limited number of feed items at a time for better performance.
5. **Testing and Optimization**:
    - Test the application thoroughly to ensure all features work as expected and that it performs well on the Synology NAS.
    - Optimize the code and database queries to minimize memory usage and improve response times, especially considering the limited resources of the NAS.
6. **Deployment**:
    - Containerize the application using Docker for easy deployment on the Synology NAS.
    - Set up the necessary configurations for running the Docker container on the NAS, ensuring that it has access to the local file system for storing images and that it can handle incoming API requests efficiently.
By following these implementation steps, you can create a functional and efficient photo feed app that meets your requirements and runs smoothly on your Synology NAS with limited resources.

## Synology (DSM) 설치 및 서빙 가이드

1. 운영체제
     - Synology NAS는 `DSM (DiskStation Manager)`을 사용하며, Linux 기반입니다.
     - 일부 패키지는 NAS 모델과 DSM 버전에 따라 Package Center에서 제공되지 않을 수 있습니다.

2. 빌드 (로컬/개발)
     - 백엔드 의존성 설치:
         ```bash
         npm install
         ```
     - 프론트엔드가 있다면 번들 빌드:
         ```bash
         cd frontend
         npm install
         npm run build
         ```
     - NAS에서 사용할 업로드/썸네일 디렉터리 준비:
         ```bash
         mkdir -p /volume1/photo_feed/data/originals
         mkdir -p /volume1/photo_feed/data/thumbnails
         chown -R http:http /volume1/photo_feed/data
         ```

3. 서빙 (Bare process 권장)
     - NAS에서 직접 Node 프로세스로 실행:
         ```bash
         NODE_ENV=production node index.js
         ```
     - 프로세스 관리(권장): `pm2` 또는 systemd 유사 스크립트를 사용해 재시작/로그 관리를 합니다.
     - 외부 접근/TLS가 필요하면 DSM의 리버스 프록시나 Let’s Encrypt 인증서를 사용합니다.

4. Synology 패키지 설치(SSH + synopkg)
     - SSH 활성화 후 NAS에 접속합니다.
     - `synopkg`로 패키지 관리가 가능합니다 (모델·DSM에 따라 다름).
         ```bash
         synopkg list
         synopkg install /path/to/package.spk
         synopkg start <package-name>
         synopkg stop <package-name>
         synopkg status <package-name>
         ```
     - 권장 사용처:
         - Package Center에 공식으로 제공되는 경우 Package Center를 우선 사용하세요.
         - `.spk` 파일로 로컬 설치할 때는 `synopkg install` 사용.
         - 공식 지원이 없는 서비스(예: 일부 MongoDB 버전)는 bare-process 설치나 Docker 컨테이너를 고려하되, RAM 예산(1GB)을 항상 확인하세요.

5. 권장 배포 흐름
     - 개발: 로컬에서 Docker 또는 로컬 Node로 개발 후 빌드
     - 운영(NAS): 빈번한 메모리 테스트와 모니터링이 필요하면 bare process로 우선 배포
     - Docker는 메모리/성능 벤치마크에서 이득이 확인될 때 도입



* Add theme color.
  * color series?
  * also add dark mode and light mode and auto. default is light mode.

* Add taps. Bands, Feeds, Photo Albums.
* I don't think the thumbnail is not working.
* Add Edit button on bands, Feeds, photo albums. to all users.
* On feeds tap, show at most three photos of thumbnails.
* when on feeds, then make urls with band name and the feed in it.
  * because when I click backward button, I want to make the frontend click "back" button. "the same work".
  * if there's a better way to keep all in-memory state, then please do it.
* comment is not showing on each feed.
  * when comment, I want to see it right away without any refresh.
* bug
  * currently on existing feed, adding and deleting photos is not working.
* when choose a photo, then upload it right away. show the loading circle on each photo.
  * save button is always active. when click "save" button, really "save" when the whole photos are uploaded.