# Lắng nghe

Ứng dụng thư viện audio cá nhân lưu trên thiết bị bằng IndexedDB. Các bài dùng chung do Admin tải lên được lưu trên máy chủ.

## Tài khoản và phân quyền

**Thêm bài bằng YouTube:** trong Thêm bài nghe/Chỉnh sửa chọn Nguồn bài nghe → Link YouTube, nhập tên và link video (`youtube.com/watch`, `youtu.be`, Shorts, embed hoặc live có video ID). Bấm **Lấy phụ đề từ YouTube** → chọn ngôn ngữ/bản phụ đề (gồm cả tự động khi có) → **Dùng phụ đề này**; xem trước rồi Lưu. Hoặc tải SRT/VTT lên để dùng phụ đề riêng. Áp dụng cho cả bài cá nhân và bài chung của Admin. Đổi link hoặc chọn file phụ đề mới sẽ bỏ lựa chọn YouTube cũ để tránh gán sai phụ đề cho video khác.

Máy chủ dùng yt-dlp để liệt kê phụ đề công khai và lấy bản được chọn, không tải audio/video và không đọc cookie trình duyệt. Chạy `npm run setup:captions` để tải binary chính thức từ GitHub, kiểm tra SHA-256 và đặt trong `.tools/` (không đưa vào Git). Script hỗ trợ Windows/Linux x64 và macOS; nền tảng khác cài yt-dlp rồi đặt `YTDLP_PATH`. Cần kết nối YouTube trên máy chủ; cập nhật bằng cách chạy lại script khi YouTube đổi cơ chế. `GOOGLE_CLIENT_ID` không cần thay đổi cho chức năng phụ đề. API phụ đề yêu cầu đăng nhập, tối đa hai tác vụ đồng thời, giới hạn lượt gọi, thời gian và dung lượng; không cache trong service worker. Không phải video nào cũng lấy được phụ đề: video riêng tư, không có phụ đề hoặc bị YouTube giới hạn sẽ báo lỗi và cho tải SRT/VTT thay thế.

YouTube hiển thị thanh nghe gọn giống file audio: phát/tạm dừng, thời gian, timeline kéo tua và tắt/bật tiếng. Khung hình không hiển thị; nguồn vẫn phát bằng YouTube IFrame Player API, không tải hay tách audio về máy. Cần mạng, video công khai và cho phép nhúng; có link xem trên YouTube khi nhúng không phát được. Trình duyệt di động hoặc YouTube có thể chặn phát khi ở nền. Phụ đề đã chọn được lưu cùng bài và đồng bộ theo thời gian video để lặp câu, A–B, tiến độ và điều khiển tốc độ (tùy tốc độ video hỗ trợ). Thời lượng được đọc khi mở video; live chưa có thời lượng cố định chưa hỗ trợ luyện theo câu. Sai số seek và quảng cáo tùy trình phát YouTube. Phụ đề tự động được ghép từ các đoạn có mốc thời gian, bỏ trùng liên tiếp và chặn phần thời gian chồng nhau.

Admin cũng có thể chọn Link YouTube khi thêm bài dùng chung và ghim cho mọi người. Người dùng thêm link vào danh sách riêng không tải file video về máy. Sao lưu/khôi phục giữ link, phụ đề và tiến độ; video vẫn cần tồn tại trên YouTube. Tài liệu API: https://developers.google.com/youtube/iframe_api_reference.

Thư viện có hai phần: **Thư viện dùng chung** và **Danh sách của tôi**. Admin tải audio (tối đa 200 MB) kèm SRT/VTT (tối đa 5 MB) lên máy chủ, ghim/bỏ ghim hoặc xóa bài chung. Bài ghim được xếp đầu cho mọi tài khoản đăng nhập. Chỉ Admin được thực hiện các thay đổi này; API kiểm tra quyền trên máy chủ. Nút Làm mới cập nhật danh sách sau khi Admin khác đăng bài.

