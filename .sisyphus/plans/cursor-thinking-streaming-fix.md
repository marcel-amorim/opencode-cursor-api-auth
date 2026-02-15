# Fix Progressive Thinking and Answer Streaming in Cursor Proxy

## TL;DR

> **Quick Summary**: Replace the tool-enabled streaming buffer path with structured incremental stream handling so users receive progressive output instead of waiting for final completion.
>
> **Deliverables**:
> - Tool-path streaming refactor in `src/plugin.ts`
> - Minimal automated test setup with Bun test
> - Targeted unit/integration verification for streaming + tool-call compatibility
> - Rebuilt `dist/plugin.js` output and updated notes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - mostly sequential due shared hot path
> **Critical Path**: Task 1 -> Task 2 -> Task 3 -> Task 4

---

## Context

### Original Request
Fix the plugin issue where output is only visible after the prompt finishes.

### Interview Summary
**Key Discussions**:
- User wants progressive streaming for both thinking-like output and answer output.
- The bug is in this plugin proxy path, not in OpenCode core.
- User approved minimal test setup in this repo.

**Research Findings**:
- `src/plugin.ts:359` currently buffers tool-enabled stdout via `new Response(child.stdout).text()`.
- `src/plugin.ts:419` non-tool streaming already emits incremental SSE deltas.
- No test framework or test files exist (`package.json:11` is a placeholder failing script).

### Metis Review
**Identified Gaps (addressed in this plan)**:
- Use structured streaming mode from `cursor-agent` for tool-path streaming instead of fragile full-text buffering.
- Explicitly guard against scope creep (no non-tool path rewrite, no non-stream path rewrite).
- Handle stream edge cases: malformed lines, empty deltas, no-thinking models, tool-event distinction.

---

## Work Objectives

### Core Objective
Deliver true progressive output in tool-enabled streaming requests while preserving OpenAI-compatible tool-calling responses and existing behavior outside the scoped path.

### Concrete Deliverables
- Incremental tool-path streaming implementation in `src/plugin.ts`.
- New parsing helpers for structured stream events.
- Minimal Bun test infrastructure and targeted tests under `src/__tests__/`.
- Updated compiled output in `dist/plugin.js`.

### Definition of Done
- [ ] Streaming request with tools emits multiple content deltas before completion.
- [ ] Tool-call responses still terminate with `finish_reason: "tool_calls"` when applicable.
- [ ] `bun test` passes.
- [ ] `npm run build` passes and `dist/plugin.js` reflects source changes.

### Must Have
- Progressive SSE output for tool-enabled streaming requests.
- Compatibility with existing `parseToolCallPlan` JSON contract.
- Minimal automated tests added and runnable via `bun test`.

### Must NOT Have (Guardrails)
- No changes to non-tool streaming path in `src/plugin.ts:419` unless required for regression fixes.
- No changes to non-streaming path in `src/plugin.ts:269` unless required for regression fixes.
- No custom SSE fields for thinking (stream as regular content deltas).
- No dedicated thinking panel work.
- No `--force` cursor-agent flag addition.

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> All verification is executed by agent commands/tools. No manual tester actions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: YES (Tests-after)
- **Framework**: Bun test (`bun test`)

### Agent-Executed QA Scenarios (MANDATORY - ALL tasks)

Scenario: Tool-enabled stream emits progressive chunks
  Tool: Bash (curl)
  Preconditions: Plugin loaded; proxy reachable at `http://127.0.0.1:32123/v1`; logged into cursor-agent
  Steps:
    1. Run `curl -N -sS -X POST http://127.0.0.1:32123/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"sonnet-4.5-thinking","stream":true,"messages":[{"role":"user","content":"explain recursion briefly"}],"tools":[{"type":"function","function":{"name":"noop","description":"noop","parameters":{"type":"object","properties":{}}}}]}'`
    2. Capture first 20 `data:` lines to `.sisyphus/evidence/task-stream-progressive.log`
    3. Assert at least 2 non-empty content chunks appear before `[DONE]`
  Expected Result: Progressive content appears during generation, not only at end
  Failure Indicators: Only heartbeat/empty chunks until one final chunk
  Evidence: `.sisyphus/evidence/task-stream-progressive.log`

