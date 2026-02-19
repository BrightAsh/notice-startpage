# Notice Page (Test)

사내 AI SaaS 구독 리스트 / 공지사항 / 이용 가이드(PDF)를 한 곳에서 확인하는 GitHub Pages 기반 시작페이지
관리자 페이지에서 `content.json`과 `Files`폴더를 수정·업로드

- Test: https://brightash.github.io/notice-startpage/
- Main: https://knoc-aifieldzone.github.io/Notice-page/

---

## 1) Notice Page (사용자 화면)

- **구독 리스트(서비스 카드)** 표시
- **공지사항** 표시
- **이용 가이드(PDF)** 제공  
  - Prompt Guide (고정)
  - 서비스별 가이드(PDF) 자동 연결: `./files/{서비스명}.pdf`가 있으면 열기, 없으면 비활성/준비중 처리

---

## 2) Admin Page (관리자 화면)

- 로그인: **GitHub Fine-grained PAT** 사용(Contents: Read/Write)
- 구독 리스트(services) 추가/삭제/수정
- 공지사항(notice) 추가/삭제/수정
- 가이드 PDF 첨부/교체/삭제  
  - 업로드 파일명과 상관없이 저장 시 `files/{서비스명}.pdf`로 자동 저장

---

## 3) Guide Book 진행 상황

- Prompt Guide: 초안 완료
- 서비스별 가이드: 11개 초안 완료
- 향후 지속 고도화 예정

---

## Repository Structure (요약)

- `index.html` : Notice Page
- `content.json` : 서비스 목록/공지 데이터
- `admin.html`, `admin.js` : 관리자 페이지(편집/업로드/저장)
- `files/*.pdf` : 서비스별 이용 가이드 PDF
- `asset/logo.png` : 로고/파비콘
