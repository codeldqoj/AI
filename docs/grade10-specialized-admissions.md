# Đề thi vào lớp 10 chuyên – danh mục và triển khai

Đối chiếu ngày 16/10/2026: 81 trường (73 trường địa phương, 8 trường trực thuộc đại học), tổ chức theo 34 tỉnh/thành hiện tại. Đây là danh mục điều hướng; không tự tạo đề hoặc câu hỏi giả trong Atlas.

## Nguyên tắc đối chiếu

- Danh sách HUIT năm 2026 có địa giới mới nhưng chứa nhiều mã lịch sử cho cùng một trường: khử trùng theo trường, không theo mã tuyển sinh.
- Danh sách ĐH Mở TP.HCM năm 2026 giữ địa giới/mã cũ và một số dữ liệu cũ. Đối chiếu tên hiện tại; bổ sung Chu Văn An, Sơn Tây, KHXH&NV; không thêm Trung học Thực hành ĐHSP TP.HCM vào nhóm hiện tuyển hệ chuyên.
- Chuyên Long An được ghi dưới tên hiện tại Trần Văn Giàu; tên cũ là alias tìm kiếm. Hai trường Lê Quý Đôn tại Khánh Hòa được phân biệt Nam Nha Trang / Đông Hải.
- Tân Tạo giữ đúng tên Trường THPT Năng khiếu Đại học Tân Tạo; có thông báo tuyển sinh lớp 10 chuyên 2026–2027 riêng.

## Kiến trúc

`specialized-admission` là category độc lập; `specialized_admission` là sourceGroup. Mã trường + năm + ngày thi phân biệt đề, nhóm câu hỏi và lịch sử. Province/school/region/authority lấy từ danh mục server; không tin nhãn tùy ý từ client.

Tái sử dụng luồng hiện có: OCR đề → rà soát câu → lưu Atlas → tải summary/detail lười → Sao chép, Nộp bài, AI Hướng dẫn giải, Quản lý nguồn; quản trị sửa/xóa đề và quản lý câu. Sidebar tỉnh → trường → năm, tìm không dấu, bộ lọc Bắc/Trung/Nam.

## Danh mục trường