Scenario: Tool-call envelope remains valid
  Tool: Bash (curl)
  Preconditions: Same as above
  Steps:
    1. Send a prompt likely to trigger tool-call JSON plan in strict tool mode
    2. Capture response stream JSON to `.sisyphus/evidence/task-toolcall-shape.log`
    3. Assert terminal chunk includes `finish_reason` of `tool_calls` when tool plan is produced
    4. Assert `choices[0].delta.tool_calls[0].function.arguments` is valid JSON string
  Expected Result: OpenAI-compatible tool-call structure preserved
  Failure Indicators: Missing `tool_calls`, malformed arguments, wrong finish reason
  Evidence: `.sisyphus/evidence/task-toolcall-shape.log`

Scenario: Non-tool streaming regression check
  Tool: Bash (curl)
  Preconditions: Same proxy
  Steps:
    1. Run streaming request without `tools`
    2. Capture output to `.sisyphus/evidence/task-non-tool-regression.log`
    3. Assert deltas still stream and request completes with `[DONE]`
  Expected Result: Existing non-tool streaming behavior remains intact
  Failure Indicators: No streaming or broken completion contract
  Evidence: `.sisyphus/evidence/task-non-tool-regression.log`

Scenario: Malformed/empty stream event handling
  Tool: Bun test
  Preconditions: Unit tests implemented
  Steps:
    1. Run `bun test src/__tests__/plugin.streaming.test.ts`
    2. Assert parser ignores malformed lines and empty thinking deltas without crashing
  Expected Result: Robust parser behavior under malformed input
  Failure Indicators: uncaught exceptions or failed assertions
  Evidence: test output

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately):
└── Task 1: Add minimal Bun test scaffolding

Wave 2 (After Wave 1):
└── Task 2: Add structured stream parsing helpers + parser tests

Wave 3 (After Wave 2):
└── Task 3: Refactor tool-enabled streaming branch to incremental event handling

Wave 4 (After Wave 3):
└── Task 4: Add compatibility tests and execute QA scenarios + rebuild dist

Critical Path: 1 -> 2 -> 3 -> 4
Parallel Speedup: negligible (shared file hotspot)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None |
| 2 | 1 | 3, 4 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | `task(category="quick", load_skills=["typescript-expert","testing-patterns"], run_in_background=false)` |
| 2 | 2 | `task(category="unspecified-high", load_skills=["typescript-expert","clean-code"], run_in_background=false)` |
| 3 | 3 | `task(category="unspecified-high", load_skills=["typescript-expert","clean-code"], run_in_background=false)` |
| 4 | 4 | `task(category="quick", load_skills=["testing-patterns","git-master"], run_in_background=false)` |

---

## TODOs

