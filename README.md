# Cà Mau Portal – app video, tin tức, du lịch

App chạy trên điện thoại (PWA + bản APK Android) lấy nội dung từ Cổng thông tin điện tử tỉnh Cà Mau:
- **Video** từ https://camau.gov.vn/media (YouTube nhúng chính thức)
- **Tin tức** (Kinh tế, Văn hóa – Xã hội, Chính sách – Pháp luật, Tin tức – Sự kiện)
- **Du lịch** từ https://camau.gov.vn/du-lich-1

Có tìm kiếm không dấu, yêu thích, lịch sử xem, chia sẻ, chạy offline phần giao diện, tự đổi sáng/tối.

---

## 1. Đưa lên GitHub và bật tự động cập nhật hằng ngày

1. Tạo repo mới trên GitHub (ví dụ `camau-portal`), đẩy toàn bộ thư mục này lên nhánh `main`.
2. Vào **Settings → Pages → Source: GitHub Actions**.
3. Vào tab **Actions → "Cập nhật dữ liệu và đăng web" → Run workflow** để chạy lần đầu.

Từ đó mỗi ngày **06:00 giờ Việt Nam** GitHub tự lấy video/tin/du lịch mới, ghi vào `data/`, rồi đăng lại web tại
`https://<tên-bạn>.github.io/camau-portal/`. Mở địa chỉ này trên điện thoại → *Thêm vào màn hình chính* là dùng được như app.

Nếu một bước cập nhật lỗi (ví dụ trang nguồn đổi cấu trúc), workflow hiện cảnh báo vàng và vẫn giữ dữ liệu cũ, app không bị hỏng.

## 2. Build file APK

1. Tab **Actions → "Build APK" → Run workflow** (mất khoảng 5–10 phút).
2. Chạy xong, kéo xuống mục **Artifacts**, tải `CaMauPortal-apk` → giải nén → được `CaMauPortal-debug.apk`.
3. Chép sang điện thoại Android, mở file, cho phép "cài từ nguồn không xác định" → cài.

Bản APK đọc dữ liệu mới từ trang GitHub Pages ở bước 1 (cần làm bước 1 trước), nên **không phải cài lại APK mỗi khi có video/tin mới**. Chỉ cần build lại APK khi sửa giao diện.
Đẩy tag (ví dụ `git tag v1.0.0 && git push --tags`) thì APK được đính luôn vào mục **Releases** để gửi link cho người khác tải.

### Bản chính thức để đưa lên Google Play (tuỳ chọn)
APK "debug" chỉ để cài thử/nội bộ. Đưa lên cửa hàng cần file **AAB** ký bằng khoá của bạn:

```bash
keytool -genkeypair -v -keystore camau.jks -alias camau -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 camau.jks      # copy kết quả dán vào secret bên dưới
```
Trong repo: **Settings → Secrets and variables → Actions**, thêm 4 secret: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Chạy lại Build APK sẽ có thêm `CaMauPortal-release.apk` và `CaMauPortal-release.aab`. **Giữ file .jks cẩn thận** – mất khoá là không cập nhật được app trên Google Play nữa. Mã gói là `vn.gov.camau.portal` (đổi trong `capacitor.config.json` *trước khi* đăng lần đầu).

## 3. Chạy thử trên máy tính

```bash
python3 -m http.server 8080     # mở http://localhost:8080
node tools/update_videos.mjs --dry     # xem thử cập nhật video
node tools/update_news.mjs --dry       # xem thử cập nhật tin tức/du lịch
```
(Cần Node 18+, không cần cài thư viện cho các lệnh trên.)

## 4. Cấu trúc

```
index.html, css/, js/       giao diện và logic (js/config.js: địa chỉ dữ liệu từ xa cho bản APK)
data/videos.json            video + chuyên mục
data/news.json              tin tức + du lịch
sw.js, manifest.webmanifest chạy offline, cài như app
assets/logo.png, icons/     logo Cà Mau Portal, icon app
tools/update_videos.mjs     lấy video mới từ camau.gov.vn/media
tools/update_news.mjs       lấy tin tức + du lịch (RSS của Cổng đang trống nên đọc thẳng trang chuyên mục)
tools/build_www.mjs         gom file web (dùng cho Pages và APK)
tools/android_icons.py      tạo icon Android từ logo
capacitor.config.json       cấu hình đóng gói APK
.github/workflows/          site.yml (cập nhật + đăng web), build-apk.yml (build APK)
```
Khi sửa giao diện, đổi `VERSION` trong `sw.js` (ví dụ `v3`) để điện thoại nhận bản mới.

## 5. Những điều cần lưu ý

- **Bộ lấy dữ liệu chưa thử trên trang thật.** Tôi đã kiểm tra bằng trang giả lập có cùng kiểu đường dẫn (`/chuyên-mục/slug-ID`) và dữ liệu mẫu lấy từ trang chủ thật, nhưng chưa chạy được trên `camau.gov.vn`. Lần chạy đầu trên GitHub, mở log của bước "Cập nhật…" xem số bài đọc được. Nếu báo 0 hoặc lỗi, gửi log cho người hỗ trợ để chỉnh.
- **Mục Du lịch lúc đầu trống** cho tới khi bộ lấy tin đọc được trang du lịch lần đầu. Mỗi lần chỉ đọc trang đầu của mỗi chuyên mục (chưa đọc các trang 2, 3…), tin cũ hơn được tích lũy dần theo từng ngày.
- **Bài tin chỉ hiện tóm tắt** và nút "Đọc toàn bài" mở trang gốc trên camau.gov.vn (không sao chép toàn văn).
- **Video YouTube trong bản APK:** chưa thử trên điện thoại thật. Nếu video báo lỗi trong APK (YouTube đôi khi từ chối trình phát nhúng trong app), nút "YouTube" ở trang xem video vẫn mở được video bên ngoài.
- **Bản quyền:** nội dung thuộc Cổng thông tin điện tử tỉnh Cà Mau, app luôn ghi nguồn và dẫn về trang gốc. Trước khi đăng lên cửa hàng ứng dụng nên xin ý kiến Cổng về việc dùng tên và logo.
