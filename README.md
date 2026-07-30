# LexiLearn

Ứng dụng học từ vựng tiếng Anh bằng React, Vite và Supabase.

## Chạy local

Yêu cầu Node.js 22 trở lên.

1. Cài dependencies:

   ```bash
   npm install
   ```

2. Tạo `.env.local` từ `.env.example`, rồi điền hai giá trị lấy từ
   Supabase Dashboard → Project Settings → API:

   ```dotenv
   VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_your-key"
   ```

3. Khởi động ứng dụng:

   ```bash
   npm run dev
   ```

Các biến có tiền tố `VITE_` được đưa vào bundle trình duyệt. Chỉ dùng
Supabase publishable key ở đây; không đặt secret key trong `.env.local`,
source code hoặc cấu hình frontend.

## Gemini Auto-Fill cá nhân

Mỗi người dùng có thể lưu Gemini API key của riêng mình trong trang Cài
đặt. `user_settings` dùng RLS chỉ-chủ-sở-hữu và dự án Supabase được mã hóa
khi lưu trữ. Ứng dụng không dùng Gemini service key hay proxy phía máy chủ.

Auto-Fill gửi yêu cầu trực tiếp từ trình duyệt tới Gemini. Vì vậy key phải
tồn tại trong bộ nhớ trình duyệt và xuất hiện trong request header; người
dùng có thể xem key bằng công cụ phát triển hoặc mã chạy trong cùng origin.
Đây không tương đương với bảo vệ secret phía máy chủ. Chỉ sử dụng key cá
nhân đã giới hạn cho Gemini API, tránh máy dùng chung, và xóa key trong Cài
đặt khi không còn sử dụng.