- [ ] 1. Add minimal Bun test infrastructure

  **What to do**:
  - Replace placeholder test script in `package.json` with Bun test command.
  - Create `src/__tests__/` directory and baseline test file for plugin stream parser tests.
  - Keep setup lightweight: no Jest/Vitest installation.

  **Must NOT do**:
  - Do not add heavy test frameworks.
  - Do not alter production runtime behavior in this task.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small localized setup in one manifest + test folder.
  - **Skills**: `typescript-expert`, `testing-patterns`
    - `typescript-expert`: preserve TS project compatibility with Bun test.
    - `testing-patterns`: establish clean, minimal test organization.
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: omitted because strategy is tests-after, not strict red-first.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `package.json:9` - scripts section to replace failing test command.
  - `package.json:11` - current placeholder test script.
  - `tsconfig.json:1` - ensure test TS files align with existing module settings.

  **Acceptance Criteria**:
  - [ ] `package.json` contains `"test": "bun test"`.
  - [ ] `bun test --help` exits successfully.
  - [ ] `src/__tests__/plugin.streaming.test.ts` exists and is discoverable by Bun test.

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Bun test wiring is active
    Tool: Bash
    Preconditions: Task changes applied
    Steps:
      1. Run `bun test --help`
      2. Run `bun test src/__tests__/plugin.streaming.test.ts`
      3. Assert command discovery succeeds (exit code 0)
    Expected Result: Bun test command is wired and test file is discoverable
    Evidence: terminal output capture

  Scenario: Legacy placeholder script is gone
    Tool: Bash
    Preconditions: package.json updated
    Steps:
      1. Run `npm test`
      2. Assert output does not contain `Error: no test specified`
    Expected Result: npm test no longer calls placeholder script
    Evidence: terminal output capture
  ```

  **Commit**: NO

- [ ] 2. Add structured stream parsing helpers and parser unit tests

  **What to do**:
  - Add helper(s) in `src/plugin.ts` (or colocated helper module) to parse line-delimited stream JSON events safely.
  - Normalize event extraction for:
    - thinking delta text
    - assistant text segments
    - final result text payload
    - non-content events to ignore.
  - Add unit tests covering valid, empty, malformed, and unsupported event lines.

  **Must NOT do**:
  - Do not change `parseToolCallPlan` signature/contract.
  - Do not map cursor-agent internal `tool_call` events to OpenCode tool calls.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: nuanced parser behavior + edge-case safety.
  - **Skills**: `typescript-expert`, `clean-code`
    - `typescript-expert`: robust typed event handling.
    - `clean-code`: keep parser small and explicit.
  - **Skills Evaluated but Omitted**:
    - `ultrabrain`: omitted because complexity is moderate and localized.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: 3, 4
  - **Blocked By**: 1

  **References**:
  - `src/plugin.ts:121` - existing `parseToolCallPlan` behavior to preserve.
  - `src/plugin.ts:187` - chunk helper used when emitting SSE data.
  - `src/plugin.ts:340` - streaming entrypoint context.
  - `README.md:79` - confirms no dedicated thinking panel expectation.

  **Acceptance Criteria**:
  - [ ] Parser returns `null`/safe fallback for malformed JSON line input.
  - [ ] Parser extracts thinking text from delta events.
  - [ ] Parser extracts assistant text from assistant message events.
  - [ ] Unit tests pass for at least: valid thinking line, valid assistant line, malformed line, empty line.

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Parse valid stream-json lines
    Tool: Bun test
    Preconditions: parser helper + tests implemented
    Steps:
      1. Run `bun test src/__tests__/plugin.streaming.test.ts`
      2. Assert test case for valid thinking delta passes
      3. Assert test case for valid assistant text event passes
    Expected Result: parser extracts expected fields for valid events
    Evidence: test output

  Scenario: Malformed and empty lines are ignored safely
    Tool: Bun test
    Preconditions: malformed input test cases added
    Steps:
      1. Run `bun test src/__tests__/plugin.streaming.test.ts`
      2. Assert malformed JSON line case does not throw
      3. Assert empty line case returns null/ignored outcome
    Expected Result: robust no-crash handling for malformed input
    Evidence: test output
  ```

  **Commit**: NO

