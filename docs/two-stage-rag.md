# Retrieval hai tầng — bản preview 2026-09-30

Nhánh: `feature/two-stage-hybrid-rag-20260930`. Bắt đầu từ main `7d2069e6443cf80747e9240ee4871f280a8e18d9`.

## Luồng

Cả `/api/ai-guide` và `/api/ai-evaluate-solution` dùng `retrieveVerifiedContext`.

1. Backend giải quyết `contentKey`, ID Atlas hoặc ID cũ tới problem hiện hành, kiểm tra trạng thái/khóa AI và quyền đọc. Đề Atlas là nguồn chuẩn; client không được thay đề trong prompt.
2. Exact: tìm submission Admin xác minh theo các khóa chuẩn, so hash đề hiện hành với snapshot. Nguồn referenceSolution trong problem chỉ được dùng nếu `referenceSolutionProblemHash` khớp đề hiện tại; nguồn cũ chưa có hash không mặc nhiên được tin.
3. Hybrid khi exact không có: pre-filter active/admin_verified/topic; chạy Atlas Vector Search, Atlas Search và exact-tag lookup; hợp nhất RRF, lọc điều kiện, đọc lại submission/problem và kiểm tra hash/verification. Tối đa 3 nguồn khác nhau.
4. Nhận định SIMILAR chỉ hỗ trợ phương pháp; không phải đáp án cho bài mới. Gemini giải/chấm và GPT kiểm định vẫn giữ. Chấm bài phải chấp nhận phương pháp đúng khác nguồn.

Bản đầu chủ động yêu cầu tag toán học phù hợp; chưa dùng ngưỡng vector cố định khi chưa có corpus thật để hiệu chỉnh. Bộ tag là heuristics hữu hạn trong rag-core.js; không phải bộ chứng minh tương đương toán học. Nguồn không có tag phù hợp bị bỏ qua. Lọc giả thiết chỉ nhận diện một số điều kiện (nguyên, thực, dương, tam giác nhọn); prompt phải tiếp tục kiểm tra đầy đủ. Nếu không đủ nguồn, AI tự giải độc lập. Không có cam kết mọi bài tương tự đều được tìm thấy.

## Collection và trạng thái

- `verified_knowledge`: sourceId, sourceType (`submission` or `problem_reference`), problemId/key, hash đề/lời giải, trạng thái, topic/tags/constraints, searchText rút gọn, vector/model/dimensions/version. Không duplicate toàn bộ lời giải.
- `rag_index_jobs`: pending → processing → ready; failed thử tối đa 5 lần; revoked nếu nguồn không còn đủ điều kiện. Lease 60s cho job đang xử lý.
- `rag_retrieval_logs`: ID lần truy xuất, mục đích, source IDs/hash/matchType, số token, chi phí embedding ước tính, thời gian, lỗi/hạn chế. TTL 90 ngày. Không lưu lời giải hoặc thông tin người làm bài trong context nguồn; nhật ký có username người gọi và chỉ Admin đọc được.

Xác minh/sửa/thu hồi/xóa submission cập nhật hàng đợi. Lời giải mẫu trong ngân hàng câu hỏi cũng được lập chỉ mục khi Admin/Giáo viên xác minh và hash đề khớp; sửa đề hoặc lời giải, bỏ xác minh, ẩn đề sẽ làm nguồn cũ mất hiệu lực. Backfill phục hồi jobs bị bỏ lỡ. Lời giải do AI tự tạo không được học lại chỉ vì pipeline AI chấm đạt: cần được người có quyền xác minh trước. Đây là retrieval augmentation, không phải tự huấn luyện hoặc cập nhật trọng số mô hình; lời giải AI chưa duyệt không trở thành dữ liệu chuẩn.

Việc lập chỉ mục có thể cần chạy `rag_setup`, rồi `rag_backfill` và `rag_process` (hoặc chờ worker cron). Lời giải xác minh chính xác cho cùng một câu được dùng ngay qua exact retrieval; nguồn tương tự chỉ được cung cấp để tham khảo phương pháp. Kiểm tra cuối diễn ra ngay trước khi tạo prompt, không bảo đảm nguồn không thay đổi trong lúc model đang chạy.

