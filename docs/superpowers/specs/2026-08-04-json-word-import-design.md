# Thiết kế: Import từ vựng bằng JSON (thay thế CSV)

## Mục tiêu

Thay hoàn toàn tính năng import CSV bằng import JSON. Lý do: CSV chỉ biểu
diễn được dạng phẳng (1 dòng = 1 nghĩa, 1 ví dụ), khiến `csvWordBuilder.ts`
phải tự bịa dữ liệu khi thiếu (IPA giả dạng `/word/`) và hai field `deck`,
`tags` dù được `csvParser.ts` parse ra nhưng bị `App.tsx` ghi đè cứng, không
bao giờ tới được database. JSON biểu diễn tự nhiên cấu trúc lồng nhau
(nhiều nghĩa, nhiều ví dụ mỗi nghĩa, nhiều thành phần cấu tạo từ) nên vá
được các gap này mà không cần thêm UI phức tạp.

Không giữ CSV song song — xoá hẳn parser, builder, modal, types liên quan
đến CSV.

## JSON schema

File JSON là một mảng các object, mỗi object là một từ:

```jsonc
[
  {
    "word": "run",                    // bắt buộc, không rỗng
    "ipa": "/rʌn/",                   // optional — thiếu thì bỏ qua field, không tự bịa
    "audio_url": "https://...",       // optional
    "image_url": "https://...",       // optional
    "deck_name": "IELTS",             // optional — tự tạo deck nếu user chưa có deck tên này
    "tag_names": ["daily", "toeic"],  // optional — tự tạo tag nếu user chưa có tag tên này
    "study_status": "active",         // optional, mặc định "active"
    "meanings": [                     // bắt buộc, ít nhất 1 phần tử
      {
        "meaning_vi": "chạy",         // bắt buộc, không rỗng
        "part_of_speech": "verb",     // bắt buộc, không rỗng
        "definition_en": "to move quickly on foot", // optional
        "examples": [                 // optional, có thể nhiều câu
          {
            "sentence": "I run every morning.",  // bắt buộc trong example
            "expected_answer": "run",             // optional, mặc định = word
            "word_form": "base",                  // optional, mặc định "base"
            "difficulty": "medium"                // optional, mặc định "medium"
          }
        ]
      }
    ],
    "parts": [                        // optional — đủ cả 6 loại WordPartType
      {"text": "run", "type": "base", "meaning": "chạy"}  // meaning optional
    ]
  }
]
```

`WordPart.order` không khai báo trong JSON — `jsonWordBuilder.ts` tự gán
bằng vị trí trong mảng `parts` (phần tử đầu = 1, tăng dần), đúng cách
`csvWordBuilder.ts` đang làm với prefix/root/suffix.

Field naming dùng snake_case, đồng bộ với payload RPC `create_private_word`
đã mô tả trong `docs/superpowers/specs/2026-08-04-add-word-api-endpoint-design.md`,
trừ `deck_id`/`tag_ids` được đổi thành `deck_name`/`tag_names` (xem mục Deck/Tag
Resolution).

## Validation

Validate ở tầng parse, trước khi build `Word`:

- Root phải là JSON array. Không phải array → lỗi toàn file, dừng ngay,
  không xử lý bước nào tiếp theo.
- Từng phần tử trong array kiểm tra độc lập (lỗi 1 phần tử không chặn các
  phần tử khác):
  - `word` phải là string không rỗng sau `trim()`.
  - `meanings` phải là array có ít nhất 1 phần tử.
  - Mỗi meaning: `meaning_vi` và `part_of_speech` không rỗng sau `trim()`.
  - Mỗi example (nếu có): `sentence` không rỗng sau `trim()`.
  - Mỗi part (nếu có): `text` không rỗng, `type` phải thuộc `WordPartType`.
- Phần tử lỗi được gom vào danh sách `invalid` kèm index gốc trong mảng và
  danh sách lỗi cụ thể (theo đúng pattern `CsvInvalidRow` cũ, đổi tên
  `rowNumber` → `index`).
- Trùng `word` (case-insensitive, bỏ dấu) trong cùng file: giữ phần tử xuất
  hiện đầu tiên, các phần tử sau bị coi là duplicate và loại khỏi danh sách
  xử lý (giữ đúng hành vi `duplicates` của `parseCsv`).

