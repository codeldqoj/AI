# Chuyển catalog HTML sang MongoDB Atlas

## Trạng thái

Manifest trích từ HTML của phiên bản này gồm 64 đề, 75 nhóm nội dung,
354 câu hỏi (78 ví dụ chuyên đề) và 12 khối nội dung chuyên đề.
Script chỉ bổ sung những khóa còn thiếu. Bản ghi MongoDB đã tồn tại, đặc biệt
nội dung do Admin chỉnh sửa, không bị ghi đè. Đây là giai đoạn nhập dữ liệu;
giao diện vẫn dùng HTML cho đến khi kiểm chứng xong và phát hành API-only.

### Kết quả kiểm kê Atlas ngày 25/9/2026

Data Explorer hiển thị 28 `exams`, 78 `content_sets`, 456 `problems` và chưa có
`content_blocks`. Truy vấn `{ sourceGroup: 'tst', examId: { $exists: false } }`
trả 158 bản ghi. Ví dụ `specialty:chapter-2:example-1` đã tồn tại nhưng manifest
dùng khóa `specialty:chapter-2:example-1-1`; đề Hùng Vương hiện dùng tiền tố
`tst:` trong khi manifest dùng `tst-national:`. Vì vậy các khóa không khớp
không đồng nghĩa với nội dung còn thiếu. Dry-run sẽ báo xung đột và chặn nhập;
cần lập ánh xạ khóa cũ–mới, giữ `_id`, bài nộp và nội dung Admin đã chỉnh sửa.

### Dry-run thực tế do người vận hành cung cấp

Báo cáo cho thấy 64 đề, 75 nhóm, 354 câu và 12 khối trong manifest;
Atlas có 28 đề, 78 nhóm, 456 câu và 0 khối. Chỉ 6 nhóm khớp khóa;
0 đề và 0 câu khớp khóa. Script báo 423 xung đột và `writes: 0`.
Các số `insert` (64/69/354/12) chỉ là **số khóa thiếu**, không phải
số bản ghi được phép nhập: đề và câu đã tồn tại dưới khóa cũ. Cặp
`matchedWithoutSetId` và `matchedWithoutExamId` bằng 0 vì chưa khớp khóa;
không chứng minh rằng các bản ghi cũ đều có liên kết. Bản script trước
chỉ xuất 100 xung đột đầu; từ phiên bản này báo cáo xuất đủ để đối chiếu.
Tuyệt đối chưa chạy apply với báo cáo này.

Nếu cần so chính xác 203 cặp khác HTML, đặt thêm
`$env:CATALOG_REVIEW_PATH='catalog-review.json'` trước khi chạy dry-run.
File này chứa nguyên văn nội dung câu ở manifest và Atlas, chỉ tạo khi
đặt biến trên; không đưa vào Git. Rà soát và chia sẻ file theo quyền
truy cập phù hợp vì có thể chứa nội dung đã được Admin chỉnh sửa.

### Đối chiếu 423 ứng viên từ báo cáo tiếp theo

Báo cáo `reportVersion: 2` có 423 `candidates`, tương ứng 5 đề,
64 nhóm và 354 câu. Trong 354 cặp câu, 151 cặp có `contentEqual: true`,
203 cặp khác HTML (78 chuyên đề, 8 đề thử VMO, 113 TST, 4 lịch sử
Đà Nẵng–Quảng Nam). Có 20 khóa nhóm Atlas đang là nhóm chung cho hai
ngày trong manifest; không được ánh xạ hai nhóm ngày về cùng một `_id`.
Bốn khóa đề Atlas là đích của năm ứng viên; riêng hai ngày KHTN cùng
trỏ đến một đề Atlas ngày 3, không thể tự động coi là cùng đề.
Toàn bộ 354 ứng viên câu có `existingExamId` rỗng. Đây là thống kê
trên các cặp ứng viên, không phải kết luận về cả collection `problems`.

Trước khi ghi, cần so 203 cặp khác HTML với nội dung thực tế, tách
nhóm theo ngày, xác minh khóa đề và `examId`; giữ nguyên `_id` của câu
Atlas để không làm đứt liên kết bài nộp và giữ nội dung Admin đã sửa.
151 cặp trùng HTML chỉ là bằng chứng về trường `content`, vẫn cần
kiểm tra `setId`, lời giải, nguồn tham khảo và trạng thái. Không chạy
`catalog:apply` hiện tại: chế độ này vẫn chủ động chặn toàn bộ xung đột.