Mọi người có thể bấm **Thêm vào của tôi** để tải bản riêng và mở bài. Tiến độ, câu đã chọn, chỉnh sửa và xóa bản riêng không thay đổi bài chung. Thêm lại cùng bài sẽ mở bản đã có, giữ chỉnh sửa cá nhân. Admin xóa bài chung không xóa những bản người dùng đã tải về. Danh sách cá nhân vẫn lưu riêng theo tài khoản trên trình duyệt, chưa đồng bộ giữa thiết bị.

Bài chung lưu ở `data/shared/` gồm catalog và file audio, bên ngoài thư mục `dist`. Cần sao lưu cả thư mục này cùng `data/accounts.json`; có thể đổi vị trí bằng `SHARED_DIRECTORY`. File audio chỉ truy cập qua API có phiên đăng nhập, hỗ trợ HTTP Range, không được service worker cache. Bài chỉ xuất hiện với người dùng sau khi audio tải lên hoàn tất. Cần Node server chạy và kết nối mạng để tải bài chung. Static hosting chỉ chứa `dist` sẽ không có chức năng này.

Chạy bản dùng thử trên máy: `npm run start:demo` (PowerShell: `npm.cmd run start:demo`), mở http://127.0.0.1:4173. Màn hình có ba nút: Admin, Thành viên 1, Thành viên 2. Đây là tài khoản giả lập, không phải đăng nhập Google. Chế độ thử chỉ bật khi `AUTH_DEMO=true`, chưa có Google Client ID và `APP_ORIGIN` là localhost/127.0.0.1; không dùng để triển khai công khai.

Admin vào nút tên tài khoản → Quản lý tài khoản để xem danh sách, đổi quyền Admin/Thành viên và khóa/mở khóa. Không được tự khóa hoặc tự đổi quyền. Người bị đổi quyền hoặc khóa sẽ hết phiên và phải đăng nhập lại; tài khoản bị khóa không thể đăng nhập. Tài khoản xuất hiện sau lần đăng nhập đầu tiên. Thành viên chỉ quản lý thư viện của mình. Quyền quản lý tài khoản được kiểm tra trên máy chủ, không dựa vào nút hiển thị trên giao diện.

Mỗi tài khoản có cơ sở dữ liệu IndexedDB riêng trên cùng trình duyệt. Audio chưa đồng bộ lên máy chủ hoặc giữa các máy. Đây là phân tách trong ứng dụng, không phải mã hóa dữ liệu trên thiết bị: người có quyền truy cập công cụ phát triển/dữ liệu trình duyệt vẫn có thể đọc dữ liệu cục bộ. Thư viện trước khi bật tài khoản vẫn ở cơ sở dữ liệu `lang-nghe`, không tự chuyển cho bất kỳ tài khoản nào. Để chuyển bài cũ: chạy chế độ chưa cấu hình tài khoản (`npm start`, không có biến môi trường Google/demo), xuất sao lưu; sau đó đăng nhập tài khoản mong muốn và khôi phục sao lưu.

Để bật Google thật:

