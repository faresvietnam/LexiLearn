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

## Ảnh từ vựng trên Cloudflare R2

Ảnh JPEG, PNG hoặc WebP tối đa 5 MB được upload thẳng từ trình duyệt lên
Cloudflare R2. Vercel Function `/api/images/presign` chỉ xác thực Supabase
access token và cấp URL PUT có hiệu lực 5 phút; file không đi qua Vercel.
Supabase chỉ lưu `image_object_key` và `image_url`.

Đặt các biến sau trong Vercel Project Settings và trong `.env.local` khi
chạy local. Không thêm tiền tố `VITE_` cho R2 credentials vì các giá trị đó
phải chỉ tồn tại phía server:

```dotenv
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_your-key"
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="lexilearn-images"
R2_PUBLIC_BASE_URL="https://images.example.com"
```

R2 API token chỉ cần quyền Object Read & Write trên bucket ảnh đã chọn.
Bucket cần public/custom delivery domain tương ứng với
`R2_PUBLIC_BASE_URL`. Trong R2 → bucket → Settings → CORS, cho phép origin
production và local gọi PUT với đúng `Content-Type`:

```json
[
  {
    "AllowedOrigins": [
      "https://your-vercel-domain.vercel.app",
      "http://127.0.0.1:3000",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "DELETE"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Flow này phù hợp Vercel Hobby cho ứng dụng cá nhân: chỉ có một Function
ngắn hạn, request/response của Function chỉ chứa JSON metadata nhỏ và không
proxy file qua giới hạn payload 4.5 MB. R2 secret không được trả về browser
hoặc ghi log.