### Kiểm tra nguyên văn 203 cặp khác HTML

Đã đối chiếu file `catalog-review.json` (203/203 cặp): 113 câu TST
khác HTML nhưng có độ giống văn bản rất cao; điều đó **không** đủ
chứng minh tương đương toán học. Ví dụ câu CSP ngày 2 về dãy số hỏi
`a_{2727}` trong manifest, trong khi bản Atlas hỏi `a_{27^{27}}`.
Không được thay bản Atlas bằng manifest hoặc coi cặp này trùng nội dung.

Hai câu lịch sử trong manifest có markup hỏng sau trích xuất HTML:
`history-dn-qn:hist-dn-2017-2018:question-7` và
`history-dn-qn:hist-qn-2020-2021:question-3`. Câu thứ hai có thể
đang trùng bản Atlas hỏng, nên cả những cặp `contentEqual: true`
vẫn cần kiểm tra cú pháp. Cần khôi phục hai câu từ đề gốc/nguồn đã
xác minh và sửa bộ trích xuất trước khi chuyển sang API-only.

Đã sửa hai bất đẳng thức chứa dấu `<` trong HTML nguồn để DOM parser
không hiểu nhầm thành thẻ, tái tạo hai câu trong manifest và thêm kiểm
tra chặn mẫu HTML hỏng. Đã sửa chỉ số CSP trong HTML và manifest thành
`a_{27^{27}}` theo bản Atlas được xác nhận là đúng. Các thay đổi nguồn
không ghi đè bản ghi Atlas.

Chiến lược hòa giải: giữ `_id`, các lời giải và phần chỉnh sửa Admin
trong bản Atlas; ánh xạ khóa cũ–mới chỉ sau khi xác nhận từng cặp;
tạo đề/nhóm riêng theo ngày cho các nhóm Atlas đang gộp; bổ sung
`examId`/`setId` theo quan hệ đã kiểm chứng. Cần chạy đối chiếu sau
migration và kiểm tra frontend/API trên Preview trước khi phát hành.
Quy tắc ưu tiên: khi câu trong Atlas đã tồn tại, nội dung Atlas là
nguồn chuẩn; thay đổi manifest chỉ dùng để chuẩn hóa nguồn và điền
nội dung thực sự thiếu, không sửa nội dung câu đã lưu ở Atlas.

Có thể chạy `npm run catalog:plan -- catalog-report.json` để tạo kế
hoạch ánh xạ chỉ đọc từ báo cáo dry-run. Công cụ yêu cầu đầy đủ ứng viên,
kiểm tra ánh xạ câu 1:1 và xuất các nhóm/đề chung cần tách theo ngày.
Kế hoạch này không sửa Atlas, không xác nhận hai câu tương đương và
không thay thế dry-run mới sau khi manifest được sửa.

Để xác định quan hệ theo ngày trước khi xây migration có ghi, đặt
`$env:CATALOG_RELATIONS_PATH='catalog-relations.json'` rồi chạy lại
`npm run catalog:dry-run`. File riêng này chỉ có `_id`, khóa, metadata
và liên kết hiện có của đề/nhóm/câu; không chứa nguyên văn câu hỏi
hoặc chuỗi kết nối. Nó giúp kiểm tra 20 nhóm dùng chung, 5 đề va
chạm và các câu chưa có `examId`. Không thêm file vào Git.

Chạy `npm run catalog:plan -- catalog-report.json catalog-relations.json`
để kiểm tra ánh xạ câu 1:1 trên snapshot quan hệ. Với snapshot đã
nhận ngày 25/9, kết quả là 354 câu cũ cần gắn lại nhóm (276 câu gắn
đề, 78 ví dụ chuyên đề không gắn đề); 102 câu động giữ nguyên.
Kế hoạch tạo 64 đề, 69 nhóm và 12 khối mới, giữ 456 `_id` câu cũ.
102 câu động hiện trỏ tới `examId` và `setId` hợp lệ. Snapshot này
không tự kiểm tra việc Admin sửa nội dung sau ngày chụp; phải chạy lại
dry-run/preflight với Atlas ngay trước bất kỳ thao tác ghi nào.