Một nguồn có nội dung rất dài được cắt giới hạn để kiểm soát prompt; provenance ghi truncated. Nguồn đã xác minh được coi là tài liệu tham khảo, không mặc nhiên là lời giải hoàn chỉnh đạt điểm tối đa.

## Cấu hình Atlas / Vercel

Giữ các biến đã có: MONGODB_URI, JWT_SECRET, OPENAI_API_KEY và biến model Gemini/GPT. Thêm CRON_SECRET để bảo vệ worker cron.

Biến thêm:

- RAG_MODE=hybrid (mặc định); exact để tắt retrieval tầng 2 khi rollback.
- RAG_EMBEDDING_MODEL=text-embedding-3-small (mặc định).
- RAG_EMBEDDING_DIMENSIONS=1536 (mặc định). Model/query/index phải cùng kích thước.
- RAG_EMBEDDING_USD_PER_MILLION: giá embedding thực tế trong tài khoản; nếu thiếu, chi phí ghi null, không tự bịa giá.
- RAG_MIN_TAG_OVERLAP=0.25: mức phủ tag tối thiểu, cần hiệu chỉnh bằng corpus. Đây không phải vector similarity threshold.

Trong Database Hub → AI xu hướng đề → Kho tham chiếu đã xác minh:

1. Thiết lập chỉ mục (cần tài khoản Atlas có quyền quản lý Search indexes).
2. Chờ rag_vector_v1 và rag_text_v1 queryable/READY.
3. Đưa nguồn đã xác minh vào hàng đợi; bấm tiếp nếu còn trang.
4. Lập chỉ mục 3 nguồn tiếp theo, lặp lại cho tới khi ready. Mỗi nguồn tạo một embedding, có chi phí.
5. Xem nhật ký để xác nhận exact/hybrid/none, mã nguồn, trạng thái/lỗi.

CLI tương đương:

    npm run rag:index -- setup
    npm run rag:index -- backfill
    npm run rag:index -- backfill <cursor>
    npm run rag:index -- process

Tác vụ chạy từ CLI hoặc Admin theo batch; worker cron chạy mỗi ngày lúc 00:00 UTC (07:00 Việt Nam), tối đa 24 nguồn/lượt, yêu cầu CRON_SECRET. Cron Vercel chỉ chạy trên deployment production; preview dùng nút Admin hoặc CLI. Vì vậy submission mới xác minh dùng được qua exact ngay, nhưng phải xử lý job trước khi tham gia vector retrieval. Quản trị dùng API data hiện có (maxDuration 120s); worker dùng endpoint thứ 12 và xác thực Bearer CRON_SECRET. AI chừa ngân sách retrieval bằng timeout Gemini 130s và GPT 140s.

Thay embedding model/dimensions cần tạo lại index vector tương ứng và backfill; setup không tự phá/hủy chỉ mục đang có. Không dùng embedding các model khác nhau chung một không gian.

## Kiểm thử và đo

`npm test`: có trường hợp đúng khóa, đổi đề a_2727 → a_(27^27), khác giả thiết nhọn, thu hồi, xóa, sửa lời giải và nguồn chưa công khai. Có kiểm tra prompt chấp nhận phương pháp khác, không phải kiểm thử một model thực chấm phương pháp đó.

`npm run rag:benchmark`: 9 fixtures, mock candidate search, không gọi Atlas/embedding/model thật. Kết quả docs/rag-benchmark-offline.json chỉ đánh giá orchestration và kiểm tra nguồn. p50/p95 là thời gian mock trong bộ nhớ; không đại diện thời gian mạng. Baseline mô phỏng exact theo problemKey cũ, không đo lại toàn pipeline AI cũ.

Đo thật:

    node scripts/rag-benchmark-live.mjs labelled-cases.json > rag-benchmark-live.json

