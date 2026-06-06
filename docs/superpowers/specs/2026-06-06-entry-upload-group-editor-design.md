# Entry Upload + Question-Group Editor — Design (Phase 3a+3b)

**Date:** 2026-06-06
**Status:** Approved
**Scope:** Real image/audio upload through the R2 upload API wired into the
detail pages' Replace buttons (3a), and an editable question-group panel on the
part-test detail page with add/remove support (3b). The Plate rich-text editor
for `explanation` is **phase 3c** (preview-only here); the full-test
`all_test_ids` composer stays phase 2d.

## Context

Phase 2 shipped detail/edit pages (`/entry/part-tests/$id`,
`/entry/full-tests/$id`) with a single RHF form per page, compare-and-swap
saves (`.eq('version', v)` → `ConflictError`), a disabled-upload media section,
and a read-only groups sidebar. The upload destination is now decided:

- **Upload API:** `https://r2-upload.onrender.com` (FastAPI, source at
  `~/Documents/personal-v2/python-mono-app/apps/r2-upload`).
  `POST /api/files?prefix=<p>` multipart (`file`) →
  `{"status":"success","data":{"path","size","content_type","etag"}}`.
  Max upload 100 MB. Auth: Supabase JWT Bearer verified via JWKS; the deployed
  instance currently runs `AUTH_ENABLED=false`, but the client must always
  send `Authorization: Bearer <session access_token>` so enabling auth later
  is a no-op. Also available (unused for now): `POST /api/files/from-url`,
  `GET /api/files`, `DELETE /api/files/{path}`.
- **New CDN:** `https://pub-726d405e1fd748059ee472ed7e49d800.r2.dev/<path>`.
- **Old CDN** (`https://media.dolenglish.vn`) keeps serving legacy paths.

**Path scheme decision:** DB keeps storing bare paths. Resolution rule (shared
with other consumers of these tables): path starting with `PUBLIC/` → old CDN;
full `http(s)://` URL → use as-is (defensive); anything else → R2 CDN.

**Media object shape gotcha:** part-level media (`cover`, `ex_image`, `audio`)
use camelCase extra keys (`fileType`, `originLink`, `uploadedDate`); media
inside `question_groups` (group `image`, question `image`) use snake_case
(`file_type`, `origin_link`, `uploaded_date`). Replacing a file must MERGE
`{name, path, size}` into the existing object (or a shape-matched empty
object), never convert between shapes.

**`question_groups` structure** (from live data):

- Group: `image`, `order`, `passage {title, body}`, `group_key` (uuid),
  `has_image`, `part_type`, `questions[]`, `group_title`, `group_valid`,
  `end_part_order`, `start_part_order`, `has_passage_title`,
  `passage_templates`, `number_of_question`.
- Question: `image`, `options[] {text, option_id ('A'…), is_correct,
  display_type}`, `is_valid`, `explanation` (STRING containing serialized
  Plate rich-text JSON), `transcripts`, `question_key` (uuid),
  `order_in_part`, `question_text`, `start/end_time_in_milliseconds`.

## 1. Upload service (3a)

`src/features/entry/data/upload.ts` (replaces the throwing seam):

- New env vars in `.env.example` + `.env.local`:
  `VITE_UPLOAD_API_URL=https://r2-upload.onrender.com`,
  `VITE_MEDIA_R2_BASE_URL=https://pub-726d405e1fd748059ee472ed7e49d800.r2.dev`.
- `uploadMedia(file: File): Promise<UploadedFile>` where `UploadedFile =
  { path: string; size: number; contentType: string }`:
  `POST ${VITE_UPLOAD_API_URL}/api/files?prefix=entry` multipart; Bearer token
  from `supabase.auth.getSession()`; non-2xx or `status !== 'success'` →
  descriptive `Error`. `isUploadConfigured` becomes a function of env presence
  (`!!VITE_UPLOAD_API_URL`).
- `mergeMediaObject(existing, file, uploaded)`: returns a new media object =
  existing keys preserved, `{name: file.name, path: uploaded.path,
  size: uploaded.size}` overwritten. When `existing` is null/undefined, build a
  minimal object `{name, path, size, alt: null, caption: null}` (no case-
  specific extra keys — absent keys are fine for jsonb).

`src/features/entry/data/media.ts`:

- `mediaUrl(path)` new resolution: `PUBLIC/`-prefixed → join with
  `VITE_MEDIA_BASE_URL`; `^https?://` → return as-is; otherwise → join with
  `VITE_MEDIA_R2_BASE_URL`. (`joinMediaUrl` stays the pure join helper.)

## 2. Working Replace buttons (3a)

- `EntryMediaSection` items gain `onReplaced?: (media: MediaObject) => void`
  and `accept?: string` (default `image/*` for kind image, `audio/*` for kind
  file). Replace opens a hidden `<input type='file'>`; while uploading the
  button shows a spinner and disables; success → `onReplaced(mergedObject)`;
  failure → destructive sonner toast. Buttons enabled iff `isUploadConfigured()`
  AND `onReplaced` provided AND the page form is editable.
