# やるべきこと — 하루 계획 웹사이트

시간별 일정 + 챙길 것/할 일 체크리스트. 노트북과 핸드폰에서 같은 내용이 보이도록 동기화됩니다.

## 기능
- 표지 → 클릭하면 시작 (같은 탭에서 새로고침하면 표지는 건너뜀)
- 위쪽 날짜(`10/23/金`)는 실제 날짜에 맞춰 자동 변경, 자정이 지나면 자동으로 다음 날로
- ◀ ▶ 로 이전/다음 날 이동 (今日は → 明日は → 明後日は → この日は …), 제목을 누르면 오늘로 복귀
- `+` 로 항목 추가 (시간은 이전 항목 +1시간이 자동 입력, 시간 숫자를 눌러 수정: `530` → `05:30`)
- 입력칸에서 Enter → 바로 아래에 새 항목
- 항목을 **오른쪽 → 왼쪽으로 밀면 삭제** (노트북에서는 마우스로 끌어서)
- 아래 체크리스트는 체크하면 취소선
- 적은 내용은 자동 저장 (새로고침해도 유지)

---

## 1. 깃허브에 올려서 웹사이트로 만들기 (GitHub Pages)

1. github.com 에서 **New repository** → 이름 예: `planner` → Public → Create
2. 저장소 화면에서 **Add file → Upload files** → 이 폴더의 파일 5개
   (`index.html`, `style.css`, `app.js`, `firebase-config.js`, `README.md`)를 끌어다 놓고 **Commit changes**
3. **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
4. 1~2분 뒤 `https://<깃허브아이디>.github.io/planner/` 로 접속

여기까지만 해도 사용 가능하지만, 이때는 **기기마다 따로 저장**됩니다 (화면 맨 아래 "この端末にのみ保存中").

## 2. 노트북 ↔ 핸드폰 동기화 설정 (Firebase, 무료)

1. https://console.firebase.google.com → **프로젝트 추가** (애널리틱스는 꺼도 됨)
2. **빌드 → Authentication → 시작하기 → Sign-in method → Google** 사용 설정 → 저장
3. Authentication → **설정 → 승인된 도메인 → 도메인 추가** → `<깃허브아이디>.github.io`
4. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
5. Firestore → **규칙** 탭에 아래를 붙여넣고 **게시**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   (본인 계정으로 로그인했을 때 본인 데이터만 읽고 쓸 수 있게 하는 규칙)

6. **프로젝트 설정(⚙️) → 일반 → 내 앱 → 웹(`</>`)** → 앱 등록 → 나오는 `firebaseConfig` 값을 복사
7. 깃허브 저장소에서 `firebase-config.js` 열기 → 연필(✏️) 아이콘 → 빈 칸에 값 붙여넣기 → Commit
8. 사이트 새로고침 → 맨 아래 **「Googleでログインして同期する」** 클릭 → 노트북과 핸드폰에서 **같은 구글 계정**으로 로그인

이제 한쪽에서 적으면 다른 쪽에 바로 반영됩니다. 오프라인에서도 적을 수 있고, 연결되면 자동으로 올라갑니다.
로그인 전에 그 기기에 적어둔 내용도 로그인할 때 함께 올라갑니다.

> `firebase-config.js`의 값은 공개돼도 괜찮습니다. 데이터는 5번의 보안 규칙으로 보호됩니다.

## 핸드폰 홈 화면에 앱처럼 추가
- iPhone(Safari): 공유 → 홈 화면에 추가
- Android(Chrome): ⋮ → 홈 화면에 추가
