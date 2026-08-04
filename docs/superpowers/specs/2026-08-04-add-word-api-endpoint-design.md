# Thiết kế API Từ vựng (Word API Endpoints)

## Mục tiêu

Cho phép user quản lý từ vựng của chính mình từ bên ngoài web app (curl, iOS
Shortcuts, n8n, v.v.) thông qua 2 endpoint HTTP mới có xác thực, mà không
cần xây dựng riêng một hệ thống token dài hạn:

- `POST /api/words/add` — thêm một từ riêng (private word).
- `GET /api/words/reference` — tra cứu deck, tag và các gốc từ (word-root
  components) sẵn có của user, để bên gọi API tái sử dụng đúng id/text thay
  vì đoán hoặc tạo trùng.

## Xác thực

Cả hai endpoint dùng lại session access token hiện có của Supabase — đúng
loại credential mà `api/ai/analyze.ts` và `api/images/presign.ts` đã nhận
dưới dạng Bearer token. Không thêm bảng token, RPC, hay cơ chế xử lý hết hạn
nào mới.

Access token của Supabase là một JWT được ký khi đăng nhập, mang sẵn user id
(claim `sub`). Backend không bao giờ tin user id do client tự khai; nó luôn
gọi Supabase Auth để phân giải token ra user id thật, và các ràng buộc ở tầng
row-level của database (xem bên dưới) sẽ chặn mọi trường hợp lệch id.

Token này hết hạn sau thời gian sống mặc định của session Supabase (khoảng 1
giờ). Với việc dùng lặp lại qua script, user tự copy token mới từ Settings
khi token cũ hết hạn. Giới hạn này được chấp nhận — không xây dựng luồng
refresh token hay personal access token dài hạn.

## Settings: hiển thị access token hiện tại

Thêm một card "API access" vào `SettingsView`:

- Khi mount, đọc session hiện tại qua
  `getSupabaseClient()?.auth.getSession()`.
- Hiển thị giá trị `access_token` trong một ô read-only kèm nút copy.
- Có ghi chú ngắn rằng token hết hạn sau khoảng 1 giờ và có thể copy token
  mới sau khi đăng nhập lại.

Phần này tự chứa hoàn toàn: đọc client trực tiếp (đúng pattern đã dùng ở nơi
khác trong codebase), không cần thêm prop mới, không sửa `AuthProvider`, và
không cần backend hỗ trợ.

## Endpoint: Thêm từ (Add Word)

`POST /api/words/add`, triển khai dưới dạng Vercel Function, dùng cùng
pattern Web `Request`/`Response` handler-factory như `api/ai/analyze.ts` và
`api/images/presign.ts` (một factory `create*Handler(dependencies)` để unit
test, cộng với `runtimeDependencies()` mỏng + default export cho production).

### Request

