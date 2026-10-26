# chothue.com.vn

Website tìm thuê mặt bằng và nhà nguyên căn toàn quốc, xây bằng HTML, CSS và JavaScript với Vite.

## Phát triển

```sh
npm ci --cache /workspace/.npm
npm run dev -- --port 3000
```

## Kiểm tra bản dựng

```sh
npm run build
npm run preview -- --port 3000
```

Bản demo hỗ trợ tìm kiếm không dấu, lọc khu vực, loại hình, giá và diện tích; sắp xếp; lưu tin; xem chi tiết; đăng tin với ảnh; gửi nhu cầu. Tin đăng, danh sách yêu thích và nhu cầu lưu qua localStorage trên từng trình duyệt. Dữ liệu mẫu và hình ảnh Unsplash dùng để minh họa.

## Trước khi vận hành thật

Cần triển khai API và cơ sở dữ liệu, tài khoản môi giới và phân quyền, duyệt tin, lưu ảnh, xử lý nhu cầu và chính sách dữ liệu cá nhân. Cấu hình số điện thoại và tài khoản Zalo thật trước khi kích hoạt liên hệ. Website hiện không gửi dữ liệu và không công khai tin lên máy chủ. Chưa triển khai lên tên miền chothue.com.vn.

## Triển khai Vercel

Cấu hình sẵn trong `vercel.json`: framework Vite, cài bằng `npm ci`, build bằng `npm run build`, xuất thư mục `dist`.

1. Đăng nhập Vercel và chọn Add New → Project.
2. Import kho GitHub `manhquynhstylist-glitch/b-t-ng-san-` (cấp quyền cho Vercel nếu được yêu cầu).
3. Chọn nhánh `main`, Root Directory để mặc định, rồi Deploy. Không cần biến môi trường cho bản demo.
4. Sau khi triển khai thành công, vào Settings → Domains để thêm `chothue.com.vn`; cấu hình DNS theo hướng dẫn Vercel cung cấp.

Nếu dùng CLI, chạy `vercel login`, sau đó `vercel link` và `vercel --prod` tại thư mục dự án. Không đưa token vào Git hoặc chat. Việc triển khai không bổ sung máy chủ xử lý nhu cầu hay tài khoản môi giới.
