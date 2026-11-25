# Bug report template (illustrative – not a finding)

> This file is a **template**. It does not describe a real defect. Verified findings are listed in [README.md](README.md).

| Field               | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| Bug ID              | BUG-NNN                                                        |
| Summary             | `<component>` – `<observable symptom>` when `<condition>`      |
| Component           | e.g. Orders – `POST /api/orders`                               |
| Application version | commit SHA / image tag                                         |
| Environment         | host, Docker version, DB version, test runner                  |
| Severity            | Critical / High / Medium / Low (impact)                        |
| Priority            | P1–P4 (urgency)                                                |
| Reproduction rate   | measured, e.g. 10/10 runs, or "host-dependent" with data       |
| Requirement basis   | link to the requirement, or "inferred – needs PO confirmation" |
| Status              | New / Confirmed / Reported upstream / Fixed / Verified         |
| Automated test      | path › test title                                              |

## Description

What is wrong, in one paragraph, without speculation.

## Preconditions

Data and state needed.

## Steps to reproduce

Numbered, minimal, copy-pasteable requests.

## Expected result

What should happen, and where that expectation comes from.

## Actual result

What happens, with status codes and the relevant response fields.

## Evidence

Sanitized request/response pairs (no tokens or passwords), report attachment names, screenshots.

## Database evidence

Parameterized query and result, if applicable.

## Root cause

Mark it as _verified_ (with file and line) or _hypothesis_. Never present a hypothesis as fact.

## Business impact

Who is affected, how, and how often.

## Suggested remediation

A concrete fix, plus the test that will verify it.
