# Nâng cấp v35 — 2026-10-15

Nguồn trước nâng cấp: v31, saved version `appgprj_6acf9dfd789c819198d80d7d5a80f69f~appgver_5f0da3071f7c8191892eb2505a0519a5`, commit `6617a2ac5d11a2547fafb4b31c7a86740713fb55`.

## Dữ liệu và quay lại

- Không đổi tên database `lang-nghe-account-<Google sub>`, khóa bài, cơ chế Google hoặc cookie phiên.
- Database bổ sung `lang-nghe-study-<Google sub>`, schema 1, stores records/backups/logs. IndexedDB version transaction tuần tự hóa nâng cấp; migration mới không xóa store cũ. Log schema được ghi cùng transaction.
- Khi mở Không gian luyện tập lần đầu, sao chụp books/files/settings vào backup trước thay đổi. Nếu hết dung lượng thì dừng mở công cụ và thông báo lỗi, không sửa bài gốc.
- Các bản nháp, phiên bản phụ đề, đáp án, từ vựng và bản thu ở kho mới. Chỉ thao tác Lưu phiên bản mới mới cập nhật cues/caption của bài đang học. ID bài giữ nguyên; segment IDs được giữ khi sửa nội dung/thời gian; gộp/tách tạo ID mới và lưu nguồn.
- Dữ liệu mở rộng không bị xóa khi quay về mã v31. Có thể triển khai lại saved version trên để khôi phục giao diện. Bản cũ đọc được các trường audio/cues/caption hiện có và bỏ qua trường bổ sung.
- Nếu cần khôi phục nội dung cũ, dùng v35 → Dữ liệu & đồng bộ → Khôi phục bản sao. Mục trùng ID có nội dung khác được giữ thành bản riêng, không xóa dữ liệu hiện tại. Cũng có thể xuất định dạng sao lưu thư viện cũ ở mục Dữ liệu & sao lưu trước khi quay về v31.
- Xuất đầy đủ tạo envelope có SHA-256, tài khoản đích, schema_version, audio base64, phụ đề và lịch sử, đáp án, từ vựng, bản thu, settings và các bản sao trước nâng cấp. Khôi phục kiểm tra checksum/tài khoản/metadata/audio trước khi nhập; không dùng file JSON để đăng nhập hay phục hồi cookie.
- Trước lần ghi study/shared đầu tiên, Worker tự sao lưu accounts/* và shared/* vào upgrade-backups/pre-v35 theo lô, có CAS lease và manifest pre-v35. Chưa hoàn tất thì trả 503, không ghi dữ liệu yêu cầu; lần tiếp theo tiếp tục từ cursor. Không sao chép sessions/nonces. Admin cũng có thể tạo các bản sao accounts/shared bổ sung vào backups/<id> bằng công cụ trên giao diện. Dữ liệu private của thành viên không được đưa vào bản sao Admin.

## Chức năng

- Biên tập: thời gian mili giây, nội dung, thêm/xóa/gộp/tách, dịch hàng loạt, sắp xếp, tìm/thay, hoàn tác/làm lại, nháp, lịch sử, so sánh, phục hồi thành phiên bản mới, SRT/VTT. Chồng lấn/câu ngắn cần chấp nhận; lỗi thời gian âm/đảo/ngoài audio/câu trống chặn lưu. Nút Admin xuất bản phụ đề chung lưu bản cũ ở shared/history trước CAS update.
- Chép chính tả: câu/nhóm đã chọn/toàn bài, giới hạn nghe tùy chọn, căn chỉnh từ, WER, 3 mức gợi ý, lưu câu trả lời và tiến độ theo lesson/subtitle/segment, tự chuyển chỉ khi bật và đúng 100%.
- Luyện nói: chọn MIME MediaRecorder được hỗ trợ, xin mic theo thao tác, dừng track khi đóng/chuyển chế độ/ẩn trang, tối đa 120 giây/20 MB, lưu/phát/tải/xóa trên thiết bị. Không tự đồng bộ bản thu. Không có chấm phát âm hay nhận dạng giọng nói trong đợt này (giai đoạn mở rộng trong đặc tả).
- Từ vựng: từ/cụm từ, nghĩa/ghi chú do người dùng nhập, IPA nếu có, ví dụ/câu/bài nguồn, tìm/lọc/sửa/xóa/đã thuộc; flashcard, đọc từ bằng speechSynthesis nếu trình duyệt có giọng tiếng Anh; thuật toán simple-srs-1 có timestamp UTC và 4 mức đánh giá.
- Đồng bộ: cần xác nhận tài khoản đích. Metadata tự đồng bộ 30 giây khi có mạng và trang đang mở sau khi đã bật; nút Đồng bộ ngay và sự kiện online. Đồng bộ audio và bản thu cần chọn riêng. Không tự chuyển database ẩn danh hoặc dữ liệu tài khoản khác. Hàng đợi records.dirty giữ sau lỗi/401/mất mạng. Đăng nhập đã xác minh trên thiết bị có thể mở lại dữ liệu cục bộ khi offline; YouTube vẫn cần mạng.
- Mỗi tài khoản có namespace SHA-256 riêng trên R2; Admin không có API đọc private của tài khoản khác. Record revision server/CAS, operation ID chống gửi trùng, thời gian máy chủ. Xung đột giữ fork cục bộ và yêu cầu chọn, không âm thầm ghi đè. Tombstone giữ không thời hạn ở bản đầu để tránh thiết bị cũ phục hồi dữ liệu đã xóa. Remote tombstone không xóa audio/bài gốc trên thiết bị.
- Giới hạn: 5.000 records/10 MB metadata/500 MB audio đồng bộ mỗi tài khoản; 90 MB/file đồng bộ hoặc shared cloud, audio cá nhân trên thiết bị vẫn 200 MB. Audio đồng bộ kiểm MIME, chữ ký định dạng phổ biến, dung lượng và SHA-256 bằng DigestStream Cloudflare; không giữ cả file trong bộ nhớ Worker.
- Nút Xóa dữ liệu đồng bộ đánh dấu tombstone cho metadata, xóa file cloud, giữ bản trên thiết bị. Xóa một bản thu đánh dấu xóa; file cloud được giữ tới khi dùng Xóa dữ liệu đồng bộ. Chưa có lịch dọn file tự động.

## Giới hạn cần nghiệm thu thực tế

- Phụ đề trực tiếp YouTube trên Worker vẫn cần dịch vụ trích xuất riêng; tải SRT/VTT đang hoạt động. Không coi chức năng này là đã được triển khai mới.
- Kiểm tra tự động gồm 100 câu SRT/VTT đến mili giây, WER, SRS, restore/checksum lớp dữ liệu, account isolation/idempotency/CAS, mô phỏng hai thiết bị xung đột, UI editor/dictation/vocab và từ chối microphone. Các luồng legacy vẫn chạy trong bộ regression.
- Cần người dùng kiểm tra microphone trên trình duyệt/thiết bị thực và đồng bộ file thực sau đăng nhập Google. Các kiểm tra DOM/mocked R2 không thay thế nghiệm thu Safari/Chrome di động hoặc đường truyền thực.
- Công cụ khôi phục toàn bộ R2 từ backup Admin chưa được cung cấp trên UI; khôi phục hạ tầng phải dùng owner/backend. Backup manifest không chứa cookie hoặc Client Secret.
- Phần cuối FR-506 của tệp đặc tả bị cắt tại “Đ”; bản này cung cấp các trạng thái đã lưu cục bộ/đang đồng bộ/đã đồng bộ/lỗi/hết phiên/xung đột.
