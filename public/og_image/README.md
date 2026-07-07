# OG 이미지 (소셜 공유 썸네일)

이 폴더의 이미지가 링크 공유 시(카카오톡/페북/트위터) 나타나는 **썸네일**입니다.

현재 `index.html` 은 **`/og_image/og.png`** 를 가리키고, 이 폴더에 `og.png`(1197×633)가
들어 있습니다. 이미지를 바꾸려면 **같은 이름 `og.png` 로 덮어쓰기** 하세요.

## ⚠️ 흔한 실수: 이중 확장자 (og.png.jpg)

Windows 는 기본적으로 확장자를 숨깁니다. JPG 파일의 이름을 `og.png` 로 바꾸면
실제로는 **`og.png.jpg`** 가 되어, `/og_image/og.png` 요청이 404 → **흰 박스**로 보입니다.
(실제 파일 확장자 = `index.html` 의 경로가 반드시 일치해야 합니다.)

해결:
- 파일 탐색기 → 보기 → **"파일 확장명" 체크**를 켜서 실제 확장자를 확인하세요.
- PNG 이미지는 `og.png`, JPG 이미지는 `og.jpg` 로 저장하고, 확장자가 다르면
  `index.html` 의 `og:image` / `twitter:image` 경로도 그에 맞게 바꾸세요.

## 배포 후 확인

- 먼저 브라우저에서 `https://homechatbot.netlify.app/og_image/og.png` 를 직접 열어
  이미지가 뜨는지 확인(404 면 파일/배포 문제, 뜨면 아래 크롤러 캐시 문제).
- 크롤러 캐시가 강해 즉시 안 바뀔 수 있음 → 캐시 갱신:
  - 카카오: https://developers.kakao.com/tool/debugger/sharing (캐시 삭제)
  - 페북: https://developers.facebook.com/tools/debug/ (Scrape Again)
