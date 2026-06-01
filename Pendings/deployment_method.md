# [보류] 스마트폰 배포 방법 결정

## 선택지 요약

### 방법 1 — 같은 WiFi 로컬 IP (발표장 WiFi 가능 시 권장)
- 노트북과 스마트폰을 같은 공유기에 연결
- 작업: CORS 수정, `HOST=0.0.0.0` 설정, `.env.local`에 노트북 IP 등록
- 장점: 배포 불필요, API 비용 없음
- 단점: 발표장 WiFi 환경 사전 확인 필수

### 방법 2 — 클라우드 배포 (Vercel + Railway)
- 프론트 Vercel, 백엔드 Railway 무료 티어
- 작업: GitHub 연동, 환경변수 설정, CORS 도메인 수정
- 장점: 어디서든 접근 가능
- 단점: 세팅 시간 소요, API 비용 발생 가능

### 방법 3 — ngrok 터널 (발표장 네트워크 불확실 시)
- `brew install ngrok` 후 `ngrok http 3001`
- 작업: ngrok URL을 `.env.local`에 등록 후 재빌드
- 장점: 5분 내 세팅
- 단점: 무료 플랜은 세션마다 URL 변경

## 결정 기준

| 상황 | 선택 |
|---|---|
| 발표장 WiFi 사용 가능 확인됨 | 방법 1 |
| 발표장 네트워크 불확실 | 방법 3 |
| 장기 서비스 / 외부 공유 필요 | 방법 2 |

## 결정 후 할 일

방법이 결정되면 Claude Code에서 해당 방법의 설정 작업을 바로 진행할 수 있습니다.
자세한 구현 절차는 `plan 파일 (/Users/jin/.claude/plans/mutable-nibbling-tide.md)` 참고.
