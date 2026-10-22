# 주차 서비스 · 모바일 프로토타입

쿼카 캐릭터와 파랑·흰색·노랑을 사용한 모바일형 주차 서비스입니다.
운영 사이트: https://parkinguiux.vercel.app/

## 화면과 흐름

- 하단 메뉴: **이용 현황 / 홈 / 마이페이지**. 홈을 중앙에 배치합니다.
- 홈: 목적지 입력, 빠른 메뉴, 주차요금 확인, 주변 주차장 지도.
- 지도: OpenStreetMap에서 가져온 실제 도로·주차장 좌표를 사용하며, 주변의 가까운 주차장 핀 3개만 표시합니다. 경로선·내비게이션은 제공하지 않습니다.
- 마이페이지: 닉네임·차량 번호·체험 결제수단·체험 이용 내역·모션 설정.
- 이용 현황: 샘플 요금 확인 → 짧은 결제 로딩 → 정산 완료 → 출차 가능 시간 → 출차 완료 체험.
- 출차 완료: 자동차를 탄 쿼카의 짧은 출발 모션, 모션 다시 보기, 체험 이용 내역 저장.
- 앱 이미지: 쿼카와 P를 조합한 팀 검토용 앱 아이콘. PNG 512/192, Apple Touch 180, 파비콘 32, manifest 포함.
- 앱 내부 아이콘: 반투명 블루 레이어를 활용한 SVG 10종. 원본 생성 스크립트는 `scripts/create-ui-icons.cjs`입니다.

## 체험 범위

주차장 좌표·직선거리는 2026-10-22에 가져온 OpenStreetMap 등록 정보입니다. 이름이 등록되지 않은 지점에는 구분용 이름을 표시합니다. 요금·차량·이용 기록은 체험용입니다. 실제 결제, 실시간 주차 가능 대수, 예약, 출차 감지, QR 절차는 없습니다.
목적지 검색은 서울시청·서울·광화문 키워드로 서울시청 주변 샘플을 보여줍니다. 전체 장소 검색 API는 연결하지 않았습니다.
‘현재 위치’ 버튼을 직접 누른 경우에만 브라우저의 위치 권한을 요청합니다. 위치 좌표를 앱 서버에 저장하지 않습니다. 현재 위치 이동은 준비된 서울시청 주변 지도 범위 안에서 지원하며, 주차장 핀의 실제 좌표는 옮기지 않습니다.

프로필·차량·샘플 결제수단·출차까지 마친 체험 기록은 현재 브라우저의 localStorage에 저장됩니다. 실제 카드 정보는 입력받지 않습니다. 현재 주차 세션은 새로고침하면 샘플 세션으로 시작합니다.

기기 ‘동작 줄이기’ 설정과 앱 내 모션 끄기 설정을 지원합니다. 로딩 중에는 다른 조작을 막고 결제 체험 중복 실행을 방지합니다.

## 로컬 실행과 빌드

`npm run dev` 실행 후 http://127.0.0.1:4173 을 엽니다. `index.html`을 직접 열어도 화면을 볼 수 있지만, 지도·위치 확인은 HTTP/HTTPS 환경을 권장합니다.

`npm run build`는 JavaScript 구문과 참조 자산·manifest를 검증하고 `dist/`에 정적 파일을 복사합니다.

## 배포와 수정

GitHub: https://github.com/parkinguiux-collab/parkinguiux

`main`에 push하면 Vercel이 `npm run build`를 실행하고 `dist/`를 자동 배포합니다.
화면 `index.html`, 스타일 `styles.css`, 동작 `app.js`를 수정합니다. CSS와 JS URL의 버전 쿼리는 화면 구조가 크게 바뀔 때 함께 갱신합니다.

## 지도·라이브러리

- Leaflet 1.9.4: https://leafletjs.com/examples/quick-start/
- 지도 원본 데이터: https://www.openstreetmap.org/copyright
- 타일 사용 정책: https://operations.osmfoundation.org/policies/tiles/
- Lucide: https://lucide.dev/

라이브러리는 `assets/vendor/`에 포함하며 해당 라이선스 파일을 함께 제공합니다. 지도에는 OpenStreetMap 저작자 표시를 유지합니다. assets/nearby-map.js는 원본 도로·공원·주차장 좌표를 경량화한 ODbL 데이터이며, scripts/prepare-map.py로 생성합니다. 원본 OSM 추출 파일은 저장소에 올리지 않습니다.
