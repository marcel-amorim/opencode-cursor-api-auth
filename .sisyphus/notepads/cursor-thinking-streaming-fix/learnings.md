# Learnings

- Bun test infrastructure successfully integrated.
- `npm test` now triggers `bun test`.

- Implemented structured stream parsing with `parseCursorStreamLine` in `src/plugin.ts`.
- Parser distinguishes between `thinking` (for thinking delta) and `content` (for assistant text and result).
- Verified parsing logic with 10 comprehensive unit tests covering valid, empty, malformed, and unsupported event lines.