Corpus: mảng {name, problemRef, expectedSourceIds: [submissionId...]}; cần Admin gán nhãn độc lập. Tối thiểu nên có 50–100 bài đa chuyên đề, nhiều bài gần giống khác giả thiết và bài không có nguồn. Script đo Recall@3, precision, p50/p95 và token/chi phí embedding. Chưa đo chi phí sinh/chấm AI. Thực hiện riêng thử nghiệm chấm cặp lời giải cùng bài theo hai phương pháp đúng; đánh giá điểm, lỗi và chênh lệch bởi Admin.

Không xem điểm RRF là xác suất đúng. Chưa đủ điều kiện merge chỉ dựa trên benchmark mock; phải kiểm tra live Atlas và chất lượng Gemini/GPT trước khi merge.

## Preview và trạng thái nghiệm thu

PR nháp: https://github.com/vutrhuy81/vmo-tst/pull/31

Preview: https://vmo-tst-git-feature-two-stage-h-96cf89-vutrhuy81-6018s-projects.vercel.app/login.html

Vercel bot báo Ready. Phiên triển khai này chưa truy cập được nội dung preview do kết nối Vercel trả 403 cho project/team. Workspace không có MONGODB_URI hoặc OPENAI_API_KEY để chạy lập chỉ mục và benchmark thật. Cần cấp kết nối Vercel đúng team, xác nhận cấu hình preview, rồi chạy các bước Atlas và kiểm thử live trước merge.

## Sửa đổi sau kiểm thử Atlas — 2026-10-01

- `RAG_VERSION=2` là phiên bản metadata/retrieval; `EMBEDDING_VERSION=1` vẫn giữ định dạng embedding cũ. Chuẩn hóa chữ Đ trước khi phân loại; nhận diện Đại số và thêm thẻ khái niệm/phương pháp. Không suy ra tương đương toán học từ cùng chuyên đề.
- Hybrid yêu cầu ít nhất một thẻ cụ thể khớp và ngưỡng overlap. “Đường tròn”, “phương trình hàm”, “bất đẳng thức”, “tổ hợp”, “quy nạp” đơn lẻ không đủ. Không trả phí embedding khi không có nguồn đáp ứng thẻ. Đây là lựa chọn bảo thủ về precision; có thể giảm recall, cần corpus đa chuyên đề để hiệu chỉnh.
- Cache `rag_query_embeddings`: SHA-256 của input/model/dimensions, TTL 24 giờ, single-flight trong từng instance. Cache chỉ lưu vector; mỗi lần vẫn tìm và kiểm tra nguồn hiện tại, nội dung, xác minh và quyền truy cập. Log phân biệt miss/hit/shared/bypass; token/chi phí trên hit là 0 cho embedding, không phải toàn request AI.
- Chỉ chuẩn hóa khoảng trắng quanh một số quan hệ TeX (`\\ne`, `\\le`, …), bảo toàn số mũ/chỉ số và chuyển HTML sup/sub thành ký hiệu tương ứng. Không đơn giản hóa công thức hay coi hai giả thiết khác nhau là một.
- Gemini/GPT phải ghi kiểm tra suy biến cụ thể. Gate không chấp nhận kết quả thiếu kiểm tra; GPT phải approved=true khi công bố báo cáo đánh giá. Hướng dẫn dùng reasoning medium; model vẫn lấy từ cấu hình hiện hành. Gate là kiểm tra cấu trúc/cờ tự báo cáo, không thay cho chứng minh hình thức hay phản biện của giáo viên.

### Nâng cấp Atlas sau khi deployment preview sẵn sàng

