# Kích hoạt Supabase cho chothue.com.vn

Website đã có mã tích hợp, nhưng cần thực hiện các bước dưới đây trên dự án Supabase của chủ website. Không gửi khóa bí mật trong chat và không đưa khóa vào Git.

## 0. Nếu chưa có Supabase

1. Mở https://supabase.com/dashboard và đăng nhập bằng tài khoản của bạn (có thể dùng GitHub).
2. Tạo một tổ chức rồi chọn **New project**. Chọn gói phù hợp; có thể bắt đầu bằng Free theo điều kiện hiện tại của Supabase.
3. Đặt tên dự án `chothue`, tạo mật khẩu cơ sở dữ liệu mạnh và lưu trong trình quản lý mật khẩu của bạn. Không gửi mật khẩu cho người khác.
4. Chọn khu vực gần người dùng Việt Nam nếu được cung cấp, ví dụ Singapore. Chờ dự án sẵn sàng rồi làm bước 1.

Các thao tác này cần chủ website thực hiện trong tài khoản riêng. Việc đăng nhập Vercel không tự tạo tài khoản hoặc dự án Supabase.

## 1. Tạo bảng, phân quyền và nơi lưu ảnh

Mở **Supabase → dự án của bạn → SQL Editor → New query**, dán toàn bộ [schema.sql](./schema.sql) rồi Run. Script có thể chạy lại mà không xóa dữ liệu. Cần sử dụng dự án mà bạn có quyền quản trị; script tạo các bảng `listings`, `leads`, `account_roles` và bucket ảnh `listing-images`.

- Tin nháp/ẩn chỉ người đăng đọc được; tin công khai có thể xem không cần đăng nhập.
- Môi giới chỉ sửa, ẩn và xóa tin của mình. Ảnh được tải vào thư mục mang ID tài khoản.
- Nhu cầu khách hàng chỉ quản trị viên xem và đổi trạng thái, môi giới thông thường không có quyền xem.
- API nhận tối đa 5 nhu cầu / giờ / IP bằng bộ đếm trong PostgreSQL. Không lưu IP thô. Người dùng công khai không thể gọi hàm ghi nhu cầu trực tiếp bằng public key.

## 2. Cấu hình xác thực email

Vào **Authentication → URL Configuration**:

- Site URL: `https://b-t-ng-san.vercel.app`
- Redirect URLs: thêm chính URL trên; khi dùng tên miền riêng, bổ sung tên miền đó.
- Để kiểm thử trên máy phát triển, thêm `http://localhost:3000` (không dùng wildcard rộng).

Vào **Authentication → Providers → Email**, bật Email và **Confirm email**. Thiết lập SMTP gửi thư của đơn vị vận hành để gửi email xác nhận/khôi phục thật; dịch vụ email mặc định có giới hạn gửi và có thể chỉ gửi đến địa chỉ được cho phép. Đặt chính sách mật khẩu tối thiểu 8 ký tự, bật kiểm tra mật khẩu rò rỉ nếu gói hỗ trợ.

## 3. Thêm biến vào Vercel

Vào **Vercel → b-t-ng-san- → Settings → Environment Variables**, chọn **Production** (và Preview nếu cần):

| Tên | Giá trị lấy từ Supabase |
| --- | --- |
| `SUPABASE_URL` | Project URL trong Project Settings / Data API |
| `SUPABASE_ANON_KEY` | Khóa public `anon` hoặc publishable key của chính dự án |
| `SUPABASE_SERVICE_ROLE_KEY` | Khóa bí mật `service_role` hoặc secret key, chỉ phía máy chủ |

Không thêm tiền tố `VITE_` cho khóa bí mật. `/api/config` chỉ trả URL và public key. `/api/leads` dùng khóa máy chủ; khóa này không được trả về trình duyệt. Sau khi lưu biến, **Redeploy** để Vercel áp dụng.

## 4. Cấp tài khoản quản trị nhận nhu cầu

Đăng ký trên website bằng email quản trị, xác nhận email. Trong Supabase → Authentication → Users lấy UUID của tài khoản đó. Chạy SQL dưới đây và thay UUID:

```sql
insert into public.account_roles(user_id, role)
values ('THAY-BANG-UUID-TAI-KHOAN-QUAN-TRI', 'admin')
on conflict(user_id) do update set role='admin';
```

Không cấp quyền admin cho mọi môi giới. Mở **Quản lý tin → Nhu cầu khách hàng** để xem và đánh dấu đã liên hệ. Hệ thống lưu vào bảng riêng, chưa tự động gửi email/Zalo thông báo.

## 5. Kiểm tra trên website thật

1. Đăng ký email mới, xác nhận email, đăng nhập và kiểm tra khôi phục mật khẩu.
2. Tạo tin với ảnh, lưu nháp: cửa sổ ẩn danh không thấy tin. Đổi sang công khai: cửa sổ ẩn danh xem được tin.
3. Tạo tài khoản môi giới thứ hai: không thể đọc tin nháp hoặc sửa/xóa tin người khác.
4. Sửa, ẩn, hiển thị và xóa tin của chính mình.
5. Gửi form nhu cầu và chỉ xác nhận hoàn tất khi nhận HTTP 201. Kiểm tra hàng mới trong bảng `leads` và tài khoản quản trị xem được thông tin.
6. Tài khoản môi giới khác không được xem nhu cầu. Sau 5 yêu cầu cùng IP trong giờ, API trả 429.

Bộ kiểm tra `npm test` xác minh chính sách dữ liệu bằng PostgreSQL chạy trong PGlite và các phản hồi API; không thay thế kiểm tra trên dự án Supabase thật. Chủ website cần bổ sung pháp nhân, thông tin liên hệ hỗ trợ, quy định lưu trữ/xóa dữ liệu và chính sách nội dung phù hợp trước khi vận hành rộng rãi. Tin do môi giới đăng không mặc nhiên là đã được đơn vị vận hành xác minh.

## Cập nhật danh mục kinh doanh

Nếu đã chạy schema phiên bản trước, chạy `supabase/migrations/20261026_property_categories.sql` trong SQL Editor để đổi tên Mặt bằng thành Mặt bằng kinh doanh và cho phép hai loại mới: Sang nhượng cửa hàng kinh doanh, Mặt bằng văn phòng. Tin cũ được giữ lại. Dự án mới chỉ cần chạy schema.sql hiện tại.
