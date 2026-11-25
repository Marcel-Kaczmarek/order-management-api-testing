# AI-Assisted Quality Engineering (optional module)

This module describes how an AI assistant can speed up QA work, and the human controls that keep the output trustworthy. **Nothing in the framework depends on an AI service.** All tests, reports and pipelines run without any paid API.

## Principles

1. **AI drafts, humans decide.** Every AI-produced artifact is reviewed, executed and verified before it is merged.
2. **Code and behaviour are the source of truth.** AI suggestions about how the API behaves are hypotheses until a test or a manual request confirms them.
3. **Sanitize before sharing.** Only redacted logs go to an AI tool: no tokens, passwords, personal data or production data. The framework's `sanitize()` utility (`src/utilities/sanitizer.ts`) and the `http-exchanges.json` attachments are already redacted.
4. **No fabricated evidence.** AI must never invent bug reports, metrics or execution results. Every number in this repository comes from an actual run.

## Workflows and review gates

| Use case                                     | AI input                                                 | AI output                                           | Human validation                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario generation from acceptance criteria | AUT README "Acceptance criteria" + DTOs                  | Candidate scenarios grouped by risk                 | Cross-check against the source code and discard scenarios for unimplemented features (refresh tokens, 422 codes, filtering). Then map the rest to RTM IDs. |
| Boundary-case discovery                      | DTO decorators (`@Min(1)`, `@MinLength(8)`, `@Max(100)`) | Boundary list (n-1, n, n+1, type confusion)         | Confirm each against actual responses. Example: an AI expected 422 for validation errors, but the AUT returns 400.                                         |
| Test-code review                             | A spec file diff                                         | Comments on flakiness, missing assertions, coupling | Accept only what is reproducible. Example: a raw-text check on a random total was replaced after review (BOLA-02).                                         |
| Failure-log analysis                         | Sanitized `http-exchanges.json` + error                  | Hypotheses on root cause                            | Verify by reading the AUT code. Example: BUG-001's root cause was confirmed in `orders.service.ts` before reporting.                                       |
| Regression suggestions                       | A fixed defect + diff                                    | Neighbouring scenarios                              | Prioritise by the risk matrix.                                                                                                                             |
| Bug-report drafting                          | Verified evidence (request/response, DB rows)            | Jira-style draft                                    | Engineer checks severity, steps and wording, and re-runs the reproduction.                                                                                 |

## Example prompt (scenario generation)

```text
You are reviewing a NestJS order API. Here are the DTOs and the OrdersService.create method
(pasted). List boundary and negative test scenarios for POST /orders. For each one give: input,
the expected status code *according to this code* (not REST conventions), and the invariant
to check in the database. Mark anything you are unsure of as "UNVERIFIED".
```

## Example review checklist applied to AI-generated tests

- [ ] Does the expected status come from the AUT's code or contract, rather than an assumption?
- [ ] Is the test independent (own data, no ordering) and deterministic (no sleeps)?
- [ ] Does it assert a business invariant, not just a status code?
- [ ] Would it still pass if the defect it targets were present? If so, the assertion is too weak.
- [ ] Are secrets kept out of logs and attachments?

## Where AI was used in this project

AI assistance (Claude) was used to draft framework code and documentation. Every test was executed against the real AUT, and every defect was reproduced by automation and traced to a line of upstream source before being documented.
