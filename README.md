# notice-startpage 코드 설명

이 저장소는 **GitHub Pages 정적 사이트**이며, 사용자 화면과 관리자 화면으로 구성됩니다.

## 1) 전체 구조

- 사용자 페이지: `index.html`
  - 스타일: `static/css/index.css`
  - 동작 스크립트: `static/js/index.js`
- 관리자 페이지: `admin.html`
  - 스타일: `static/css/admin.css`
  - 설정: `static/js/admin-config.js`
  - 동작 스크립트: `static/js/admin.js`
- 데이터 소스: `content.json`
- 뉴스 상세 HTML: `News/*.html`
- 서비스 가이드 PDF: `files/*.pdf`
- 로고: `asset/logo.png`

## 2) 사용자 페이지 동작

`static/js/index.js`는 로드 시 `content.json`을 읽고 아래를 렌더링합니다.

- `services`: 구독 서비스 카드 목록
- `notice`: 공지 영역
- `news`: AI Update News 목록/페이지네이션/모달 상세
- `newsServiceCatalog`: 뉴스 서비스 배지 색상/표기 정보

추가로 서비스명 기준으로 `files/{서비스명}.pdf` 존재를 확인해 가이드 버튼 상태를 제어합니다.

## 3) 관리자 페이지 동작

`static/js/admin.js`는 GitHub API(REST/GraphQL)를 통해 저장소 파일을 직접 수정합니다.

- `content.json` 로드/편집/저장
- 서비스별 PDF 업로드/삭제(`files/*.pdf`)
- 뉴스 상세 HTML 업로드/삭제(`News/*.html`)
- 변경사항 요약 후 커밋

### 관리자 재사용(다른 레포 적용)

다른 저장소에서 재사용할 때는 `static/js/admin-config.js`만 수정하면 됩니다.

- `owner`: GitHub 사용자/조직
- `repo`: 저장소 이름
- `branch`: 대상 브랜치
- `contentPath`, `filesDir`, `newsDir`: 파일 경로 설정

## 4) 데이터 스키마 요약 (`content.json`)

- `services[]`
  - `name`, `domain`, `url`, `note`, `disabled`
- `notice`
  - `noticeId`, `items[]`
- `news[]`
  - `date`, `title`, `sub`, `service`, `file`
- `newsServiceCatalog[]`
  - `name`, `color`

## 5) 운영 시 주의사항

- 관리자 저장은 GitHub 토큰 권한(`Contents: Read/Write`)이 필요합니다.
- `services[].name`을 바꾸면 연결 PDF 경로(`files/{name}.pdf`)도 함께 고려해야 합니다.
- `news[].file`은 `News/` 하위 상세 HTML 파일과 일치해야 합니다.