- [ ] 3. Refactor tool-enabled streaming branch to incremental structured streaming

  **What to do**:
  - In cursor-agent command args, switch tool-enabled streaming mode to structured stream format with partial output enabled.
  - Replace full-buffer logic in tool-enabled streaming path with incremental reader loop.
  - Stream available thinking/assistant text as regular `delta.content` chunks as lines arrive.
  - Accumulate final text source for `parseToolCallPlan`; preserve existing tool-call JSON output contract.
  - Keep heartbeat only if needed after validating real event cadence.

  **Must NOT do**:
  - Do not alter `buildToolCallingPrompt` output schema.
  - Do not alter non-tool path loop in `src/plugin.ts:419` except regression fixes.
  - Do not alter non-stream path in `src/plugin.ts:269` except regression fixes.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: core behavioral change in production request path.
  - **Skills**: `typescript-expert`, `clean-code`
    - `typescript-expert`: async stream handling and type-safe event dispatch.
    - `clean-code`: avoid over-complex state machine.
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: omitted because this is server/proxy stream logic.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: 4
  - **Blocked By**: 2

  **References**:
  - `src/plugin.ts:250` - command array where output flags are configured.
  - `src/plugin.ts:344` - current tool-enabled streaming block to replace.
  - `src/plugin.ts:359` - current blocking full-buffer read (root cause).
  - `src/plugin.ts:369` - current plan parse point to preserve contract.
  - `src/plugin.ts:419` - reference incremental reader pattern already used for non-tools.
  - `dist/plugin.js:295` - compiled counterpart root-cause buffer code.

  **Acceptance Criteria**:
  - [ ] Tool-enabled stream path emits non-empty `delta.content` chunks before final completion when upstream events provide content.
  - [ ] If parsed plan action is `tool_call`, response emits tool-calls chunk with `finish_reason: "tool_calls"`.
  - [ ] If parsed plan action is `final`, response emits final assistant content chunk with `finish_reason: "stop"`.
  - [ ] Non-zero exit still surfaces a terminal error/fallback chunk and `[DONE]`.

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Streaming emits progressive content in tool-enabled mode
    Tool: Bash (curl)
    Preconditions: proxy is running and authenticated
    Steps:
      1. POST stream request with model `sonnet-4.5-thinking` and one dummy function tool
      2. Capture stream lines to `.sisyphus/evidence/task-3-progressive.log`
      3. Assert at least 2 non-empty `delta.content` chunks appear before terminal `[DONE]`
    Expected Result: content arrives progressively during generation
    Evidence: `.sisyphus/evidence/task-3-progressive.log`

  Scenario: Stream handles upstream failure path
    Tool: Bun test or Bash (mocked/non-zero child)
    Preconditions: failure-path test harness exists
    Steps:
      1. Trigger non-zero child exit in test scenario
      2. Assert final emitted chunk contains error/fallback message
      3. Assert stream still terminates with `[DONE]`
    Expected Result: graceful terminal failure behavior
    Evidence: test output or captured stream log
  ```

  **Commit**: NO

- [ ] 4. Add regression tests, run QA scenarios, rebuild dist, and update notes

  **What to do**:
  - Add tests for tool-call plan preservation and stream parser edge cases.
  - Execute Bun tests and build.
  - Rebuild compiled output (`dist/plugin.js`) so source and dist stay aligned.
  - Update README note only if behavior/limitations wording changed.
  - Collect evidence logs under `.sisyphus/evidence/`.

  **Must NOT do**:
  - Do not claim dedicated thinking panel support.
  - Do not skip regression checks for non-tool and non-stream requests.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: validation + build + docs consistency work.
  - **Skills**: `testing-patterns`, `git-master`
    - `testing-patterns`: structured assertions and edge-case coverage.
    - `git-master`: ensure clean final delta for release readiness.
  - **Skills Evaluated but Omitted**:
    - `writing`: omitted unless README wording change is substantial.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: 3

  **References**:
  - `package.json:10` - build command for dist sync.
  - `README.md:76` - Notes section for any wording adjustments.
  - `dist/plugin.js:271` - streaming branch in compiled artifact to verify.

  **Acceptance Criteria**:
  - [ ] `bun test` passes with new parser/stream tests.
  - [ ] `npm run build` passes and updates `dist/plugin.js`.
  - [ ] QA evidence files exist for progressive stream, tool-call shape, and non-tool regression scenarios.
  - [ ] README (if changed) remains aligned with actual capability boundaries.

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Full regression suite green
    Tool: Bash
    Preconditions: all code/test changes complete
    Steps:
      1. Run `bun test`
      2. Run `npm run build`
      3. Assert both commands exit 0
    Expected Result: automated test and build verification pass
    Evidence: terminal output capture

  Scenario: Non-tool stream remains stable
    Tool: Bash (curl)
    Preconditions: proxy running
    Steps:
      1. Send streaming request without `tools`
      2. Capture to `.sisyphus/evidence/task-4-non-tool.log`
      3. Assert stream deltas arrive and `[DONE]` is present
    Expected Result: no regression in existing non-tool behavior
    Evidence: `.sisyphus/evidence/task-4-non-tool.log`
  ```

  **Commit**: YES
  - Message: `fix(streaming): emit progressive tool-path output`
  - Files: `src/plugin.ts`, `src/__tests__/plugin.streaming.test.ts`, `package.json`, `dist/plugin.js`, `README.md` (if needed)
  - Pre-commit: `bun test && npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `fix(streaming): emit progressive tool-path output` | streaming + tests + dist | `bun test && npm run build` |

---

## Success Criteria

### Verification Commands

```bash
bun test
# Expected: all tests pass

npm run build
# Expected: TypeScript compile succeeds, dist updated

curl -N -sS -X POST http://127.0.0.1:32123/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"sonnet-4.5-thinking","stream":true,"messages":[{"role":"user","content":"explain recursion briefly"}],"tools":[{"type":"function","function":{"name":"noop","description":"noop","parameters":{"type":"object","properties":{}}}}]}'
# Expected: multiple non-empty content chunks before [DONE]
```

### Final Checklist
- [ ] All Must Have items are present.
- [ ] All Must NOT Have guardrails are respected.
- [ ] Progressive streaming is confirmed for tool-enabled path.
- [ ] Tool-calling compatibility remains intact.
- [ ] Automated tests and build pass.