| Tỉnh/thành hiện tại | Trường | Cơ quan quản lý | Nguồn |
|---|---|---|---|
| An Giang | Trường THPT chuyên Huỳnh Mẫn Đạt | Sở GDĐT An Giang | huit-2026 |
| An Giang | Trường THPT chuyên Thoại Ngọc Hầu | Sở GDĐT An Giang | huit-2026 |
| An Giang | Trường THPT chuyên Thủ Khoa Nghĩa | Sở GDĐT An Giang | huit-2026 |
| Bắc Ninh | Trường THPT chuyên Bắc Giang | Sở GDĐT Bắc Ninh | huit-2026 |
| Bắc Ninh | Trường THPT chuyên Bắc Ninh | Sở GDĐT Bắc Ninh | huit-2026 |
| Cao Bằng | Trường THPT chuyên Cao Bằng | Sở GDĐT Cao Bằng | huit-2026 |
| Cà Mau | Trường THPT chuyên Bạc Liêu | Sở GDĐT Cà Mau | huit-2026 |
| Cà Mau | Trường THPT chuyên Phan Ngọc Hiển | Sở GDĐT Cà Mau | huit-2026 |
| Cần Thơ | Trường THPT chuyên Lý Tự Trọng | Sở GDĐT Cần Thơ | huit-2026 |
| Cần Thơ | Trường THPT chuyên Nguyễn Thị Minh Khai | Sở GDĐT Cần Thơ | huit-2026 |
| Cần Thơ | Trường THPT chuyên Vị Thanh | Sở GDĐT Cần Thơ | huit-2026 |
| Gia Lai | Trường THPT chuyên Chu Văn An | Sở GDĐT Gia Lai | huit-2026 |
| Gia Lai | Trường THPT chuyên Hùng Vương | Sở GDĐT Gia Lai | huit-2026 |
| Gia Lai | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Gia Lai | huit-2026 |
| Huế | Trường THPT chuyên Khoa học Huế | Trường ĐH Khoa học – ĐH Huế | university-khoa-hoc-hue |
| Huế | Trường THPT chuyên Quốc Học – Huế | Sở GDĐT Huế | ou-2026 |
| Hà Nội | Trường THPT chuyên Chu Văn An | Sở GDĐT Hà Nội | huit-2026 |
| Hà Nội | Trường THPT chuyên Hà Nội – Amsterdam | Sở GDĐT Hà Nội | huit-2026 |
| Hà Nội | Trường THPT chuyên Khoa học Tự nhiên | Trường ĐH Khoa học Tự nhiên – ĐHQGHN | university-khoa-hoc-tu-nhien |
| Hà Nội | Trường THPT chuyên Khoa học Xã hội và Nhân văn | Trường ĐH KHXH&NV – ĐHQGHN | university-khoa-hoc-xa-hoi-va-nhan-van |
| Hà Nội | Trường THPT chuyên Ngoại ngữ | Trường ĐH Ngoại ngữ – ĐHQGHN | university-ngoai-ngu |
| Hà Nội | Trường THPT chuyên Nguyễn Huệ | Sở GDĐT Hà Nội | huit-2026 |
| Hà Nội | Trường THPT chuyên Sơn Tây | Sở GDĐT Hà Nội | huit-2026 |
| Hà Nội | Trường THPT chuyên Đại học Sư phạm | Trường ĐH Sư phạm Hà Nội | university-dai-hoc-su-pham |
| Hà Tĩnh | Trường THPT chuyên Hà Tĩnh | Sở GDĐT Hà Tĩnh | huit-2026 |
| Hưng Yên | Trường THPT chuyên Hưng Yên | Sở GDĐT Hưng Yên | huit-2026 |
| Hưng Yên | Trường THPT chuyên Thái Bình | Sở GDĐT Hưng Yên | huit-2026 |
| Hải Phòng | Trường THPT chuyên Nguyễn Trãi | Sở GDĐT Hải Phòng | huit-2026 |
| Hải Phòng | Trường THPT chuyên Trần Phú | Sở GDĐT Hải Phòng | huit-2026 |
| Khánh Hòa | Trường THPT chuyên Lê Quý Đôn – Nam Nha Trang | Sở GDĐT Khánh Hòa | huit-2026 |
| Khánh Hòa | Trường THPT chuyên Lê Quý Đôn – Đông Hải | Sở GDĐT Khánh Hòa | huit-2026 |
| Lai Châu | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Lai Châu | huit-2026 |
| Lào Cai | Trường THPT chuyên Lào Cai | Sở GDĐT Lào Cai | huit-2026 |
| Lào Cai | Trường THPT chuyên Nguyễn Tất Thành | Sở GDĐT Lào Cai | huit-2026 |
| Lâm Đồng | Trường THPT chuyên Bảo Lộc | Sở GDĐT Lâm Đồng | huit-2026 |
| Lâm Đồng | Trường THPT chuyên Nguyễn Chí Thanh | Sở GDĐT Lâm Đồng | huit-2026 |
| Lâm Đồng | Trường THPT chuyên Thăng Long | Sở GDĐT Lâm Đồng | huit-2026 |
| Lâm Đồng | Trường THPT chuyên Trần Hưng Đạo | Sở GDĐT Lâm Đồng | huit-2026 |
| Lạng Sơn | Trường THPT chuyên Chu Văn An | Sở GDĐT Lạng Sơn | huit-2026 |
| Nghệ An | Trường THPT chuyên Phan Bội Châu | Sở GDĐT Nghệ An | huit-2026 |
| Nghệ An | Trường THPT chuyên Đại học Vinh | Trường ĐH Vinh | university-dai-hoc-vinh |
| Ninh Bình | Trường THPT chuyên Biên Hòa | Sở GDĐT Ninh Bình | huit-2026 |
| Ninh Bình | Trường THPT chuyên Lê Hồng Phong | Sở GDĐT Ninh Bình | huit-2026 |
| Ninh Bình | Trường THPT chuyên Lương Văn Tụy | Sở GDĐT Ninh Bình | huit-2026 |
| Phú Thọ | Trường THPT chuyên Hoàng Văn Thụ | Sở GDĐT Phú Thọ | huit-2026 |
| Phú Thọ | Trường THPT chuyên Hùng Vương | Sở GDĐT Phú Thọ | huit-2026 |
| Phú Thọ | Trường THPT chuyên Vĩnh Phúc | Sở GDĐT Phú Thọ | huit-2026 |
| Quảng Ngãi | Trường THPT chuyên Lê Khiết | Sở GDĐT Quảng Ngãi | huit-2026 |
| Quảng Ngãi | Trường THPT chuyên Nguyễn Tất Thành | Sở GDĐT Quảng Ngãi | huit-2026 |
| Quảng Ninh | Trường THPT chuyên Hạ Long | Sở GDĐT Quảng Ninh | huit-2026 |
| Quảng Trị | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Quảng Trị | huit-2026 |
| Quảng Trị | Trường THPT chuyên Võ Nguyên Giáp | Sở GDĐT Quảng Trị | huit-2026 |
| Sơn La | Trường THPT chuyên Sơn La | Sở GDĐT Sơn La | ou-2026 |
| Thanh Hóa | Trường THPT chuyên Lam Sơn | Sở GDĐT Thanh Hóa | huit-2026 |
| Thành phố Hồ Chí Minh | Trường Phổ thông Năng khiếu | ĐHQG TP.HCM | university-pho-thong-nang-khieu |
| Thành phố Hồ Chí Minh | Trường THPT chuyên Hùng Vương | Sở GDĐT Thành phố Hồ Chí Minh | huit-2026 |
| Thành phố Hồ Chí Minh | Trường THPT chuyên Lê Hồng Phong | Sở GDĐT Thành phố Hồ Chí Minh | huit-2026 |
| Thành phố Hồ Chí Minh | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Thành phố Hồ Chí Minh | huit-2026 |
| Thành phố Hồ Chí Minh | Trường THPT chuyên Trần Đại Nghĩa | Sở GDĐT Thành phố Hồ Chí Minh | huit-2026 |
| Thái Nguyên | Trường THPT chuyên Bắc Kạn | Sở GDĐT Thái Nguyên | huit-2026 |
| Thái Nguyên | Trường THPT chuyên Thái Nguyên | Sở GDĐT Thái Nguyên | huit-2026 |
| Tuyên Quang | Trường THPT chuyên Hà Giang | Sở GDĐT Tuyên Quang | huit-2026 |
| Tuyên Quang | Trường THPT chuyên Tuyên Quang | Sở GDĐT Tuyên Quang | tuyen-quang |
| Tây Ninh | Trường THPT Năng khiếu Đại học Tân Tạo | Trường ĐH Tân Tạo | university-nang-khieu-dai-hoc-tan-tao |
| Tây Ninh | Trường THPT chuyên Hoàng Lê Kha | Sở GDĐT Tây Ninh | huit-2026 |
| Tây Ninh | Trường THPT chuyên Trần Văn Giàu | Sở GDĐT Tây Ninh | huit-2026, rename-tran-van-giau |
| Vĩnh Long | Trường THPT chuyên Bến Tre | Sở GDĐT Vĩnh Long | huit-2026 |
| Vĩnh Long | Trường THPT chuyên Nguyễn Bỉnh Khiêm | Sở GDĐT Vĩnh Long | huit-2026 |
| Vĩnh Long | Trường THPT chuyên Nguyễn Thiện Thành | Sở GDĐT Vĩnh Long | huit-2026 |
| Điện Biên | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Điện Biên | huit-2026 |
| Đà Nẵng | Trường THPT chuyên Lê Quý Đôn | Sở GDĐT Đà Nẵng | huit-2026 |
| Đà Nẵng | Trường THPT chuyên Lê Thánh Tông | Sở GDĐT Đà Nẵng | huit-2026 |
| Đà Nẵng | Trường THPT chuyên Nguyễn Bỉnh Khiêm | Sở GDĐT Đà Nẵng | huit-2026 |
| Đắk Lắk | Trường THPT chuyên Lương Văn Chánh | Sở GDĐT Đắk Lắk | huit-2026 |
| Đắk Lắk | Trường THPT chuyên Nguyễn Du | Sở GDĐT Đắk Lắk | huit-2026 |
| Đồng Nai | Trường THPT chuyên Bình Long | Sở GDĐT Đồng Nai | huit-2026 |
| Đồng Nai | Trường THPT chuyên Lương Thế Vinh | Sở GDĐT Đồng Nai | huit-2026 |
| Đồng Nai | Trường THPT chuyên Quang Trung | Sở GDĐT Đồng Nai | huit-2026 |
| Đồng Tháp | Trường THPT chuyên Nguyễn Quang Diêu | Sở GDĐT Đồng Tháp | huit-2026 |
| Đồng Tháp | Trường THPT chuyên Nguyễn Đình Chiểu | Sở GDĐT Đồng Tháp | huit-2026 |
| Đồng Tháp | Trường THPT chuyên Tiền Giang | Sở GDĐT Đồng Tháp | huit-2026 |

