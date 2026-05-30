# Q. API 키를 .env 파일로 관리하는데 실제 배포 시 보안은 어떻게 처리할 건가?

## 핵심 답변

현재 구조는 이미 보안을 고려한 설계입니다.
API 키는 Node.js 백엔드에서만 관리되며 브라우저에 노출되지 않습니다.

---

## 현재 보안 구조

```
[브라우저 (React)]
    │  POST /api/agent  ← API 키 없음, 메시지만 전송
    ▼
[Node.js 백엔드]
    └── .env.local에서 API 키 로드 ← 서버 메모리에서만 존재
          ├── REACT_APP_ANTHROPIC_API_KEY
          ├── REACT_APP_TMAP_API_KEY
          ├── REACT_APP_KAKAO_API_KEY
          ├── WEATHER_API_KEY
          ├── SEOUL_METRO_API_KEY
          └── ROAD_INCIDENT_API_KEY
```

**핵심**: 브라우저 개발자 도구(Network 탭)에서 API 키가 보이지 않습니다.
이전 구조(브라우저에서 Anthropic API 직접 호출)에서 백엔드로 이전한 주요 이유 중 하나입니다.

---

## 실제 배포 시 처리 방법

### .env 파일은 배포 서버에 올리지 않음
```
.gitignore에서 .env.local 제외 (팀 내 공유용으로 예외 처리했으나 실배포 시 제외)
```

### 환경변수는 배포 플랫폼에서 직접 설정

| 플랫폼 | 방법 |
|---|---|
| AWS EC2 | Parameter Store / Secrets Manager |
| Vercel | Dashboard → Environment Variables |
| Railway | Dashboard → Variables |
| Docker | `--env-file` 또는 Kubernetes Secrets |

---

## 변수명 앞에 REACT_APP_ 가 붙은 이유

일부 키 이름에 `REACT_APP_` 접두사가 붙어 있습니다.
이는 CRA(Create React App)에서 해당 변수를 브라우저 번들에 포함시키는 규칙입니다.

**그러나 현재 이 키들은 백엔드(server/)에서만 사용하므로 실제로는 브라우저에 노출되지 않습니다.**
변수명은 초기 구조에서 이어받은 것이며, 실배포 시 `ANTHROPIC_API_KEY` 등으로 정리가 필요합니다.

---

## 한 줄 요약

> "API 키는 Node.js 백엔드에서만 사용하며 브라우저에 노출되지 않습니다.
> 실배포 시에는 .env 파일 대신 플랫폼의 환경변수 설정을 사용합니다."