`catalog:reconcile-dry-run` kiểm tra trực tiếp Atlas với hai snapshot:

```powershell
$env:CATALOG_REPORT_PATH = 'catalog-report.json'
$env:CATALOG_RELATIONS_PATH = 'catalog-relations.json'
npm run catalog:reconcile-dry-run
```

Công cụ so `_id`, khóa, `setId` và SHA-256 của nội dung câu với snapshot,
kiểm tra 102 câu động còn trỏ đúng đề/nhóm, và dừng nếu dữ liệu đã
thay đổi. Bản kế hoạch có chế độ ghi riêng nhưng chưa được chạy trong
môi trường Atlas ở PR này. Khi được kiểm thử và bật, nó tạo bản sao
EJSON độc quyền trước khi bắt đầu transaction, tạo đề/nhóm/khối mới,
gắn lại các câu cũ mà không thay `contentKey`, `_id`, `content`, lời giải
hay tham chiếu. Nếu điều kiện kiểm tra hoặc transaction lỗi, sẽ không
phát hành frontend API-only.

## Chạy kiểm kê

1. Tạo bản sao lưu Atlas của `exams`, `content_sets`, `problems`, `content_blocks`
   trước khi chạy chế độ ghi. Dùng database user chỉ đọc cho dry-run.
2. Đặt `MONGODB_URI` trong môi trường máy cục bộ, chỉ rõ database `/vmo_tst`.
   Không đưa URI vào Git, nhật ký hoặc nội dung trao đổi.
3. Chạy `npm ci`, rồi `npm run catalog:dry-run`.
   Trên PowerShell, có thể xuất JSON riêng, không trộn stderr với stdout:
   `$env:CATALOG_REPORT_PATH='catalog-report.json'; npm run catalog:dry-run`.
   Báo cáo đúng phiên bản có `reportVersion: 2` và số phần tử trong
   `conflicts` bằng `conflictCount`. File này chỉ chứa khóa/metadata,
   không chứa chuỗi kết nối; đừng thêm file báo cáo vào Git.
   `candidates` liệt kê khóa manifest và khóa Atlas có thể tương ứng;
   với câu hỏi có thêm SHA-256 nội dung và `contentEqual`. Hash không
   chứng minh hai câu cùng nghĩa khi HTML khác, và script không tự hợp nhất.
   Đối chiếu riêng cặp nhiều nguồn cùng trỏ một bản ghi, liên kết
   `setId`/`examId` và các nội dung đã sửa trước khi lập ánh xạ chính thức.
4. Đối chiếu `manifest`, `plan`, `conflicts` và tổng số bản ghi trong Atlas.
   Mọi xung đột khóa hoặc anchor đều chặn ghi. Đối chiếu riêng các câu có
   cùng nội dung nhưng khác khóa; công cụ không thể tự kết luận chúng trùng.
   Nếu `matchedWithoutSetId` hoặc `matchedWithoutExamId` khác 0, phải đối chiếu
   và bổ sung liên kết các bản ghi cũ trước khi giao diện chỉ đọc qua API.
5. Khi báo cáo không còn xung đột và bản sao lưu đã hoàn tất, chạy
   `CATALOG_APPLY=YES npm run catalog:apply` bằng user có quyền ghi.
   Chạy lại dry-run để xác nhận số `insert` bằng 0.

Không chạy apply trên production khi chưa đối chiếu các câu đã tồn tại với
manifest. Import dùng upsert `$setOnInsert`, có thể chạy lại nếu bị ngắt.
`examId` được lưu theo chuỗi ObjectId như các đề tạo bởi API hiện tại;
`setId` là ObjectId. Sau nhập cần kiểm tra các bản ghi cũ còn thiếu liên kết.

## Điều kiện chuyển frontend sang API-only

- Toàn bộ danh mục và lời giải được đối chiếu, các khóa cũ và bài nộp còn truy cập được.
- API phục vụ chuyên đề, đề, câu hỏi, sidebar và thống kê đầy đủ, phân trang theo đề.
- Kiểm tra MathJax, lọc, tìm kiếm, bài nộp, AI và chức năng Admin trên Preview.
- Khi API lỗi, trang hiển thị trạng thái lỗi và thử lại, không đọc HTML tĩnh.