Đây là bước parse thuần (không gọi network), tương đương
`csvParser.ts::parseCsv`.

## Deck/Tag Resolution

Với mỗi phần tử đã valid:

1. Nếu có `deck_name`: so khớp case-insensitive với `decks` hiện có của
   user (state đã load trong `App.tsx`). Khớp thì dùng `id` đó. Không khớp
   thì gọi `handleCreateDeck` để tạo deck mới (màu mặc định, không
   `isDefault`), dùng `id` vừa tạo. Không có `deck_name` thì `deckId` rỗng
   (giữ hành vi hiện tại: từ không thuộc deck nào cụ thể).
2. Nếu có `tag_names`: với từng tên trong mảng, so khớp case-insensitive với
   `tags` hiện có; không khớp thì gọi `handleCreateTag` tạo tag mới. Kết quả
   là mảng `tagIds` tương ứng.
3. Deck/tag tạo mới trong một lần import được nhớ lại trong bộ nhớ tạm của
   phiên import đó (không gọi `handleCreateDeck` hai lần cho cùng một tên
   xuất hiện ở nhiều từ khác nhau trong cùng file).

## Dedup & Routing

Tái sử dụng `routeImportedRow` (`importRouting.ts`), đổi tham số đầu vào từ
`Pick<CsvRowRaw, 'word'|'vietnameseMeaning'|'partOfSpeech'>` sang lấy
`word` + `meanings[0].meaning_vi` + `meanings[0].part_of_speech` (chỉ nghĩa
đầu tiên tham gia so khớp trùng lặp với Global Word, giống hệt logic cũ —
các nghĩa còn lại không ảnh hưởng routing). Ba nhánh kết quả giữ nguyên:

- `create_private`: chưa có từ nào trùng tên → tạo private word mới.
- `duplicate_private`: đã có private word cùng tên (không phải Global) →
  bỏ qua, đánh dấu `skipped`.
- `link_global`: có Global Word cùng tên và nghĩa/từ loại đầu tiên khớp →
  chỉ link vào từ vựng cá nhân thay vì tạo mới.