1. Xác nhận preview có các biến môi trường đúng và xác định preview có dùng chung DB production hay không. Các thao tác thiết lập/backfill/process ghi metadata/chỉ mục, không sửa đề hoặc bài nộp. Nếu cùng DB, thực hiện trong khung kiểm thử. Nguồn v1 còn hợp lệ được giữ active khi chỉ nâng metadata; v2 chưa dùng nguồn đó cho đến khi metadata sẵn sàng. Nguồn có nội dung/verification không còn khớp vẫn bị loại ngay.
2. Admin → Database Hub → AI xu hướng đề → Kho tham chiếu đã xác minh → Thiết lập chỉ mục. Nâng cấp cộng thêm trường vào `rag_vector_v1` và `rag_text_v1`, giữ các trường cũ; không tạo thêm hai Search indexes vượt giới hạn Free cluster. Chờ READY/queryable.
3. Đưa nguồn đã xác minh vào hàng đợi, hết từng trang 100. Process từng batch 3. Input/model/dimensions giống hệt record cũ thì tái sử dụng vector; thay nội dung mới gọi provider. Nguồn bị thu hồi/xóa/đổi đề vẫn bị loại.
4. Xác nhận số nguồn Metadata v2 sẵn sàng, không còn pending/processing/failed; kiểm tra log token thực tế. Các phiên bản ứng dụng cũ vẫn sử dụng embedding version 1, nhưng metadata/hashes đã nâng cấp nên rollback cần kiểm tra nguồn lại; không tuyên bố rollback Atlas là hoàn toàn không ảnh hưởng.
5. Dùng cấu trúc `docs/rag-live-acceptance-template.json`, thay các placeholder bằng khóa/ID do Admin nhập trực tiếp trong giao diện; không commit corpus Atlas thật lên GitHub. Thêm 50–100 ca, các nguồn đúng khác phương pháp, và gán nhãn độc lập. Nhãn vắng mặt thì chỉ tính hiệu năng; forbiddenSourceIds kiểm tra riêng nguồn phải bị loại. Ca nguồn đã xóa được kiểm tra hồi quy mock; kiểm thử live dùng dữ liệu test riêng, không xóa bài thật.
6. Đo cả cache bật và bypass, lặp nhiều lần, xen kẽ thứ tự baseline/RAG. UI có pacing dưới 30 ca/phút, dừng sau ca hiện tại và giữ kết quả nếu lỗi. Không vô hiệu hóa timeout đăng nhập 5 phút; phiên benchmark dài cần tương tác thật của Admin. Không coi p95 của vài ca là p95 production.

### Benchmark qua browser và CLI

Benchmark nằm trong panel RAG hiện có, POST `api/data.js` action `rag_benchmark`, chỉ Admin, mỗi request một ca bounded. Không thêm function Vercel mới. Kết quả chỉ chứa ID nguồn/provenance và metrics; không sinh/chấm AI, không lưu bài nộp thử. Nhãn vắng mặt: metrics Recall/precision null. `expectedSourceIds: []`: ca không có nguồn phù hợp. `forbiddenSourceIds`: các nguồn bị thu hồi/đổi đề phải không được chọn.

Baseline tái hiện lookup reference của AI Guide trước RAG, gồm problem.referenceSolution và submission mới nhất theo problemKey. Không đưa baseline yếu này vào model. Thời gian baseline/RAG được đo trên cùng DB, bao gồm resolve problem; riêng RAG gồm ghi log. Không phải đối chứng toàn pipeline AI cũ.

CLI: `npm run rag:benchmark:live -- /secure/local/labelled-cases.json` (cần MONGODB_URI và khóa embedding khi phải gọi provider); thêm `--bypass-cache` để đo cold embedding. UI dùng phiên Admin, không yêu cầu nhập khóa DB/API lên frontend.

Đơn giá mặc định cho text-embedding-3-small: $0.02/1M token (Standard, kiểm tra 2026-10-01: https://developers.openai.com/api/docs/models/text-embedding-3-small). RAG_EMBEDDING_USD_PER_MILLION ghi đè khi hợp đồng/đơn giá khác. Model chưa biết giá giữ null. Đây là ước tính embedding, không gồm Atlas và chi phí Gemini/GPT.

### Trạng thái nghiệm thu

Kiểm thử live trước sửa đổi đã xác nhận luồng exact, Hybrid và chấp nhận phương pháp khác. Đây KHÔNG phải nghiệm thu deployment v2. Chi tiết corpus và log Atlas không xuất vào repository; Admin giữ trong phiên kiểm thử. Kiểm thử local/mock kiểm tra orchestration và gate; cần ghi riêng kết quả Atlas/AI trên preview mới trước merge.
