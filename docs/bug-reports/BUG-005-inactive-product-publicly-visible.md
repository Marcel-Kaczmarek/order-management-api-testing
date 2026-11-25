# BUG-005 – Soft-deleted products remain publicly readable by id

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-005                                                                                        |
| Component           | Products – `GET /api/products/:id`                                                             |
| Application version | orderflow-api `259c7d0e`                                                                       |
| Severity            | **Low** – discontinued product data is exposed, and the catalog is inconsistent                |
| Priority            | **P3**                                                                                         |
| Reproduction rate   | 100 %                                                                                          |
| Requirement basis   | AUT README, Features: "Product CRUD (admin writes; **public/customer reads active catalog**)". |
| Status              | Open – confirmed by automation                                                                 |
| Automated test      | `tests/regression/known-defects.spec.ts` › "BUG-005 …"                                         |

## Steps to reproduce

1. Create a product as admin.
2. Send `DELETE /api/products/<id>` as admin (soft delete) and receive `200` with `"isActive": false`.
3. Send `GET /api/products/<id>` **anonymously**.

## Expected result

`404 Product not found` for the public, consistent with the listing (which excludes inactive products) and with order placement (which rejects them).

## Actual result

`200 OK` with the full product, `"isActive": false`, including its stock and price.

## Root cause (verified)

`products.service.ts` `findOne` (lines 33–34) uses `findUnique({ where: { id } })` with no `isActive` filter. The same method also serves the admin update and delete paths, so the fix needs a separate public read path.

## Business impact

Delisted products stay reachable from bookmarks, search engines and integrations, with stale prices. The three read paths (list, detail, order) disagree about what exists.

## Suggested remediation

Filter on `isActive: true` for anonymous and customer reads, and keep the unfiltered lookup for admin operations.
