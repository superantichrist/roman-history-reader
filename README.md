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

## 배포

`main` 브랜치에 push하면 GitHub Actions가 데이터 재검증, 정적 빌드, GitHub Pages 배포를 수행합니다.

공개 주소: <https://superantichrist.github.io/roman-history-reader/>

판본·라이선스·데이터 출처는 [SOURCES.md](SOURCES.md)를 보십시오.