Không còn bước "Conflict Review" thủ công — trường hợp Global Word cùng tên
nhưng nghĩa khác (trước đây rơi vào bước conflicts để user chọn keep/use
imported) nay tự động rơi vào nhánh `create_private` (tạo private word
riêng, đúng comment đã có sẵn trong `importRouting.ts`: "A conflicting
import remains a separate private word; there is no moderation or Global
edit-suggestion workflow anymore").

## UI Flow

`JsonImportModal.tsx` thay `CsvImportModal.tsx`, 3 bước thay vì 5:

1. **Upload/Paste** — textarea dán JSON hoặc chọn file `.json`. Có sẵn JSON
   mẫu (2-3 từ) thay cho CSV mẫu hiện tại.
2. **Preview** — bấm "Phân tích JSON":
   - Lỗi format toàn file (không phải array) → hiển thị lỗi, không cho qua
     bước tiếp.
   - Bảng preview từng từ hợp lệ: word, nghĩa đầu tiên, số nghĩa, số ví dụ,
     deck/tag sẽ dùng (kèm nhãn "sẽ tạo mới" nếu deck/tag chưa tồn tại), và
     route dự kiến (tạo mới / gộp vào Global / bỏ qua vì trùng).
   - Danh sách lỗi cho các phần tử invalid (index + lý do), không chặn
     import các phần tử hợp lệ còn lại.
   - Số liệu tổng: hợp lệ / trùng lặp trong file / lỗi.
3. **Confirm** — bấm "Xác nhận Import" chạy toàn bộ pipeline (tạo
   deck/tag còn thiếu → build `Word` → route → `createPrivateWord`/
   `linkGlobalWord`), rồi qua **Summary** hiển thị kết quả (tạo mới bao
   nhiêu / linked bao nhiêu / skipped duplicate bao nhiêu / failed bao
   nhiêu), giống bố cục summary hiện tại.

## File/Module Changes

Xoá:
- `src/features/import/csvParser.ts`
- `src/features/import/csvWordBuilder.ts`
- `src/components/CsvImportModal.tsx`
- `CsvRowRaw`, `CsvImportConflict`, `CsvImportReport` trong `src/types/index.ts`

Thêm:
- `src/features/import/jsonImportParser.ts` — parse + validate JSON text,
  trả `{valid: JsonWordInput[], invalid: {index, errors}[], duplicates: {index, keptIndex}[]}`.
- `src/features/import/jsonWordBuilder.ts` — build `Word` đầy đủ từ 1
  `JsonWordInput` đã resolve deck/tag id (không tự bịa IPA, không hardcode
  deck/tags).
- `src/components/JsonImportModal.tsx` — thay `CsvImportModal.tsx`, dùng
  nguồn build duy nhất là `jsonWordBuilder.ts` (xoá code build word trùng
  lặp đang nằm inline trong `CsvImportModal.tsx::handleFinalizeImport`).
- `JsonWordInput` type trong `src/types/index.ts` (shape ở mục JSON schema).

Sửa:
- `src/features/import/importRouting.ts` — đổi signature `routeImportedRow`
  như mô tả ở mục Dedup & Routing.
- `src/features/persistence/importRepository.ts` — không đổi logic, chỉ đổi
  tên type tham chiếu `CsvRowRaw` → `JsonWordInput` (bảng `csv_imports`/
  `csv_import_rows` giữ nguyên tên, `raw_data` là `jsonb` nên chứa
  `JsonWordInput` trực tiếp được, không cần migration).
- `src/App.tsx` — đổi tên state/handler (`showCsvImportModal` →
  `showJsonImportModal`, `handleConfirmCsvImport` → `handleConfirmJsonImport`,
  `handleResumeCsvImport` → `handleResumeJsonImport`, `resumableCsvRows` →
  `resumableJsonRows`), cập nhật lời gọi `buildImportedWord` →
  `jsonWordBuilder`, và bỏ đoạn ghi đè cứng `deckId`/`tags` hiện có ở
  `handleConfirmCsvImport` (dòng 736-740) vì deck/tag giờ resolve đúng từ
  JSON thay vì luôn dùng deck đầu tiên/tags rỗng.

Không đổi:
- `src/features/persistence/vocabularyRepository.ts::createPrivateWord` —
  vẫn là điểm ghi database duy nhất, không cần sửa.
- Bảng `csv_imports`/`csv_import_rows` — giữ nguyên tên bảng dù tính năng
  giờ là JSON, để không cần migration (đổi tên bảng là việc tách biệt, có
  thể làm sau nếu cần).

## Testing

Theo pattern test hiện có của import feature (`csvParser.test.ts`,
`csvWordBuilder.test.ts`, `importRouting.test.ts`):

- `jsonImportParser.test.ts`:
  - Root không phải array → lỗi toàn file.
  - Thiếu `word` / `meanings` rỗng / meaning thiếu `meaning_vi` hoặc
    `part_of_speech` / example thiếu `sentence` / part có `type` không hợp
    lệ → từng trường hợp vào danh sách `invalid` với index đúng.
  - Trùng `word` (khác hoa thường, khác dấu) → phần tử sau vào danh sách
    `duplicates`, giữ phần tử đầu.
  - Phần tử hợp lệ có đầy đủ optional field (audio_url, image_url,
    definition_en, nhiều meanings, nhiều examples, đủ 6 loại part) → parse
    đúng, không rơi rớt field.
- `jsonWordBuilder.test.ts`:
  - IPA thiếu → field `ipa` vắng mặt trong `Word` trả về (không tự bịa).
  - `deck_name`/`tag_names` khớp tên đã có (case-insensitive) → dùng đúng
    id có sẵn, không gọi tạo mới.
  - `deck_name`/`tag_names` không khớp → gọi tạo mới đúng 1 lần dù tên đó
    lặp lại ở nhiều từ trong cùng file.
  - Example thiếu `expected_answer`/`word_form`/`difficulty` → áp đúng giá
    trị mặc định (word, "base", "medium").
- `importRouting.test.ts`: cập nhật test hiện có theo signature mới, giữ
  nguyên 3 case (create_private / duplicate_private / link_global).

Không cần test DB layer mới vì `createPrivateWord`/`linkGlobalWord`/
`importRepository.ts` không đổi logic.
