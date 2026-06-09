# Explanation Editor — Design

Date: 2026-06-10
Status: approved

## Problem

In the entry detail view (`QuestionCard` in
`src/features/entry/components/detail/question-group-editor.tsx`), the
`explanation` field of each question is display-only (a plain-text preview via
`plateToText`). Entry staff need to edit explanations.

`explanation` is stored as a **serialized Plate/Slate rich-text document**
(JSON string) inside the `question_groups` jsonb of `data_entry_part_test`.
Real data uses, besides plain text:

- Common marks: `bold` (~365k leaves), `italic` (~54k), `underline` (~260)
- Custom marks from the original Toka editor: `colorKey` (~41k — palette:
  `blue100`, `primary100`, `green40`, `yellow40`, `purple100`, `gray20`),
  `annotationText` (~41k — free-text grammar labels like `S`, `V`, `N1`,
  `S - tôi`), `highlightKey` (~11k — `green40`, `yellow40`, `primary40`,
  `blue40`, `purple40`)
- Rare/legacy: `firstDelete`, `TEXT_COLOR`, `UNDERLINE_COLOR`, `iconKey`,
  `formula`, `marks`, `highlightElement`, `displayMode`, `linkAction`, `url`,
  `textTransform`, `error`, `debug`
- Blocks: `p`, `h1`, `h2`, `h3`, `ul`/`ol` (structure `ul > li > p`),
  `borderShading` (container of blocks). Some nodes carry an `id`; some don't.

The learner-facing Toka app renders this JSON, so **edits must not destroy
formatting keys** — including ones this admin cannot edit.

## Decisions (made with the user)

1. **Scope**: editable basics (bold/italic/underline, paragraph/H2/H3,
   bullet & numbered lists) **plus** the three high-value custom formats:
   text color (`colorKey`), highlight (`highlightKey`), annotation
   (`annotationText`). Together these cover ~97% of special-format usage.
   Rare formats (formula, icons, borderShading, legacy color keys…) are
   rendered best-effort and **passed through untouched on save** — not
   editable here.
2. **Library**: plain Slate (`slate`, `slate-react`, `slate-history`,
   `slate-dom`) — data is already Slate-shaped, and Slate preserves unknown
   properties on nodes it doesn't touch. No Plate framework (plugin
   normalization risks stripping unknown nodes; heavy dependency tree).
3. **Placement**: a dialog. An "Sửa" button next to the existing Explanation
   preview opens it; the read-only preview stays. One editor instance mounts
   at a time (groups can hold many questions).

## Architecture

New files:

- `src/features/entry/data/explanation.ts` — pure helpers:
  - `parseExplanation(raw: string | null | undefined): Descendant[]` —
    valid JSON array → used as-is; non-JSON / plain string → wrapped as one
    paragraph (mirrors `plateToText`'s fallback); null/empty → one empty
    paragraph.
  - `serializeExplanation(value: Descendant[]): string | null` — empty
    document (only empty text) → `null`, else `JSON.stringify(value)`.
  - `COLOR_KEYS` / `HIGHLIGHT_KEYS` — ordered palettes mapping each key to an
    approximate CSS color for rendering. Rendering is approximate by design;
    the saved key is the contract with the learner app.
- `src/features/entry/components/detail/explanation-editor-dialog.tsx` —
  the dialog: Slate editor + toolbar + Lưu/Huỷ.

Modified:

- `question-group-editor.tsx` (`QuestionCard`): add the "Sửa" button (hidden
  when `disabled`), remove the "Chỉnh sửa explanation ở phase sau" note.

No schema or mutation changes: `explanation` already passes through
`z.looseObject` in `detail-schema.ts` and is saved verbatim inside
`question_groups` by the existing update path.

## Data flow

1. "Sửa" opens the dialog; the current string comes from the already-watched
   question object in `QuestionCard`.
2. Dialog parses it once on mount into Slate state (uncontrolled while open).
3. "Lưu" → `serializeExplanation` →
   `form.setValue('question_groups.<g>.questions.<q>.explanation', str,
   { shouldDirty: true })` → close. The preview re-renders via the existing
   `useWatch`.
4. "Huỷ" / closing discards edits.

## Editor behavior

- **Toolbar**: B / I / U toggles; block select (Paragraph, Heading 2,
  Heading 3); bullet / numbered list toggles producing the DB's
  `ul|ol > li > p` nesting; text-color palette (`colorKey`); highlight
  palette (`highlightKey`); annotation popover that sets/edits/removes
  `annotationText` on the selection.
- **Rendering**: leaves render bold/italic/underline natively, `colorKey` as
  text color, `highlightKey` as background, `annotationText` as a small badge
  above/before the segment. Unknown leaf props are ignored visually (or
  given a subtle hint) but never removed. Unknown block types (e.g.
  `borderShading`) render as a generic bordered container; their children
  remain editable; `type` and extra props survive serialization.
- **Pass-through guarantees**: never add/strip `id`s; never normalize
  untouched nodes; new nodes are created without `id` (DB contains both
  forms).

## Error handling

- Non-JSON `explanation` → opens as plain-text paragraph; saving produces
  valid Plate JSON (acceptable upgrade).
- `null`/empty → empty editor; saving an empty document stores `null`, never
  `"[]"`.

## Testing (vitest browser, colocated)

- `explanation.test.ts`: round-trip keeps untouched nodes byte-identical
  (fixture containing `formula`, `borderShading`, `TEXT_COLOR`, `id`s);
  plain string → paragraph; empty → null.
- `explanation-editor-dialog.test.tsx`: open with a real-shaped doc → edit
  text → save → form value still contains the unknown marks; toggling
  bold/color/highlight/annotation writes the expected keys; cancel leaves the
  form non-dirty.

## Out of scope

- Editing rare formats (formula, icons, borderShading, links, legacy
  `TEXT_COLOR`/`UNDERLINE_COLOR`).
- Pixel-faithful rendering of the learner app.
- Explanations outside part-test question groups.
