# Lắng nghe

Ứng dụng thư viện audio lưu trên thiết bị bằng IndexedDB. Không gửi audio lên máy chủ.

Chạy `npm start` rồi mở http://127.0.0.1:4173. Chạy `npm test` để kiểm tra xử lý phụ đề và khoảng câu.

Tính năng: thêm/chỉnh sửa/xóa audio (tối đa 200 MB/bài), SRT/VTT, tìm kiếm, lưu tiến độ/tốc độ/câu đã chọn, lặp A–B và lặp nhóm câu, chỉnh lệch phụ đề, xuất/nhập JSON chứa audio, giao diện offline.

Triển khai thư mục `dist` lên hosting HTTPS. Không mở trực tiếp index.html bằng file://. Dữ liệu gắn với trình duyệt và địa chỉ website; đổi địa chỉ cần xuất/nhập bản sao lưu. Xóa dữ liệu website có thể xóa thư viện. Sao lưu JSON có thể tốn bộ nhớ với thư viện lớn vì audio được mã hóa Base64.

Giao diện dùng font Google Fonts khi có mạng; offline dùng font hệ thống. Không có tự tạo phụ đề hoặc IPA trong phiên bản này.
