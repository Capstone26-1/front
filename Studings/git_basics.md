# Git 기초 정리

## 1. 숨김 파일(`.`으로 시작)과 git

macOS/Linux에서 `.`으로 시작하는 파일은 **숨김 파일**이다.
`ls` 명령어 기본 옵션에서는 보이지 않고, `ls -a`로 확인 가능하다.

**하지만 git은 숨김 여부와 무관하게 커밋 가능하다.**

`.gitignore`에 등록되어 있지 않으면 숨김 파일도 전부 추적된다.

```bash
git add .env.local    # ✅ 커밋 가능
git add .gitignore    # ✅ 커밋 가능
git add .omc/         # ✅ 커밋 가능 (.gitignore에 없다면)
```

---

## 2. 하위 디렉토리가 스테이징/커밋 안 되는 경우

### 원인 A: `.gitignore`에 등록된 경우

`.gitignore`에 등록된 파일/폴더는 git이 무시한다.

```
# .gitignore 예시
node_modules/    ← 이 폴더 전체 무시
.env.local       ← 이 파일 무시
*.log            ← .log 확장자 전체 무시
```

### 원인 B: 하위 디렉토리가 또 다른 git repo인 경우

하위 디렉토리 안에 `.git/` 폴더가 존재하면,
상위 repo는 그 폴더를 **파일이 아닌 별도의 git repo(submodule 포인터)**로 인식한다.

```
project/           ← 상위 git repo (.git/ 존재)
└── subdir/
    └── .git/      ← 하위에도 .git/ 존재 → 상위에서 내용 커밋 불가
```

이 경우 `git add subdir/`를 해도 내용이 스테이징되지 않는다.
이를 **git submodule** 문제라고 한다.

**해결 방법:**
```bash
# 하위 .git/ 폴더 제거 후 다시 add
rm -rf subdir/.git
git add subdir/
```

또는 `.gitignore`에 해당 폴더를 등록해서 아예 제외한다.

---

## 3. 현재 프로젝트 .gitignore 내용

> 파일 위치: `/FE/.gitignore` (CRA 기본 템플릿 기반)

```
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build

# misc
.DS_Store
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

**주의**: `.env.local`은 이 목록에 없으므로 git 추적 대상이다.
팀 공유 환경변수 파일을 private repo에 커밋할 때 활용 가능하다.
(public repo라면 절대 커밋하면 안 됨)
