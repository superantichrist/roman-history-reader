# 로마사 원전 읽기 · ROMA FONTES

리비우스의 라틴어 본문, 소실권의 `Periochae`, 폴리비오스의 고대 그리스어 본문을 하나의 연대 지도에서 읽는 정적 웹 독서판입니다.

- 리비우스 《로마사》 보존 본문: 1–10권, 21–45권
- 리비우스 《로마사》 페리오카이: 11–20권, 46–52권
- 폴리비오스 《역사》: 1–39권(보존 상태를 권별로 명시)
- 91권, 10,000개 이상의 출전 추적 가능한 읽기 단락
- 원문/직역/나란히 보기, 전권 목차, 검색, 영구 링크, 원문 포함 복사

페리오카이와 폴리비오스를 소실된 리비우스의 ‘복원 본문’으로 취급하지 않습니다. 완전 본문·후대 요약·부분 보존·본문 소실을 데이터와 화면 양쪽에서 구분합니다.

## 개발

```sh
npm install
python scripts/fetch_sources.py
python scripts/build_data.py
npm run dev
```

원문 다운로드는 고정된 upstream commit을 사용하며 `sources/manifest.json`의 SHA-256으로 검증합니다. 한국어 번역은 `translations/ko/{source}/{book}.json`에 원문 ID와 분리해 저장합니다.

번역·연대 자료를 수정한 뒤에는 `npm run build:data`로 공개 JSON과 검색 색인을 갱신합니다. `npm run validate`는 파일을 변경하지 않고 원문 해시, 단락·절 중복, 번역 상태, 공개 JSON과 원자료의 일치를 검사합니다. `npm test`는 전체 영구 링크와 목차 이동, 읽기 위치 판정, 검색, 모바일 스와이프의 회귀 검사를 실행합니다.

읽는 위치는 URL과 기기 로컬 저장소에 함께 기록합니다. 명시적인 권·장 이동은 브라우저 뒤로/앞으로 가기에 남고, 스크롤은 현재 기록만 갱신합니다. PC·모바일 모두 고정된 탐색 막대에서 권·장·보기 방식을 바꿀 수 있습니다.

Windows에서는 `scripts/build.mjs`가 성공한 빌드의 강제 종료를 자연 종료로 바꿔 Vinext의 네이티브 핸들 종료 충돌을 피합니다. 실패 종료 코드는 그대로 유지합니다.

## 배포

`main` 브랜치에 push하면 GitHub Actions가 데이터 재검증, 정적 빌드, GitHub Pages 배포를 수행합니다.

공개 주소: <https://superantichrist.github.io/roman-history-reader/>

판본·라이선스·데이터 출처는 [SOURCES.md](SOURCES.md)를 보십시오.