1. Tạo OAuth client loại Web trong Google Cloud và khai báo Authorized JavaScript origins đúng địa chỉ app (ví dụ `http://127.0.0.1:4173` cho local, tên miền HTTPS khi triển khai).
2. Sao chép `.env.example` thành `.env`; điền `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `ADMIN_EMAILS` (email Admin, phân cách dấu phẩy), giữ `AUTH_DEMO=false`.
3. Chạy `npm run start:configured`. Google Identity Services trả ID token; máy chủ xác minh bằng `google-auth-library`. Không cần Client Secret cho luồng này. Danh sách `ADMIN_EMAILS` chỉ cấp quyền khi tài khoản được tạo lần đầu; các lần sau dùng quyền đã lưu.
4. Triển khai Node server sau reverse proxy HTTPS cùng origin, chuyển tiếp cả `/api/*` và file tĩnh. Không chỉ upload `dist` lên static hosting nếu muốn dùng tài khoản. Máy chủ hiện lắng nghe loopback, proxy cần chạy cùng máy.

Tài khoản/quyền lưu trong `data/accounts.json` (không đưa vào Git); cần ổ đĩa bền vững và sao lưu khi triển khai. Phiên đăng nhập lưu trong bộ nhớ máy chủ, cookie HttpOnly/SameSite và Secure trên HTTPS; khởi động lại server sẽ đăng xuất mọi phiên. Các API tài khoản không được service worker cache. Khi dùng tài khoản, mở app cần kết nối máy chủ để xác minh phiên. Bản hiện tại dành cho một Node process, chưa hỗ trợ nhiều server dùng chung phiên.

Tài liệu Google: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid và https://developers.google.com/identity/gsi/web/guides/verify-google-id-token.

Chạy `npm start` rồi mở http://127.0.0.1:4173. Để chạy kiểm tra, dùng `npm install` rồi `npm test` (PowerShell dùng `npm.cmd` nếu script bị chặn). Kiểm tra tự động dùng mô phỏng DOM/audio và IndexedDB để kiểm chứng đổi bài, chỉnh sửa, lưu tiến độ, phát lặp và khôi phục; chưa thay thế kiểm thử trên trình duyệt thật.

Tính năng: thêm/chỉnh sửa/xóa audio (tối đa 200 MB/bài), SRT/VTT, tìm kiếm, lưu tiến độ/tốc độ/câu đã chọn, lặp A–B và lặp nhóm câu, chỉnh lệch phụ đề, xuất/nhập JSON chứa audio, giao diện offline.

Theo dõi từng từ tô sáng đồng thời từ tiếng Anh và IPA trong khung đang nghe và danh sách. Mốc từ được ước lượng trong khoảng SRT theo độ dài từ và dấu câu; không phải căn chỉnh từ bằng nhận dạng audio. Bỏ chú thích [music]/[singing] khỏi chuỗi từ cần tô sáng. Có nút bật/tắt ghi nhớ trên thiết bị. Ba nút tốc độ hiện trực tiếp: Mặc định (1×), 0,75×, 0,5×; lựa chọn lưu theo bài.

Khu vực nghe cố định ở đáy màn hình: trước, đang nghe, tiếp theo, rồi media và điều khiển. Cụm chính chứa tiếng Anh + IPA và highlight từ; trước/sau chỉ hiện tiếng Anh. Có thu gọn để giữ cụm chính và media. Thư viện và cài đặt nằm trong dialog; danh sách câu chỉ mở khi cần, dữ liệu/sao lưu nằm trong thư viện. ResizeObserver đo thanh đáy và chừa vùng nội dung không bị che. Khi lặp câu, trước/sau theo thứ tự các câu đã chọn. Làm sạch chú thích trong ngoặc vuông, dấu >> và HTML entities khi đọc phụ đề; bỏ các mục chỉ có âm thanh. Bài cũ được đọc lại từ SRT gốc đã lưu, giữ mốc thời gian các đoạn có lời và ánh xạ lại lựa chọn theo mốc và nội dung.

Triển khai thư mục `dist` lên hosting HTTPS. Không mở trực tiếp index.html bằng file://. Dữ liệu gắn với trình duyệt và địa chỉ website; đổi địa chỉ cần xuất/nhập bản sao lưu. Xóa dữ liệu website có thể xóa thư viện. Sao lưu JSON có thể tốn bộ nhớ với thư viện lớn vì audio được mã hóa Base64.

Giao diện dùng font Google Fonts khi có mạng; offline dùng font hệ thống. IPA Anh–Mỹ tra từng từ trong bộ dữ liệu CMUdict đóng gói sẵn (126.046 mục), bỏ chú thích audio và đánh dấu từ chưa có bằng ⟨từ⟩. Nút Hiển thị IPA lưu lựa chọn trên thiết bị. Phiên âm từ điển không thể hiện nối âm hoặc tự chọn nghĩa của từ có nhiều cách đọc. Xem dist/IPA-LICENSE.txt. Tạo lại dữ liệu bằng `node scripts/build-ipa.mjs` sau khi cài dependencies. Không có tự tạo phụ đề trong phiên bản này.
