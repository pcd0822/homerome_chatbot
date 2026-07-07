# OG 이미지 (소셜 공유 썸네일)

이 폴더에 넣은 이미지가 웹페이지를 카카오톡/페이스북/트위터 등에 공유할 때
나타나는 **썸네일 이미지**가 됩니다.

## 사용법

1. 원하는 이미지를 이 폴더에 **`og.png`** 라는 이름으로 저장하세요.
   (`index.html` 의 `og:image` / `twitter:image` 가 `/og_image/og.png` 를 가리킵니다.)
2. 권장 크기: **1200 × 630** (JPG 를 쓰려면 파일명을 `og.jpg` 로 하고
   `index.html` 의 두 meta 경로를 `/og_image/og.jpg` 로 바꾸세요.)
3. 다시 배포하면 반영됩니다.

## 참고

- 카카오톡·페이스북 등 일부 크롤러는 **절대 URL** 을 요구합니다. 배포 도메인이
  정해지면 `index.html` 의 `og:image`/`twitter:image` 를
  `https://<내도메인>/og_image/og.png` 전체 주소로 바꾸는 것이 가장 안정적입니다.
- 크롤러는 캐시가 강해서, 이미지를 바꿔도 즉시 반영되지 않을 수 있습니다.
  카카오톡: https://developers.kakao.com/tool/debugger/sharing 에서 캐시 삭제,
  페이스북: https://developers.facebook.com/tools/debug/ 에서 Scrape Again.
