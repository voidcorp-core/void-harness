---
skill: llm-cost-discipline
status: draft
strategy: original + adapt
target_loc: 350
phase: D
depends_on: []
composes_with: [security-guidance, observability]
matrix_row: plans/skill-decision-matrix.md#llm-cost-discipline
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `llm-cost-discipline`

## Need

Without `llm-cost-discipline`, LLM-heavy apps burn 10× the necessary cost: no prompt caching, Opus everywhere when Sonnet would suffice, batch API ignored, token budgets unstated, retries unbounded. The skill exists to make cost a first-class design concern from line one.

## Decision matrix anchor

- **Wins**: any code calling an LLM API. Prompt caching, batch, model selection, token budgets
- **Loses to**: `security-guidance` on prompt-injection-aware design (data plane vs control plane)
- **Cannot decide**: model choice when quality is uncertain (escalates to `benchmark-models` in gstack)
- **Composes with**: existing `claude-api` skill

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Anthropic prompt caching docs | https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching | foundation | kept |
| Anthropic batch API | https://docs.anthropic.com/en/docs/build-with-claude/batch-processing | foundation | kept |
| Existing `claude-api` gstack skill | gstack/skills | composed | composed (we extend, not replace) |
| OpenAI batch docs | https://platform.openai.com/docs/api-reference/batch | reference | tactical (if consumer uses OpenAI) |
| Model-router patterns (LangChain, etc.) | various | reviewed | partially kept (model selection logic) |

## Adaptation strategy

`original` + adapt. Compose existing `claude-api` skill (already excellent on caching); add the discipline layer on top (when to use which model, batch by default, token budgets, fallback strategies).

## Hard rules (draft)

- Prompt caching ENABLED BY DEFAULT for any prompt > 1024 tokens that is invoked > 1×/hour. Cache hit rate logged via `observability`
- Model selection: Sonnet is the default. Opus requires justified comment in code ("// using Opus because <reason>"). Haiku for high-volume classification / extraction
- Batch API for any non-interactive workload (overnight processing, bulk analysis) — 50% discount, no excuse not to
- Token budget declared per LLM call site (`max_tokens` + estimated input budget). No "let the model decide"
- Retries: exponential backoff with jitter, max 3 attempts. Do NOT retry on prompt injection / refusal — different failure mode
- Fallback model declared for critical paths (Opus → Sonnet on quota / outage)
- Streaming for user-facing interactive: yes. For batch / programmatic: no (parse complete response)
- Logging: every LLM call logs model, input tokens, output tokens, latency, cache hit (composes with `observability`)
- Never log full prompts in plain logs (composes with `security-guidance` — PII / secrets risk)

## Modes — none

## Companion hooks

- `llm-cost-precommit` (pre-commit on AI SDK code) — warn if `model: 'opus'` without justifying comment

## Composition

- Composes with `claude-api` skill (already comprehensive for Anthropic SDK specifics)
- Composes with `observability` (cache hit rate metric)
- Composes with `security-guidance` (prompt injection, prompt logging)

## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Default token budget heuristic per skill / task type — defer to first 10 real apps
- Multi-provider support (Anthropic + OpenAI + Gemini) — abstract behind a thin shim? Lean no (each SDK is different enough; consumer picks one primarily)
