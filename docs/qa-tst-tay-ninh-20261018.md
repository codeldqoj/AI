# Kiểm thử Câu 3 hình học — TST Tây Ninh 2026–2027

Ngày kiểm tra: 18/10/2026. Nhánh: `feature/ai-guide-geometry-diagrams-20261018`.
Bản preview: https://vmo-tst-git-feature-ai-guide-ge-f03496-vutrhuy81-6018s-projects.vercel.app/index.html

## Nhận diện đúng dữ liệu

- Tây Ninh, năm 2026–2027, ngày thi thứ 1: 19/09/2026.
- Câu 3 (5đ), Hình học; khóa `tst:tst-tay-ninh:day-1:question-3`.
- Không nhầm Câu 3 ngày 2 (7đ), Tổ hợp.
- Đề: tứ giác lồi ABCD; O=AC∩BD; các đường d1,d2,d3 qua O vuông góc AB,AD,BC; G∈d1; F=GA∩d2, H=GB∩d3; A giữa G,F và B giữa G,H. K,L là trực tâm OAD,OBC. Chứng minh KL là trục đẳng phương của hai đường tròn đường kính AB,CD; họ FH qua điểm cố định hoặc có phương cố định.

## Kết quả kiểm thử trực tiếp trên giao diện

Đã đăng nhập qua biểu mẫu bảo mật; mở Đề TST → Tây Ninh → AI Hướng dẫn giải của đúng bài. Hướng dẫn khôi phục từ MongoDB, có huy hiệu RAG EXACT và kiểm định 5.0/5.0; hình SVG đã lưu hiển thị gồm 12 nhãn điểm, 13 đoạn và 2 đường tròn.

Kiểm tra độc lập từ tọa độ SVG đang hiển thị, không dùng lại kết quả duyệt của AI:

| Điều kiện | Kết quả |
|---|---|
| O thuộc cả AC và BD | Sai số chuẩn hóa ≤ 7.7e-17 |
| OG⊥AB, OF⊥AD, OH⊥BC và các đường cao xác định K,L | Sai số tích vô hướng chuẩn hóa ≤ 1.3e-14 |
| G,A,F và G,B,H thẳng hàng | Sai số chuẩn hóa ≤ 3.6e-16 |
| A giữa G,F; B giữa G,H | Tham số lần lượt 0.7341772152 và 0.2784810127, đều trong (0,1) |
| Tâm hai đường tròn là trung điểm AB,CD | Sai số tọa độ SVG bằng 0 |
| Phương tích của K,L đối với hai đường tròn | Chênh lệch tuyệt đối ≤ 1.1e-11 pixel² |
| K≠L, F≠H, hai đường chéo không vuông góc | Đạt |

Hình lưu chưa vẽ đủ độ dài của một số đường phụ: có đoạn GA/GB kết thúc ở A/B và đoạn OK/OL kết thúc ở K/L, trong khi F/H nằm trên phần kéo dài. Các tọa độ thỏa phép dựng, nhưng hình nên bổ sung các đoạn GF,GH,OF,OH để dễ đọc.

Đã bấm In/Xuất PDF và quan sát nút được bật lại sau khi chuẩn bị. Không xác nhận đã tạo được tệp PDF hoặc chụp ảnh: trình duyệt hạn chế thao tác quan sát cửa sổ/ảnh sau đăng nhập bảo mật. Không ghi, sửa hoặc xóa bản ghi hướng dẫn.

Không chạy yêu cầu AI dựng hình mới: hình hợp lệ đã tồn tại nên giao diện không có nút Tạo/Thử lại hình vẽ. Kết quả trên xác nhận luồng khôi phục/hiển thị, không thay thế kiểm thử trực tiếp mô hình sinh hình.

## Kiểm thử hồi quy số học riêng cho đề

`node test/tst-tay-ninh-geometry.test.mjs` sử dụng các phép dựng số học độc lập trên cấu hình tương đương hình đang hiển thị: A=(0,0), B=(6,0), C=(5,4), D=(-1,3), O=(90/43,72/43), G=(90/43,-2).

- Kiểm tra tứ giác lồi, O trong hai đường chéo, các điều kiện không vuông góc, hai điều kiện nằm giữa và phương tích.
- 55 vị trí G hợp lệ kiểm tra FH qua cùng một giao điểm AB∩KL.
- 60 vị trí G hợp lệ kiểm tra FH∥AB khi AB∥KL nhưng d2≠d3.
- 56 vị trí G hợp lệ kiểm tra FH=KL khi AD∥BC trong hình thang không phải hình bình hành.

Đây là kiểm tra số học các cấu hình đại diện, không phải chứng minh tổng quát và không phải kết quả gọi Gemini/GPT thật. Sau khi bổ sung ca này vào `npm test`, toàn bộ 21 nhóm kiểm thử đã chạy thành công.

## Lỗ hổng trong lời giải đã lưu

Lời giải chứa suy luận: “Khi AD∥BC, tứ giác là hình bình hành”. Suy luận này sai. Phản ví dụ thỏa điều kiện hình học: với O=(0,0), lấy A=(4,1), B=(1,3), C=(-8,-2), D=(-1/2,-3/2). Khi đó AD∥BC nhưng AB không song song CD; các điều kiện không vuông góc của đề vẫn được thỏa mãn. Kết luận của bài vẫn đúng, nhưng đoạn chứng minh dựa trên hình bình hành chưa bao quát trường hợp hình thang.

Có thể thay đoạn loại F=H bằng lập luận không cần hình bình hành:

Chọn O làm gốc, viết C=-rA, D=-sB với r,s>0. Nếu AD∥BC thì rs=1. Giả sử F=H=T. Vì A,B lần lượt nằm giữa G,T, suy ra G,T∈AB và G là hình chiếu vuông góc của O lên AB. Viết A=G+α(T-G), B=G+β(T-G), trong đó 0<α,β<1. Từ G·(T-G)=0, có

    T·A=|G|²+α|T-G|²>0,
    T·B=|G|²+β|T-G|²>0.

Nhưng T∈d2 và AD có phương rA+B nên T·(rA+B)=0, mâu thuẫn. Do đó F≠H, và FH=d2=d3=KL là đường thẳng cố định.

Báo cáo ghi nhận lỗi để người quản trị rà soát; không tự động sửa hướng dẫn trong MongoDB. Huy hiệu kiểm định AI không thay thế kiểm chứng toán học độc lập.
