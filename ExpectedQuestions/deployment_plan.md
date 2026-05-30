# Q. 실제 서비스로 배포할 계획이 있나?

## 핵심 답변

현재는 로컬 데모 수준이며, 이번 학기 내 배포 계획은 없습니다.
다만 배포를 위한 기술적 준비는 갖춰져 있습니다.

---

## 현재 상태 vs 배포 요건

| 항목 | 현재 | 배포 시 필요 |
|---|---|---|
| Frontend | localhost:3000 | Vercel / Netlify |
| Backend | localhost:3001 | Railway / EC2 / Render |
| API 키 | .env.local 파일 | 플랫폼 환경변수 |
| CORS | localhost:3000만 허용 | 실제 도메인으로 변경 |
| HTTPS | 없음 | 인증서 필요 |

---

## 배포한다면 예상 아키텍처

```
[사용자]
    ▼
[Vercel — React 빌드 정적 배포]
    │ HTTPS POST /api/agent
    ▼
[Railway 또는 Render — Node.js 서버]
    ├── Anthropic Claude API
    ├── Kakao / Tmap API
    ├── 기상청 API
    └── 국토부 ITS API
```

---

## 배포하지 않은 이유

1. **비용**: Anthropic API 호출 비용이 발생하며, 공개 서비스 시 무제한 호출로 비용 폭증 가능
2. **일정**: 캡스톤 마감 기준 배포보다 기능 완성도가 우선순위
3. **인증 없음**: 로그인 없이 누구나 사용 가능한 구조라 공개 배포 시 API 키 남용 위험

---

## 배포를 위해 추가 필요한 것

- [ ] Rate limiting (사용자당 호출 횟수 제한)
- [ ] 로그 모니터링
- [ ] 비용 알림 설정 (Anthropic 콘솔)
- [ ] HTTPS 설정
- [ ] CORS 도메인 업데이트

---

## 한 줄 요약

> "기술적으로는 배포 가능한 구조이나, 비용 제어와 인증 부재 문제로 이번 학기 내 공개 배포 계획은 없습니다."
