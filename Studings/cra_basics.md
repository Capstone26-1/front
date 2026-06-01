# CRA (Create React App) 정리

## CRA란?

**Create React App**의 약자로, React 프로젝트를 처음 만들 때 사용하는 공식 도구다.
복잡한 빌드 설정(Webpack, Babel 등) 없이 명령어 하나로 프로젝트 구조를 자동 생성해준다.

```bash
npx create-react-app my-app
```

---

## CRA가 자동으로 만들어주는 것들

```
my-app/
├── public/
│   └── index.html          ← HTML 진입점
├── src/
│   ├── App.js              ← 메인 컴포넌트
│   ├── index.js            ← React DOM 렌더링 진입점
│   └── ...
├── .gitignore              ← 기본 무시 목록 자동 생성
├── package.json            ← 의존성 및 스크립트
└── README.md
```

---

## CRA 기본 스크립트

```bash
npm start        # 개발 서버 실행 (localhost:3000)
npm run build    # 프로덕션 빌드 → /build 폴더 생성
npm test         # 테스트 실행
```

---

## CRA 기본 .gitignore

CRA로 프로젝트를 생성하면 아래 내용의 `.gitignore`가 자동으로 만들어진다.

```
/node_modules      ← 의존성 패키지 (용량 큼, 커밋 불필요)
/build             ← 빌드 결과물 (커밋 불필요)
.DS_Store          ← macOS 숨김 파일
.env.local         ← ❌ 목록에 없음 → git 추적 대상
.env.development.local
.env.test.local
.env.production.local
npm-debug.log*
```

**핵심**: `.env.local`은 CRA 기본 `.gitignore`에 포함되지 않는다.
- private repo라면 팀 공유용 API 키 파일로 활용 가능
- public repo라면 반드시 `.gitignore`에 추가해야 함 (키 노출 위험)

---

## CRA의 환경변수 규칙

CRA는 환경변수 이름에 특별한 규칙이 있다.

| 변수명 | 브라우저에서 접근 가능? |
|---|---|
| `REACT_APP_`으로 시작 | ✅ `process.env.REACT_APP_XXX`로 접근 가능 |
| 그 외 (`PORT`, `HOST` 등) | ❌ 브라우저 번들에 포함되지 않음 |

```bash
# .env.local 예시
REACT_APP_API_KEY=abc123       # 브라우저에서 접근 가능 → 주의!
REACT_APP_API_URL=http://...   # 브라우저에서 접근 가능 → 주의!
SECRET_KEY=xyz                 # 브라우저에 노출 안 됨
```

**우리 프로젝트의 경우**: `REACT_APP_ANTHROPIC_API_KEY` 등의 키가
`.env.local`에 있지만, 실제로는 백엔드(`server/`)에서만 사용하므로
브라우저에 노출되지 않는다.

---

## CRA의 한계

- 빌드 설정을 커스터마이징하려면 `npm run eject` 필요 (되돌릴 수 없음)
- 최근에는 **Vite**, **Next.js** 등 더 빠른 대안이 많이 사용됨
- CRA는 2023년 이후 공식 유지보수가 사실상 중단된 상태