- **Media joins the RHF form state.** Part form schema gains non-validated
  passthrough fields `cover`, `ex_image`, `audio` (`z.custom<MediaObject>()`
  style, nullable); full form gains `cover`. Defaults come from the row;
  `onReplaced` calls `form.setValue('cover', merged, { shouldDirty: true })`; payload
  mappers pass them through. Saving therefore reuses the existing
  CAS-versioned update + dirty tracking + unsaved-changes guard untouched.

## 3. Question-group editor (3b)

All inside the part-test page's single RHF form, so one Save persists
everything atomically.

### Form data

- `question_groups` becomes an RHF field (typed editable projection). Zod
  detail schema for groups/questions tightens to the editable fields while
  keeping loose passthrough for everything else (Plate `explanation` string,
  `transcripts`, `passage_templates`, flags ride along untouched).
- `useFieldArray` over groups; nested `useFieldArray` per group's questions
  and per question's options.

### Navigation

- The sidebar becomes interactive: top item **"Thông tin chung"** plus one
  item per group (`group_title || 'Group N' — count câu`), highlighting the
  selection (local `useState<number | 'general'>`).
- The right panel renders either the existing general sections (unchanged) or
  the selected group's editor. Switching selection does NOT reset the form —
  all sections stay mounted in one `<form>`; non-selected panels are hidden
  with CSS (`hidden` class), not unmounted, so RHF state persists.

### Group panel

- Editable: `group_title` (input), `passage.title` (input), `passage.body`
  (textarea), group `image` (upload via §2 mechanics, snake_case shape).
- Question list: each question card has `question_text` (textarea, required),
  `image` (upload), options editor, read-only timing chips
  (`start/end_time_in_milliseconds` formatted), read-only `explanation`
  preview (plain text extracted from the Plate JSON via a tolerant
  `plateToText(raw)` helper — parse failure → show raw string truncated),
  and a remove-question button.
- Options editor: rows of text inputs with a radio per row (single correct);
  add option (max 6) / remove option (min 2); `option_id` auto-reassigned
  A…F by index on normalize.
- Add question (template: new `question_key` via `crypto.randomUUID()`,
  4 empty options A–D, `is_correct` all false until picked, `is_valid: true`,
  `explanation: null`, `transcripts: null`, timings null).
- Add group (sidebar footer button; template: new `group_key`, empty passage,
  `questions: []`, `group_valid: true`) and remove group (ConfirmDialog).

### Normalization on save

Pure helper `normalizeQuestionGroups(groups)` in
`src/features/entry/data/question-groups.ts` (heavily unit-tested):

- groups: `order` = index; `number_of_question` = questions.length;
  `start_part_order`/`end_part_order` = cumulative question counts across
  groups (1-based, continuous through the whole part).
- questions: `order_in_part` = continuous 1-based index across all groups.
- options: `option_id` = 'A'+index.
- untouched fields pass through verbatim.
- Returns `{ groups, totalQuestions }`; the part payload sets
  `total_question = totalQuestions` (overriding the manual Numbers field when
  groups were edited — precisely: `total_question` input becomes read-only
  derived display once groups exist; when `question_groups` is null the manual
  input stays editable).

### Validation (zod, on save)

- `question_text` non-empty; exactly one `is_correct` per question; ≥2
  options per question; group has ≥1 question (a group can be temporarily
  empty while editing but blocks save with a field error). Save with invalid
  group focuses/selects the offending group panel.

## 4. Full-test page (3a only)

Cover Replace wired identically (form field `cover`). No composer changes.

## 5. Error handling

- Upload: network/HTTP errors → toast with API message; oversized file
  (>100 MB) pre-checked client-side.
- Save conflicts: existing ConflictError toast + Reload (unchanged).
- `plateToText` never throws (fallback to raw/empty).

## 6. Testing

- Unit: `normalizeQuestionGroups` (reorder/add/remove → orders, counts,
  cumulative ranges, passthrough), `mediaUrl` dual-CDN rules,
  `mergeMediaObject` (shape preservation camel vs snake, null existing),
  `plateToText` (real sample, garbage input).
- Component: sidebar selection switches panels without losing dirty state;
  options radio enforces single-correct in UI; add/remove question updates
  the list and sidebar count.
- Browser verification (live): upload real image → R2 URL renders; save →
  reload shows R2 cover; edit option text + correct answer in a group → save
  → DB jsonb reflects it; add + remove question → totals/orders recomputed;
  revert all test data afterwards.

## Out of scope

Plate WYSIWYG editing of `explanation` (3c), full-test `all_test_ids` composer
(2d), editing timings/transcripts, upload-from-URL, deleting files from R2 on
replace (old files stay).
