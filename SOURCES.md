# 원문과 판본

## 데이터 원칙

사이트는 세 가지 서로 다른 사료층을 섞어 새 문장을 만들지 않는다.

1. `보존 본문`: 저작의 연속 본문이 전하는 구간
2. `후대 요약`: 소실된 리비우스 권에 대한 익명 요약자의 페리오카이
3. `부분 보존` 또는 `본문 소실`: 폴리비오스 후반부의 단편과 공백

모든 생성 단락에는 저자·권·장·절 범위와 원래 절 번호 배열을 보존한다. 원문 파일, upstream commit, SHA-256은 `sources/manifest.json`에 기록되어 있다.

## 라틴어

- Titus Livius, *Ab urbe condita*, Wilhelm Weissenborn · Hermann Johannes Müller 편, Teubner, 1884–1911. PerseusDL `canonical-latinLit`, `urn:cts:latinLit:phi0914.phi001.perseus-lat2`.
- *Periochae librorum Ab urbe condita*: 11–20권은 Perseus의 권별 라틴어 데이터, 46–52권은 `phi0914.phi002.perseus-lat2`에서 추출한다.

## 고대 그리스어

- Polybius, *Historiae*, Theodorus Büttner-Wobst 편, Teubner, 1889–1905. PerseusDL `canonical-greekLit`, `urn:cts:greekLit:tlg0543.tlg001.perseus-grc2`.

## 번역

한국어는 현대 출판 번역을 복제하지 않고 이 프로젝트에서 원문으로부터 직접 작성한다. `first-pass`와 `reviewed` 상태를 분리하며, 번역이 없는 단락은 빈 문자열과 `untranslated` 상태로 남겨 원문 공개와 번역 진행을 혼동하지 않는다.

원문 데이터의 재사용 조건은 각 PerseusDL upstream 저장소의 라이선스를 따른다. 사이트 코드와 프로젝트에서 새로 작성한 한국어 번역은 별도 저작물이며, 명시적 허락 없이 상업 출판 번역으로 재배포할 수 없다.