## Nguồn đối chiếu

- `huit-2026`: https://huit.edu.vn/Images/Documents/N00CT/ds-truong-chuyen-nam-2026.pdf
- `crosscheck`: https://vi.wikipedia.org/wiki/Danh_sách_trường_trung_học_phổ_thông_chuyên_tại_Việt_Nam
- `rename-tran-van-giau`: https://thptchuyentranvangiau.edu.vn/thong-bao/thong-bao-ve-viec-doi-ten-truong.html
- `university-khoa-hoc-tu-nhien`: https://www.hsgs.edu.vn/vi/thong-tin-chung/tuyen-sinh-a-thi-thu?layout=default
- `university-dai-hoc-su-pham`: https://thanhnien.hnue.edu.vn/Học-bổng/p/1987
- `university-ngoai-ngu`: https://flss.vnu.edu.vn/files/uploads/2026/03/1.pdf
- `university-khoa-hoc-xa-hoi-va-nhan-van`: https://ussh.vnu.edu.vn/vi/news/dao-tao/thong-bao-so-1-ve-viec-tuyen-sinh-vao-lop-10-truong-thpt-chuyen-khoa-hoc-xa-hoi-nhan-van-nam-hoc-2026-2027-23965.html
- `university-dai-hoc-vinh`: https://tuyensinh.vinhuni.edu.vn/tin-tuc-tuyen-sinh/seo/thong-bao-so-1-tuyen-sinh-vao-lop-10-truong-thpt-chuyen-truong-dai-hoc-vinh-nam-hoc-2026-2027-143834
- `university-khoa-hoc-hue`: https://tuyensinh-thpt.husc.edu.vn/tintuc.php?id=8
- `university-pho-thong-nang-khieu`: https://ptnk.edu.vn/thongbaoso1-ts10-2026-2027/
- `university-nang-khieu-dai-hoc-tan-tao`: https://ttst.edu.vn/thong-bao-tuyen-sinh/
- `tuyen-quang`: https://www.tuyenquang.gov.vn/vi/post/kiem-tra-cong-tac-chuan-bi-to-chuc-thi-lai-ky-thi-tot-nghiep-thpt-nam-2026-tai-diem-thi-truong-thpt-chuyen-tuyen-quang?id=250229&type=NEWS
- `ou-2026`: https://tuyensinh.ou.edu.vn/danh-muc-cac-truong-thpt-chuyenthpt-nang-khieu-nam-2026

## Giới hạn kiểm chứng

Danh mục được tổng hợp theo các nguồn trên, không phải một API đăng bạ toàn quốc thời gian thực. Tên trường/đơn vị hành chính có thể tiếp tục thay đổi; nguồn và mốc đối chiếu được giữ để cập nhật. Kiểm thử tự động dùng database và phản hồi OCR giả lập, chưa nhập đề thực vào Atlas hay chạy OCR/AI có trả phí trong nhánh này.

Nhánh tạo từ main 5edcb6b; không gộp thay đổi của PR #34 đang mở.
