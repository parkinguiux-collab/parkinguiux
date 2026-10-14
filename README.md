# 주차 서비스 모바일 프로토타입

파랑·흰색·노랑과 쿼카 캐릭터를 활용한 모바일형 사이트입니다.
목적지 검색, 주차장 비교·정렬, 이용 현황, 결제 체험, 완료 안내를 제공합니다.

주차장·차량·요금·여유 상태는 샘플입니다. 실제 결제, 실시간 주차 정보, 주차장 출차 시스템 연동은 포함하지 않습니다. QR 절차는 없습니다.

## 로컬 실행

`npm run dev` 실행 후 `http://127.0.0.1:4173`을 엽니다.

## 배포

Vercel에서 이 GitHub 저장소를 Import합니다. Framework는 Other, Build Command는 `npm run build`, Output Directory는 `dist`입니다. 설정은 `vercel.json`에 저장되어 있습니다.

연결 후 운영 브랜치로 push하면 Vercel이 자동 배포합니다. 다른 브랜치는 Preview 배포로 확인할 수 있습니다.

## 수정

화면은 `index.html`, 스타일은 `styles.css`, 동작은 `app.js`를 수정합니다. 캐릭터 이미지는 `assets/`에 있습니다. 변경 후 `npm run build`로 확인하고 GitHub에 commit/push합니다.
