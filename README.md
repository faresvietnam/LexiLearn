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
