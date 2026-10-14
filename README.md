# Lắng nghe

Ứng dụng thư viện audio lưu trên thiết bị bằng IndexedDB. Không gửi audio lên máy chủ.

Chạy `npm start` rồi mở http://127.0.0.1:4173. Để chạy kiểm tra, dùng `npm install` rồi `npm test` (PowerShell dùng `npm.cmd` nếu script bị chặn). Kiểm tra tự động dùng mô phỏng DOM/audio và IndexedDB để kiểm chứng đổi bài, chỉnh sửa, lưu tiến độ, phát lặp và khôi phục; chưa thay thế kiểm thử trên trình duyệt thật.

Tính năng: thêm/chỉnh sửa/xóa audio (tối đa 200 MB/bài), SRT/VTT, tìm kiếm, lưu tiến độ/tốc độ/câu đã chọn, lặp A–B và lặp nhóm câu, chỉnh lệch phụ đề, xuất/nhập JSON chứa audio, giao diện offline.

Theo dõi từng từ tô sáng đồng thời từ tiếng Anh và IPA trong khung đang nghe và danh sách. Mốc từ được ước lượng trong khoảng SRT theo độ dài từ và dấu câu; không phải căn chỉnh từ bằng nhận dạng audio. Bỏ chú thích [music]/[singing] khỏi chuỗi từ cần tô sáng. Có nút bật/tắt ghi nhớ trên thiết bị. Ba nút tốc độ hiện trực tiếp: Mặc định (1×), 0,75×, 0,5×; lựa chọn lưu theo bài.

Khu vực nghe gồm ba cụm: trước, đang nghe, tiếp theo. Cụm chính chứa cả tiếng Anh và IPA, highlight từ; hai cụm phụ giữ chữ nhỏ hơn. Khi lặp câu, trước/sau theo thứ tự các câu đã chọn. IPA bật/tắt cho cả ba cụm. Làm sạch chú thích trong ngoặc vuông, dấu >> và HTML entities khi đọc phụ đề; bỏ các mục chỉ có âm thanh. Bài cũ được đọc lại từ SRT gốc đã lưu, giữ mốc thời gian các đoạn có lời và ánh xạ lại lựa chọn theo mốc và nội dung.

Triển khai thư mục `dist` lên hosting HTTPS. Không mở trực tiếp index.html bằng file://. Dữ liệu gắn với trình duyệt và địa chỉ website; đổi địa chỉ cần xuất/nhập bản sao lưu. Xóa dữ liệu website có thể xóa thư viện. Sao lưu JSON có thể tốn bộ nhớ với thư viện lớn vì audio được mã hóa Base64.

Giao diện dùng font Google Fonts khi có mạng; offline dùng font hệ thống. IPA Anh–Mỹ tra từng từ trong bộ dữ liệu CMUdict đóng gói sẵn (126.046 mục), bỏ chú thích audio và đánh dấu từ chưa có bằng ⟨từ⟩. Nút Hiển thị IPA lưu lựa chọn trên thiết bị. Phiên âm từ điển không thể hiện nối âm hoặc tự chọn nghĩa của từ có nhiều cách đọc. Xem dist/IPA-LICENSE.txt. Tạo lại dữ liệu bằng `node scripts/build-ipa.mjs` sau khi cài dependencies. Không có tự tạo phụ đề trong phiên bản này.
