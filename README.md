# chothue.com.vn

Website nhà đất bán và cho thuê trên toàn quốc, giao diện xanh, responsive. HTML/CSS/JavaScript + Vite, Supabase Auth/Postgres/Storage, Vercel Functions.

## Phát triển

```sh
npm ci --cache /workspace/.npm
npm run dev -- --port 3000
```

Để thử kết nối thật ở máy phát triển, sao chép `.env.example` thành `.env.local` rồi nhập thông tin riêng, không commit tệp này. Vite có API middleware cho `/api/config` và `/api/leads`. Khởi động lại máy chủ khi đổi biến.

```sh
npm test
npm run build
```

## Chức năng

- Thanh menu Nhà đất bán, Nhà đất cho thuê, Thông tin các tòa nhà, Tin tức, Wiki BĐS; đăng nhập, đăng ký, đăng tin.
- Tám loại nhà đất, khoảng giá theo mục đích bán/thuê, diện tích, tỉnh/thành và quận/huyện phụ thuộc nhau; tìm không dấu, sắp xếp, lưu yêu thích trên thiết bị.
- Địa danh: 63 tỉnh/thành và 705 quận/huyện trước sắp xếp 2025, dùng như khu vực tìm kiếm quen thuộc. Nguồn và giấy phép ở `data/`.
- Tài khoản email/mật khẩu, xác nhận email và đặt lại mật khẩu qua Supabase.
- Môi giới quản lý tin của mình: tạo tin với ảnh, sửa tin, bản nháp, công khai, ẩn và xóa. Phân quyền cưỡng chế tại cơ sở dữ liệu.
- API nhận nhu cầu thật, kiểm tra nội dung và sự đồng ý tư vấn, giới hạn 5 yêu cầu/giờ/IP; chỉ quản trị viên xem và cập nhật nhu cầu. Chưa gửi thông báo email/Zalo tự động.
- Bài kiến thức do website cung cấp; danh bạ từng tòa nhà chưa có dữ liệu đã xác minh. Tin minh họa được gắn nhãn và có thể tắt; không nhập tự động dữ liệu demo cũ vào hệ thống thật.

## Kích hoạt dữ liệu thật

Làm theo [supabase/SETUP.md](supabase/SETUP.md), chạy [supabase/schema.sql](supabase/schema.sql), thêm ba biến vào Vercel, thiết lập email và cấp quyền quản trị. Khi chưa cấu hình, đăng ký/đăng nhập không giả lập tài khoản, form thông báo rõ chưa gửi dữ liệu. Không lưu nhu cầu mới vào localStorage.

## Triển khai

`vercel.json` cài bằng `npm ci`, chạy `npm run build`, xuất `dist`; Vercel tự nhận các Functions trong `api/`.

```sh
vercel login
vercel link
vercel deploy --prod
```

Dự án Vercel hiện tại `b-t-ng-san-`, URL `https://b-t-ng-san.vercel.app`. Việc tự deploy từ GitHub cần cấp quyền kho mã cho Vercel. Tên miền `chothue.com.vn`, số tổng đài và Zalo doanh nghiệp chưa cấu hình.