```text
POST /api/words/add
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Body — đúng shape mà app hiện tại đã gửi cho RPC `create_private_word` thông
qua `vocabularyRepository.createPrivateWord`:

```jsonc
{
  "word": "run",                 // bắt buộc, không rỗng
  "ipa": "/rʌn/",                // tùy chọn
  "audio_url": "https://...",    // tùy chọn
  "image_url": "https://...",    // tùy chọn
  "deck_id": "uuid",             // tùy chọn, phải thuộc về user
  "tag_ids": ["uuid"],           // tùy chọn, mỗi tag phải thuộc về user
  "study_status": "active",      // tùy chọn, mặc định "active"
  "meanings": [                  // bắt buộc, ít nhất 1 phần tử
    {
      "meaning_vi": "chạy",
      "part_of_speech": "verb",
      "definition_en": "to move quickly on foot", // tùy chọn
      "examples": [                                // tùy chọn
        {"sentence": "I run every morning."}
      ]
    }
  ],
  "parts": []                    // tùy chọn, các thành phần cấu tạo từ
}
```

Endpoint không tự làm lại validate chi tiết từng field ngoài việc kiểm tra
`word` là chuỗi không rỗng và `meanings` là mảng không rỗng — phần còn lại
(shape của meaning/example, quyền sở hữu deck, quyền sở hữu tag, loại
word-part) đã được RPC `create_private_word` validate, và đó vẫn là nguồn
sự thật duy nhất cho các quy tắc này.

### Luồng xử lý

1. Đọc Bearer token; thiếu thì trả `401`.
2. Verify token bằng `supabase.auth.getUser(token)`; sai thì trả `401`.
3. Parse JSON body; parse lỗi hoặc thiếu `word`/`meanings` thì trả `400`.
4. Build payload cho RPC: giữ nguyên các field của body, gán thêm
   `owner_user_id = <user id đã verify>` và
   `normalized_word = word.trim().toLowerCase()`.
5. Tạo một Supabase client dùng publishable key, gắn access token đã verify
   vào header `Authorization` (không dùng secret key), để `auth.uid()` bên
   trong `create_private_word` phân giải đúng ra user thật — RPC này là
   `security invoker` nên phụ thuộc vào việc này.
6. Gọi `.rpc('create_private_word', {p_payload: payload})`.
7. Thành công thì trả `201` kèm JSON của từ vừa tạo (đúng shape RPC đã trả
   cho frontend).
8. RPC lỗi thì map theo Postgres error code:
   - `22023` (payload sai) → `400`
   - `42501` (owner mismatch, deck/tag không thuộc user, chưa xác thực) →
     `403`
   - còn lại → `500`

Endpoint này không dùng secret key ở bất kỳ đâu.

## Endpoint: Dữ liệu tham chiếu (Reference Data)

`GET /api/words/reference`, cùng pattern handler-factory, chỉ đọc dữ liệu.

### Request

```text
GET /api/words/reference
Authorization: Bearer <supabase_access_token>
```

Không có body.

### Luồng xử lý

1. Đọc Bearer token; thiếu thì trả `401`.
2. Verify token bằng `supabase.auth.getUser(token)`; sai thì trả `401`.
3. Tạo Supabase client dùng publishable key, gắn access token đã verify vào
   header `Authorization`, giống hệt endpoint thêm từ. RLS đã giới hạn sẵn
   `decks`, `tags`, và `private_word_components` chỉ trả về các dòng thuộc
   về user gọi request (`owner_user_id`/`user_id` = `auth.uid()`), nên các
   câu query không cần lọc thêm user id thủ công ngoài những gì RLS đã áp.
4. Chạy 3 câu select (decks, tags, word components) và trả về cùng lúc. Lỗi
   query thì trả `500`.

### Response

```jsonc
{
  "decks": [
    {"id": "uuid", "name": "...", "color": "...", "is_default": false}
  ],
  "tags": [
    {"id": "uuid", "name": "...", "color": "..."}
  ],
  "word_components": [
    {
      "id": "uuid",
      "type": "root",
      "normalized_text": "...",
      "display_text": "...",
      "meaning": "..."
    }
  ]
}
```

`word_components` chính là kho `private_word_components` của user — đúng
bảng mà `create_private_word` upsert vào (unique theo
`owner_user_id, type, normalized_text`) mỗi khi `parts[]` của một từ được
lưu. Bên gọi API có thể tra trước rồi tái dùng đúng `type`/`text`, để các
gốc/tiền tố/hậu tố lặp lại được gộp thay vì tạo trùng.

## Dev local và Deployment

`server.ts` thêm 2 forwarder nữa, theo đúng pattern
`forwardAnalyzeRequest`/`forwardImageRequest` hiện có:

```text
app.post('/api/words/add', forwardAddWordRequest);
app.get('/api/words/reference', forwardWordReferenceRequest);
```

Vercel tự nhận `api/words/add.ts` và `api/words/reference.ts` qua file-based
routing khi lên production; không cần sửa `vercel.json` (2 endpoint kia cũng
không có file này).

## Testing

`src/features/words/addWordFunction.test.ts`, theo đúng khuôn
`src/features/openai/analyzeFunction.test.ts`: test trực tiếp factory
`createAddWordHandler(dependencies)` với `verifyAccessToken` và lời gọi RPC
được mock.

Các case:

- Thiếu/sai Bearer token → `401`.
- Body không phải JSON → `400`.
- Thiếu `word` hoặc `meanings` rỗng → `400`.
- RPC trả error code `22023` → `400`.
- RPC trả error code `42501` → `403`.
- RPC thành công → `201` kèm JSON của từ, và payload gửi cho RPC có
  `owner_user_id` đúng bằng user id đã verify.

`src/features/words/wordReferenceFunction.test.ts`, cùng phong cách, với
`verifyAccessToken` và loader lấy dữ liệu tham chiếu được mock.

Các case:

- Thiếu/sai Bearer token → `401`.
- Loader lỗi → `500`.
- Thành công → `200` kèm `decks`, `tags`, `word_components` đúng như loader
  trả về, không bị biến đổi.

Không thêm migration, bảng, hay RPC nào mới, nên không cần thêm test ở tầng
database ngoài phần `create_private_word` và RLS đã có sẵn.
