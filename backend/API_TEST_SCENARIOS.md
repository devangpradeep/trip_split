# Tripsplit API test scenarios

## Purpose

This document is the test coverage contract for the Tripsplit Rails API. It covers every Tripsplit-owned JSON endpoint currently exposed in `config/routes.rb`, the calculation services behind those endpoints, persistence rules, authorization, notifications, and important concurrent-request cases. Rails-internal Active Storage and Action Mailbox routes are framework infrastructure and are excluded.

API endpoint tests are request/integration tests, not unit tests. Calculation algorithms, validations, and notification services should have focused unit tests. Both layers are required: request tests prove that the API is wired correctly, while service tests identify calculation failures precisely.

## Priorities

- **P0**: Financial correctness, data isolation, authorization, or data-loss protection. These must block deployment.
- **P1**: Core behavior and important validation. These should normally block deployment.
- **P2**: Response presentation, limits, and lower-risk edge cases.

## Proposed test layout

The application currently has `rails/test_unit/railtie` disabled and no test directory. The lowest-dependency setup is to enable Rails' Minitest support and use:

```text
test/
  test_helper.rb
  fixtures/ or support/factories/
  models/
  services/balances/
  services/notifications/
  services/push_notifications/
  requests/
  migrations/
```

Use PostgreSQL in the test environment so database constraints, locking, UUIDs, and concurrency behavior match production. Use `BigDecimal` or exact decimal strings in financial assertions; never use binary floating-point equality.

## Rules applied to every API test

Unless an endpoint is explicitly public, every endpoint must cover:

- **P0** Missing JWT returns `401` and does not change data.
- **P0** Expired, malformed, and revoked JWTs return `401`.
- **P0** A valid JWT can access only records belonging to a group in which the user is a member.
- **P0** IDs from another group/account return `404`, without revealing whether the record exists.
- **P1** Missing required root parameters return `400` or the documented validation response.
- **P1** Unsupported attributes are ignored and cannot mass-assign protected fields.
- **P1** The response status, JSON schema, and database side effects agree.
- **P1** A failed mutation is atomic: no partial parent, child, attachment, or notification records remain.
- **P1** Repeating safe reads produces no database changes.
- **P2** Responses do not expose password hashes, reset tokens, JWT denylist data, encryption internals, or another user's private payment details.

Freeze time in tests that assert dates, expiration, ordering, `last_activity_at`, or notification timestamps. Stub Web Push and all external delivery; tests must never use the network.

## Financial invariants

These assertions should be shared helpers and applied to every calculation scenario:

1. Each expense's persisted split amounts total the expense amount exactly to paise precision.
2. The sum of all member net balances is exactly zero when all expense splits total their expenses.
3. Positive balances equal the absolute value of negative balances.
4. A suggested settlement always has two different group members, an amount greater than zero, and at most two decimal places.
5. Applying every suggested settlement results in zero net balance for every member.
6. Direct-payment suggestions preserve pairwise obligations; simplified suggestions preserve only net balances.
7. Sequential settlement creation cannot exceed the currently suggested amount.
8. Failed expense or settlement mutations do not change balances.
9. Guest and registered users participate in calculations identically. Guest status changes who may record a settlement, not the arithmetic.
10. The group's settlement method is used consistently for balances, settlement validation, group summary values, and archive/delete eligibility.

---

# Calculation and domain unit tests

## `Balances::Calculator`

- **CALC-001 P0** Empty group returns no non-zero balances.
- **CALC-002 P0** One payer covers `100.00` for two members equally: payer is `+50.00`, other member is `-50.00`.
- **CALC-003 P0** Payer included in their own split: the payer's own share cancels only that portion of the payment.
- **CALC-004 P0** Payer excluded from splits: payer receives the full expense amount from participants.
- **CALC-005 P0** Multiple expenses with different payers and overlapping participants aggregate correctly.
- **CALC-006 P0** Exact, equal, and percentage splits produce identical balances when their persisted split amounts are identical.
- **CALC-007 P0** A settlement increases the sender's net balance and decreases the recipient's net balance by the same amount.
- **CALC-008 P0** Multiple partial settlements accumulate correctly.
- **CALC-009 P0** Deleting a settlement restores the pre-settlement balances.
- **CALC-010 P0** Guest members are included exactly like registered members.
- **CALC-011 P0** Every valid ledger sums to zero exactly at two-decimal precision.
- **CALC-012 P1** A member with no payment, split, or settlement does not affect the ledger.

## Expense split calculation

The split-building code is currently private controller logic. It should eventually be extracted into a service so these can be fast unit tests. Until then, cover them through `POST` and `PATCH` expense request tests.

### Equal splits

- **SPLIT-EQ-001 P0** `100.00 / 2` produces `50.00`, `50.00`.
- **SPLIT-EQ-002 P0** `100.00 / 3` produces `33.34`, `33.33`, `33.33` in deterministic participant order and totals `100.00`.
- **SPLIT-EQ-003 P0** `0.01 / 3` allocates the single paisa once and totals `0.01`.
- **SPLIT-EQ-004 P0** Remainder paise are distributed deterministically and never lost.
- **SPLIT-EQ-005 P0** Selected participants only are included.
- **SPLIT-EQ-006 P1** When no split list is supplied, all current group members participate.
- **SPLIT-EQ-007 P1** Duplicate participant IDs do not create duplicate persisted splits.

### Exact splits

- **SPLIT-EX-001 P0** Exact amounts totaling the expense are persisted unchanged.
- **SPLIT-EX-002 P0** Missing amount for any selected participant is rejected.
- **SPLIT-EX-003 P0** Total below or above the expense is rejected, including the one-paisa boundary.
- **SPLIT-EX-004 P0** Negative and non-numeric amounts are rejected.
- **SPLIT-EX-005 P1** Zero share is accepted only when the participant is intentionally included.
- **SPLIT-EX-006 P1** Duplicate rows for the same participant are rejected rather than silently overwritten.

### Percentage splits

- **SPLIT-PC-001 P0** `50/50` and other exact percentages produce correct amounts.
- **SPLIT-PC-002 P0** Percentages must total exactly `100.00`, including boundary cases around `99.99` and `100.01`.
- **SPLIT-PC-003 P0** Missing, negative, and non-numeric percentages are rejected.
- **SPLIT-PC-004 P0** Rounding remainder is assigned deterministically and split amounts still total the expense.
- **SPLIT-PC-005 P1** Decimal percentages such as `33.33/33.33/33.34` work correctly.
- **SPLIT-PC-006 P1** Duplicate participant percentage rows are rejected.

### Shared split validation

- **SPLIT-SH-001 P0** Expense amount must be greater than zero.
- **SPLIT-SH-002 P0** At least one participant is required.
- **SPLIT-SH-003 P0** Every participant must be a current member of the group.
- **SPLIT-SH-004 P0** An unsupported split type is rejected.
- **SPLIT-SH-005 P1** The legacy `amount` split type is normalized to `exact`.
- **SPLIT-SH-006 P0** Updating with invalid splits rolls back both expense attributes and old splits.

## `Balances::PairwiseSettlementCalculator`

- **PAIR-001 P0** One debtor owes the original payer the correct amount.
- **PAIR-002 P0** A payer's own split never creates a self-payment.
- **PAIR-003 P0** Independent debts to different payers remain separate.
- **PAIR-004 P0** Opposite obligations between two members net into one direction.
- **PAIR-005 P0** Partial settlement reduces only the matching pair.
- **PAIR-006 P0** A fully paid pair disappears from suggestions.
- **PAIR-007 P0** A payment larger than a pairwise obligation would reverse direction at calculation level; the settlement API must prevent creating that overpayment.
- **PAIR-008 P0** A settlement between one pair does not reduce a different pair's obligation.
- **PAIR-009 P0** Guest obligations are treated identically to registered-user obligations.
- **PAIR-010 P1** Suggestions are ordered by amount descending.
- **PAIR-011 P1** Amounts below the epsilon are omitted and exactly one paisa remains visible.

## `Balances::SettlementSimplifier`

- **SIMP-001 P0** One debtor and one creditor produce one transfer.
- **SIMP-002 P0** Multiple debtors and one creditor produce the minimum required transfers.
- **SIMP-003 P0** One debtor and multiple creditors produce correct transfers.
- **SIMP-004 P0** Multiple debtors and creditors preserve every member's net balance.
- **SIMP-005 P0** Simplification may route payment to someone other than the original payer without changing anyone's final net position.
- **SIMP-006 P0** Applying all suggestions clears every balance.
- **SIMP-007 P1** Zero and sub-paisa residual balances produce no transfer.
- **SIMP-008 P1** Equal-amount ties produce deterministic output so API responses do not change randomly.
- **SIMP-009 P0** Total suggested outgoing amount equals total debt and total suggested incoming amount equals total credit.

## `Balances::SettlementPlanner`

- **PLAN-001 P0** Direct mode calls the pairwise calculator.
- **PLAN-002 P0** Simplified mode calls the simplifier.
- **PLAN-003 P0** A fully net-settled group returns no suggestions in either mode.
- **PLAN-004 P0** Closed historical payment cycles do not make a zero-net group appear unsettled.
- **PLAN-005 P0** The exact same plan is used by balances, settlement creation limits, group summary amounts, and archive/delete checks.
- **PLAN-006 P0** Changing mode before the first settlement changes routing but not member net balances.
- **PLAN-007 P0** Mode cannot change after the first settlement.

## Golden regression: real-life trip

Create a permanent anonymized fixture from a verified real-life trip ledger, including the `Younger brother -> Trip organiser 975.00` settlement.

- **REAL-TRIP-001 P0** Expenses total `11980.00` and splits total `11980.00`.
- **REAL-TRIP-002 P0** Final net balances are:
  - Trip organiser: `-82.75`
  - Younger brother: `-2051.75`
  - Friend one: `+1804.25`
  - Friend two: `+330.25`
- **REAL-TRIP-003 P0** Simplified suggestions are:
  - Younger brother pays Friend one `1804.25`
  - Younger brother pays Friend two `247.50`
  - Trip organiser pays Friend two `82.75`
- **REAL-TRIP-004 P0** Direct suggestions are:
  - Younger brother pays Friend one `1166.75`
  - Younger brother pays Friend two `885.00`
  - Friend two pays Friend one `415.75`
  - Trip organiser pays Friend one `221.75`
  - Friend two pays Trip organiser `139.00`
- **REAL-TRIP-005 P0** Both suggestion sets settle the same net balances without overpaying any member.
- **REAL-TRIP-006 P0** Preserving simplified mode for this already-settled legacy group does not reinterpret its historical settlement.

## Model tests

### `User`

- Name is required and whitespace is normalized.
- Email uniqueness and Devise email/password validation work for registered users.
- Guest users may exist with generated credentials and preserve `is_guest` status until claimed.
- UPI ID is normalized to lowercase and validated.
- IFSC is normalized to uppercase and validated.
- Bank account number removes non-digits, accepts 6–18 digits, and rejects invalid lengths.
- Payment fields are encrypted at rest when encryption keys are configured.
- Notification preferences default to true and persist independently.

### `Group`, `GroupMembership`, `Expense`, `ExpenseSplit`, and `Settlement`

- Required fields, numerical constraints, role inclusion, and unique membership constraints are enforced.
- Group defaults to INR and direct-payment mode for newly created records.
- Expense split type accepts only equal, exact, or percentage.
- Expense and settlement amounts must be greater than zero; split amounts cannot be negative.
- Expense receipt accepts JPEG, PNG, WebP, and HEIC up to 5 MB and rejects all other types/sizes.
- Touch behavior updates group activity after expense or settlement changes.

### `GroupInvite`, `Notification`, and `PushSubscription`

- Invite tokens are generated, unique, and correctly report active, expired, and revoked states.
- A nil invite expiration means no expiry.
- Notification requires event type/title and correctly reports read state.
- Push endpoint is globally unique and all subscription keys are required.

---

# API request scenarios

## Health

### `GET /up`

- **HEALTH-001 P1** Returns success while the Rails application has booted without an exception.
- **HEALTH-002 P2** Requires no authentication and exposes no application data.

## Authentication and account APIs

### `POST /users` — register or claim a guest account

- **AUTH-REG-001 P0** Valid new user is created, signed in, receives a JWT in the authorization header, and gets the expected user payload.
- **AUTH-REG-002 P1** Missing name, invalid email, short password, and mismatched confirmation return `422` without creating a user.
- **AUTH-REG-003 P1** Existing registered email is rejected case-insensitively.
- **AUTH-REG-004 P0** Registering with an existing guest email claims that exact user record instead of creating another user.
- **AUTH-REG-005 P0** Claiming a guest preserves memberships, expense splits, payments, settlements, and user ID while changing `is_guest` to false.
- **AUTH-REG-006 P1** Guest claim uses the submitted name when present and preserves the guest name when absent.
- **AUTH-REG-007 P1** Invalid guest-claim password leaves the guest record unchanged.
- **AUTH-REG-008 P0** Two concurrent registrations for the same email create at most one registered account and return a controlled conflict/validation response for the other request.

### `POST /users/sign_in`

- **AUTH-LOGIN-001 P0** Valid email/password returns `200`, expected user JSON, and a usable JWT.
- **AUTH-LOGIN-002 P0** Wrong password or unknown email returns `401` without revealing which credential was wrong.
- **AUTH-LOGIN-003 P1** Email lookup is case-insensitive and trims whitespace.
- **AUTH-LOGIN-004 P0** JWT expiry follows configured expiration and invalid non-positive configuration falls back to 24 hours.

### `DELETE /users/sign_out`

- **AUTH-LOGOUT-001 P0** Valid JWT returns `200`, adds its JTI to the denylist, and the same token subsequently returns `401`.
- **AUTH-LOGOUT-002 P1** Missing/inactive session returns `401` with the documented message.
- **AUTH-LOGOUT-003 P1** Repeated logout does not create an uncontrolled error.

### `GET /api/v1/auth/me`

- **AUTH-ME-001 P0** Valid JWT returns the current user identity.
- **AUTH-ME-002 P0** Missing, expired, malformed, or denied JWT returns `401`.
- **AUTH-ME-003 P2** Payload contains only id, email, name, and avatar URL.

### Devise password routes

`POST /users/password` and `PATCH|PUT /users/password` exist because `User` includes `recoverable`, even though password-reset delivery is not integrated into the product UI.

- **AUTH-PW-001 P1** Reset request for a known or unknown email returns a non-enumerating response.
- **AUTH-PW-002 P1** A generated reset token can change the password within six hours.
- **AUTH-PW-003 P1** Expired, invalid, or reused reset token is rejected.
- **AUTH-PW-004 P1** Password confirmation and minimum-length validation apply.
- **AUTH-PW-005 P0** Decide before implementation whether these routes are supported API contract or should be disabled until delivery exists; tests must enforce that decision.

### Inherited Devise account routes

`PATCH|PUT /users` and `DELETE /users` are also generated, while the application uses `/api/v1/profile` for profile updates.

- **AUTH-ACCOUNT-001 P0** Decide whether these inherited routes are supported or disabled.
- **AUTH-ACCOUNT-002 P0** If supported, current-password requirements, JWT authentication, permitted fields, and account deletion are tested.
- **AUTH-ACCOUNT-003 P0** If disabled, every method consistently returns `404` or `405` and cannot bypass profile validation.

Devise's generated HTML form routes (`GET /users/sign_in`, `/users/sign_up`, `/users/password/new`, and similar) are not Tripsplit JSON APIs and are excluded unless the product deliberately supports them.

## Profile

### `GET /api/v1/profile`

- **PROFILE-SHOW-001 P0** Returns only the authenticated user's identity, contact, payment, masked-account, and notification-preference data.
- **PROFILE-SHOW-002 P1** Masking preserves the last four digits and masks the preceding digits, including short/blank boundary values.
- **PROFILE-SHOW-003 P0** One user cannot retrieve another user's profile or payment details.

### `PATCH|PUT /api/v1/profile`

- **PROFILE-UPD-001 P1** Valid partial update persists only supplied fields.
- **PROFILE-UPD-002 P1** Name/phone whitespace, UPI lowercase, IFSC uppercase, and bank-account digit normalization work.
- **PROFILE-UPD-003 P1** Invalid UPI, IFSC, bank account, or blank name returns `422` and rolls back all submitted changes.
- **PROFILE-UPD-004 P1** Every notification preference can be independently enabled and disabled.
- **PROFILE-UPD-005 P0** Email, guest status, encrypted password, and authorization fields cannot be changed through this endpoint.

## Groups

### `GET /api/v1/groups`

- **GROUP-IDX-001 P0** Returns only groups in which the current user has membership.
- **GROUP-IDX-002 P1** Groups are ordered newest-created first.
- **GROUP-IDX-003 P0** Each payload reports correct role, member data, guest flags, settlement mode/lock, balances, direct amounts, permissions, counts, status, and last activity.
- **GROUP-IDX-004 P1** Active and archived groups are both returned with correct action flags.
- **GROUP-IDX-005 P0** `balances_settled` agrees with `SettlementPlanner`, not merely raw settlement count.

### `POST /api/v1/groups`

- **GROUP-CREATE-001 P0** Valid request creates the group and an admin membership for the creator in one transaction.
- **GROUP-CREATE-002 P1** Name is required; missing/blank name returns `422` with a user-displayable error.
- **GROUP-CREATE-003 P1** Currency defaults to INR when omitted and supplied supported currency persists.
- **GROUP-CREATE-004 P0** New group defaults to direct-payment mode.
- **GROUP-CREATE-005 P0** Membership failure rolls back group creation.
- **GROUP-CREATE-006 P0** Duplicate concurrent requests carrying the same idempotency key create one group and replay the first response.

### `GET /api/v1/groups/:id`

- **GROUP-SHOW-001 P0** A member receives the complete, correct group payload.
- **GROUP-SHOW-002 P0** Non-member/cross-group access returns `404`.
- **GROUP-SHOW-003 P1** Archived groups remain readable but mutation permissions are false.

### `PATCH|PUT /api/v1/groups/:id`

- **GROUP-UPD-001 P0** Owner and admin can update active-group name/description.
- **GROUP-UPD-002 P0** Ordinary member is forbidden.
- **GROUP-UPD-003 P1** Archived group cannot be updated.
- **GROUP-UPD-004 P0** Currency may change before any expense or settlement exists.
- **GROUP-UPD-005 P0** Currency change after financial activity is rejected; resubmitting the unchanged currency remains allowed.
- **GROUP-UPD-006 P0** Settlement mode may change before the first settlement.
- **GROUP-UPD-007 P0** Settlement mode change after any settlement is rejected; resubmitting the unchanged mode remains allowed.
- **GROUP-UPD-008 P1** Boolean strings for `simplify_debts` are cast correctly.
- **GROUP-UPD-009 P1** Validation failure does not partially update the group.

### `POST /api/v1/groups/:id/archive`

- **GROUP-ARCH-001 P0** Only the group creator/owner can archive.
- **GROUP-ARCH-002 P0** Group cannot archive while the planner reports any outstanding settlement.
- **GROUP-ARCH-003 P0** Settled group archives and all active invites are revoked atomically.
- **GROUP-ARCH-004 P1** Already archived group returns the documented validation error.
- **GROUP-ARCH-005 P0** Concurrent archive/invite creation leaves no active invite on an archived group.

### `POST /api/v1/groups/:id/restore`

- **GROUP-REST-001 P0** Only owner can restore.
- **GROUP-REST-002 P1** Archived group becomes active without automatically recreating invites.
- **GROUP-REST-003 P2** Restoring an already active group is idempotent or returns a documented validation response.

### `DELETE /api/v1/groups/:id`

- **GROUP-DEL-001 P0** Only owner can permanently delete.
- **GROUP-DEL-002 P0** Outstanding balances block deletion.
- **GROUP-DEL-003 P0** Settled group deletion removes dependent memberships, invites, expenses, splits, settlements, and attachments according to the intended cascade policy.
- **GROUP-DEL-004 P0** Other users and groups remain unchanged.

## Expenses

### `GET /api/v1/groups/:group_id/expenses`

- **EXP-IDX-001 P0** Group member receives only that group's expenses.
- **EXP-IDX-002 P1** Expenses sort by expense date descending and then creation time descending, so the latest-created expense on the same date appears first.
- **EXP-IDX-003 P1** Response includes payer, creator, splits/users, guest flags, and receipt metadata.
- **EXP-IDX-004 P1** Archived group expenses remain readable.

### `POST /api/v1/groups/:group_id/expenses`

- **EXP-CREATE-001 P0** Valid expense and all splits are created atomically with current user as creator.
- **EXP-CREATE-002 P0** Default payer is current user; explicitly selected payer must be a group member and may be a guest.
- **EXP-CREATE-003 P0** Non-member payer or split participant is rejected without persistence.
- **EXP-CREATE-004 P0** All equal/exact/percentage scenarios in the split section pass through the API.
- **EXP-CREATE-005 P1** Missing split type defaults to equal and legacy `amount` becomes exact.
- **EXP-CREATE-006 P1** Description, amount, currency, date, and split type validations return clear `422` errors.
- **EXP-CREATE-007 P0** Archived group rejects creation.
- **EXP-CREATE-008 P1** Valid receipt is attached and returned; invalid size/type rolls back the entire expense.
- **EXP-CREATE-009 P1** Notifications go once to unique payer/participants except actor and preference-disabled recipients.
- **EXP-CREATE-010 P0** Two simultaneous requests with the same idempotency key create one expense, one split set, and one notification set.
- **EXP-CREATE-011 P0** Define and enforce whether expense currency must equal group currency; calculations must never silently mix currencies.

### `GET /api/v1/groups/:group_id/expenses/:id`

- **EXP-SHOW-001 P0** Member receives the requested in-group expense with complete nested payload.
- **EXP-SHOW-002 P0** Expense belonging to another group returns `404`.
- **EXP-SHOW-003 P1** Missing receipt returns explicit null receipt fields.

### `PATCH|PUT /api/v1/groups/:group_id/expenses/:id`

- **EXP-UPD-001 P0** Group owner, payer, or original creator may edit.
- **EXP-UPD-002 P0** Unrelated member is forbidden.
- **EXP-UPD-003 P0** Archived group rejects update.
- **EXP-UPD-004 P0** Changing payer/split type/participants recalculates splits and balances correctly.
- **EXP-UPD-005 P0** Invalid replacement split rolls back expense attributes and preserves the original splits.
- **EXP-UPD-006 P1** Replacing a receipt updates receipt metadata without orphaning unintended blobs.
- **EXP-UPD-007 P1** Notifications are unique, preference-aware, and use the current expense participants.

### `DELETE /api/v1/groups/:group_id/expenses/:id`

- **EXP-DEL-001 P0** Owner or payer may delete; creator alone cannot delete unless also payer/owner.
- **EXP-DEL-002 P0** Archived group rejects deletion.
- **EXP-DEL-003 P0** Expense, splits, and receipt are removed and balances revert correctly.
- **EXP-DEL-004 P1** Notification recipients are captured before deletion, are unique, exclude actor, and honor preferences.

### `DELETE /api/v1/groups/:group_id/expenses/:id/remove_receipt`

- **EXP-REC-001 P0** Owner, payer, or creator may remove a receipt; unrelated member is forbidden.
- **EXP-REC-002 P1** Existing attachment is purged and response has null receipt fields.
- **EXP-REC-003 P1** Removing when no receipt exists is idempotent.
- **EXP-REC-004 P0** Archived group rejects receipt removal.

## Balances

### `GET /api/v1/groups/:group_id/balances`

- **BAL-001 P0** Returns the exact `Balances::Calculator` result for every financially involved member.
- **BAL-002 P0** Suggested settlements exactly match the group's selected planner mode.
- **BAL-003 P0** Guest settlement suggestions are precisely the subset whose sender is a guest.
- **BAL-004 P0** Direct and simplified modes keep identical net balances while allowing different routes.
- **BAL-005 P0** Fully settled group returns no suggestions.
- **BAL-006 P1** User payload includes correct guest flag/UPI data without exposing bank-account details.
- **BAL-007 P0** Non-member cannot inspect group balances.
- **BAL-008 P0** The real-life trip regression matches this endpoint in both modes.

## Settlements

### `GET /api/v1/groups/:group_id/settlements`

- **SET-IDX-001 P0** Returns only the group's settlements with sender/recipient data.
- **SET-IDX-002 P1** Sorts by settlement date descending and creation time descending for equal dates.
- **SET-IDX-003 P1** Archived group settlement history remains readable.

### `POST /api/v1/groups/:group_id/settlements`

- **SET-CREATE-001 P0** Current user is sender when `from_user_id` is omitted.
- **SET-CREATE-002 P0** Recipient is required, must be a group member, and cannot equal sender.
- **SET-CREATE-003 P0** Amount must be numeric, greater than zero, and rounded/validated at two decimals.
- **SET-CREATE-004 P0** Amount may equal or be less than the exact current planner suggestion.
- **SET-CREATE-005 P0** Amount above the matching planner suggestion is rejected without persistence.
- **SET-CREATE-006 P0** Recipient with no current suggested route from the sender is rejected.
- **SET-CREATE-007 P0** Owner/admin may act for a guest; ordinary member may not.
- **SET-CREATE-008 P0** Proxy sender must be an in-group guest; admin cannot proxy a registered user.
- **SET-CREATE-009 P1** Date defaults to current date and optional note persists.
- **SET-CREATE-010 P0** Archived group rejects settlement.
- **SET-CREATE-011 P1** Registered sender creates one preference-aware notification for recipient; guest proxy settlement does not send a misleading guest-authored notification.
- **SET-CREATE-012 P0** First settlement locks the group's settlement method.
- **SET-CREATE-013 P0** Two identical simultaneous settlement requests cannot both validate and overpay the recipient; one succeeds and the other receives a controlled conflict/validation response.
- **SET-CREATE-014 P0** Two different simultaneous payments derived from the same plan are serialized/revalidated so total payments never exceed any creditor's entitlement.
- **SET-CREATE-015 P0** Direct-mode simultaneous settlements affect only the relevant pairs and cannot overpay a pair.

### `GET /api/v1/groups/:group_id/settlements/:id`

- **SET-SHOW-001 P0** Member can retrieve an in-group settlement with sender/recipient payload.
- **SET-SHOW-002 P0** Cross-group settlement ID returns `404`.

### `DELETE /api/v1/groups/:group_id/settlements/:id`

- **SET-DEL-001 P0** Sender or group admin may delete; unrelated ordinary member may not.
- **SET-DEL-002 P0** Guest-origin settlement can be deleted by an admin.
- **SET-DEL-003 P0** Archived group rejects deletion.
- **SET-DEL-004 P0** Deleting restores balances and suggestions correctly but does not unlock settlement mode while other/historical settlements exist.
- **SET-DEL-005 P1** Sender/recipient deletion notifications are unique, exclude actor, and honor preferences.

## Members

### `GET /api/v1/groups/:group_id/members/suggestions`

- **MEM-SUG-001 P0** Only group owner can request suggestions.
- **MEM-SUG-002 P1** Suggestions come from users sharing another group with the owner.
- **MEM-SUG-003 P1** Current user and existing group members are excluded.
- **MEM-SUG-004 P1** Query matches name/email case-insensitively and safely escapes SQL wildcard characters.
- **MEM-SUG-005 P2** Default limit is 10, positive requested limit applies, and maximum is 20.
- **MEM-SUG-006 P1** Results are distinct and ordered by name/email.
- **MEM-SUG-007 P0** Archived group rejects suggestions.

### `POST /api/v1/groups/:group_id/members`

- **MEM-CREATE-001 P0** Only owner can add members; admin who is not owner is currently forbidden.
- **MEM-CREATE-002 P1** Existing registered user is found using normalized email and added with member role.
- **MEM-CREATE-003 P0** Unknown email plus display name creates one guest and membership.
- **MEM-CREATE-004 P1** Unknown email without display name is rejected.
- **MEM-CREATE-005 P1** Invalid/blank email is rejected without creating an orphan guest.
- **MEM-CREATE-006 P1** Existing membership returns `409` and no duplicate row.
- **MEM-CREATE-007 P1** Registered member receives one notification; guest does not.
- **MEM-CREATE-008 P0** Archived group rejects member creation.
- **MEM-CREATE-009 P0** Concurrent attempts for the same new email create at most one user and one membership, with a controlled response for the loser.

### `DELETE /api/v1/groups/:group_id/members/:id`

- **MEM-DEL-001 P0** Only owner can remove a member.
- **MEM-DEL-002 P0** Owner cannot remove themselves.
- **MEM-DEL-003 P0** Member cannot be removed if they paid, created, participated in an expense, or sent/received a settlement.
- **MEM-DEL-004 P1** Member with no financial history is removed without deleting their user account.
- **MEM-DEL-005 P1** Unknown member returns `404`.
- **MEM-DEL-006 P0** Archived group rejects removal.

## Group invites

### `GET /api/v1/groups/:group_id/invites`

- **INV-IDX-001 P0** Only a group admin can list invite links.
- **INV-IDX-002 P1** Returns active invites newest first.
- **INV-IDX-003 P1** Returns only the latest non-revoked expired invite separately.
- **INV-IDX-004 P1** Payload status, creator, group summary, expiration, and generated URL are correct.

### `POST /api/v1/groups/:group_id/invites`

- **INV-CREATE-001 P0** Only admin can create; archived group rejects creation.
- **INV-CREATE-002 P1** Default expiry is 48 hours.
- **INV-CREATE-003 P1** Expiry accepts 1–168 hours and rejects values outside the range.
- **INV-CREATE-004 P1** `no_expiry` creates a nil expiration.
- **INV-CREATE-005 P0** Creating a link revokes all previous active links for the group.
- **INV-CREATE-006 P0** Concurrent creation leaves exactly one active invite.
- **INV-CREATE-007 P1** URL base prefers `FRONTEND_APP_URL`, then request Origin, then request base URL, without duplicate slashes.

### `DELETE /api/v1/groups/:group_id/invites/:id`

- **INV-DEL-001 P0** Only admin can revoke an in-group invite.
- **INV-DEL-002 P1** Active invite becomes revoked and repeated revoke is idempotent.
- **INV-DEL-003 P0** Archived group rejects manual invite mutation; archive itself already revoked active links.

### `GET /api/v1/invites/:token` — public

- **INV-SHOW-001 P0** Valid active token returns public invite/group summary without authentication.
- **INV-SHOW-002 P0** Unknown token returns `404`.
- **INV-SHOW-003 P0** Revoked, expired, or archived-group token returns `410` with the correct error.
- **INV-SHOW-004 P0** Public response does not expose member emails, private payment data, or unrelated group data.

### `POST /api/v1/invites/:token/accept`

- **INV-ACCEPT-001 P0** Authentication is required.
- **INV-ACCEPT-002 P0** Valid token creates one member-role membership and returns `201`.
- **INV-ACCEPT-003 P1** Existing member receives `200` and no duplicate membership.
- **INV-ACCEPT-004 P0** Unknown, revoked, expired, and archived-group tokens are rejected consistently with show.
- **INV-ACCEPT-005 P0** Two simultaneous accepts create exactly one membership and both requests receive controlled responses.

## Notifications

### `GET /api/v1/notifications`

- **NOTIF-IDX-001 P0** Returns only current user's notifications newest first.
- **NOTIF-IDX-002 P1** Default limit is 20, positive limit applies, maximum is 50, and invalid/non-positive limit falls back to 20.
- **NOTIF-IDX-003 P1** `unread_count` counts all unread notifications, not only the returned page.
- **NOTIF-IDX-004 P1** Payload handles deleted/null actor or group safely.
- **NOTIF-IDX-005 P0** Another user's notifications cannot be read.

### `PATCH /api/v1/notifications/:id/read`

- **NOTIF-READ-001 P0** Owner marks unread notification with current timestamp.
- **NOTIF-READ-002 P1** Reading an already-read notification is idempotent and preserves the original read time.
- **NOTIF-READ-003 P0** Another user's notification returns `404`.

### `PATCH /api/v1/notifications/mark_all_read`

- **NOTIF-ALL-001 P0** Marks every current-user unread notification and returns zero unread count.
- **NOTIF-ALL-002 P0** Does not change another user's notifications.
- **NOTIF-ALL-003 P1** No-unread case is idempotent.

## Push subscriptions

### `POST /api/v1/push_subscription`

- **PUSH-CREATE-001 P1** Valid endpoint/keys create a subscription for current user and capture user agent/last-used time.
- **PUSH-CREATE-002 P1** Re-registering the same endpoint updates keys and timestamp instead of duplicating it.
- **PUSH-CREATE-003 P0** Confirm the intended ownership rule when the same endpoint is submitted by another user; test either safe transfer or rejection explicitly.
- **PUSH-CREATE-004 P1** Missing endpoint or keys returns `422`.

### `DELETE /api/v1/push_subscription`

- **PUSH-DEL-001 P1** Deletes current user's matching endpoint supplied at top level.
- **PUSH-DEL-002 P1** Deletes endpoint supplied under `push_subscription`.
- **PUSH-DEL-003 P0** Cannot delete another user's subscription.
- **PUSH-DEL-004 P1** Missing/unknown endpoint is an idempotent success.

---

# Notification and push service unit tests

## `Notifications::Creator`

- Removes duplicate recipients and excludes the actor.
- Honors every event-specific notification preference.
- Unknown event type defaults to enabled.
- Creates the correct actor/group/notifiable/event/title/body/URL fields.
- A failure for one recipient is logged and does not stop other recipients or the source API mutation.
- Push failure is logged and does not roll back the stored notification or source mutation.

## `PushNotifications::Sender`

- Does nothing when VAPID configuration is incomplete.
- Sends the expected JSON payload to every subscription when configured.
- Successful delivery updates `last_used_at`.
- Expired/invalid subscription is deleted.
- Other Web Push/OpenSSL errors are logged without failing the API request or deleting a valid subscription.

---

# Migration regression tests

- **MIG-001 P0** Existing group with any settlement is set to simplified mode, whether or not it contains a guest.
- **MIG-002 P0** Existing guest group without settlements remains in direct mode.
- **MIG-003 P0** Existing registered-only group preserves simplified legacy behavior.
- **MIG-004 P0** Newly created group defaults to direct mode.
- **MIG-005 P0** Re-running the corrective data update is idempotent.

# Concurrency and idempotency suite

These require separate database connections and real threads/processes; transactional test wrappers may need to be disabled for these cases.

- **CONC-001 P0** Duplicate group create with one idempotency key creates one group.
- **CONC-002 P0** Duplicate expense create creates one expense, one split set, and one notification set.
- **CONC-003 P0** Duplicate settlement create cannot overpay.
- **CONC-004 P0** Different simultaneous settlements cannot collectively overpay a creditor or pair.
- **CONC-005 P0** Concurrent invite creation leaves one active invite.
- **CONC-006 P0** Concurrent invite acceptance leaves one membership.
- **CONC-007 P0** Concurrent guest creation for one email leaves one user and one membership.
- **CONC-008 P0** Archive racing with expense, settlement, member, or invite mutation leaves the group in a valid state with no post-archive write.

# Known gaps that the initial suite should expose

These scenarios are intentionally included even if they fail against the current implementation:

1. Expense and settlement index queries currently need an explicit `created_at DESC` tie-breaker.
2. API create endpoints do not yet implement idempotency keys, so frontend button disabling alone cannot prevent duplicate records from retries or parallel requests.
3. Settlement validation and creation are not currently protected by a group-level lock/revalidation transaction, allowing a race between concurrent requests.
4. Split-total tolerance and duplicate split-row behavior need exact contract enforcement at the one-paisa boundary.
5. Expense currency versus group currency needs an explicit business rule before multi-currency data can enter one ledger.
6. Generated Devise password/account routes need an explicit support-or-disable decision.
7. Push subscription ownership for an endpoint already registered to another user needs an explicit security rule.

# Definition of done

A financial change is ready to deploy only when:

- All P0 calculation, planner, balance API, expense API, and settlement API tests pass.
- The real-life trip regression passes in both direct and simplified modes.
- Failed mutations prove transaction rollback.
- Authorization and cross-group isolation tests pass.
- Relevant concurrency tests pass for code that can create or settle financial records.
- No test depends on network access, wall-clock timing, or unordered database results.
- The complete test suite runs in CI against PostgreSQL on every pull request.

---

# Additional user-perspective scenarios

These scenarios were identified by reviewing the actual controller implementations and are not covered by the original contract above. They represent real user mistakes or edge cases a user would encounter in practice.

## Group lifecycle

- **ARCH-INVITE P0** Archiving a group with an active invite link must atomically revoke that invite. The `with_lock` + `update_all` path in `GroupsController#archive` must be tested end-to-end. *(Covered in `group_flows_test.rb` — `settled group archives and active invite links are atomically revoked`)*

- **DEL-SETTLED P0** The group owner can permanently delete a group that has historical settlements provided all net balances are zero. This exercises the cascade deletion of memberships, expenses, splits, and settlements. *(Covered in `group_flows_test.rb` — `owner can delete a fully-settled group and all dependents are removed`)*

- **IDX-AMOUNTS P0** `GET /api/v1/groups` must populate `current_user_owes` and `current_user_is_owed` from the planner output, not from raw balance arithmetic. *(Covered in `group_flows_test.rb` — `groups index reflects the correct amounts owed and is owed`)*

## Settlement direction

- **SET-WRONG-DIR P0** A user attempting to record a settlement to a recipient for whom no planner suggestion currently exists (wrong direction or already fully settled) must receive an `unprocessable_entity` response. *(Covered in `settlement_flows_test.rb` — `settling to someone who is not a suggested creditor is rejected` and `guest_settlement_flow_test.rb` — `attempting to record a settlement to someone with no open suggestion is rejected`)*

## Expense permissions

- **EXP-CREATOR-NODEL P0** A user who only created an expense (neither payer nor group owner) must not be able to delete it. The `ensure_can_delete_expense!` guard allows only payer and group owner. *(Covered in `expense_extended_flows_test.rb` — `expense creator alone cannot delete the expense`)*

- **EXP-CREATOR-EDIT P0** The same creator (not payer, not owner) is permitted to **edit** an expense. `ensure_can_edit_expense!` includes creators for updates but not for deletes — this asymmetry must be tested. *(Covered in `expense_extended_flows_test.rb` — `original creator can update an expense even if they are not the payer`)*

## Profile protection

- **PROFILE-EMAIL P0** Submitting `email` in a `PATCH /api/v1/profile` request must be silently ignored. The `profile_params` permit list intentionally excludes `email`. *(Covered in `profile_flows_test.rb` — `submitting email in the profile update payload is silently ignored`)*

## Balances isolation

- **BAL-NONMEMBER P0** A request to `GET /api/v1/groups/:group_id/balances` by a non-member must return `404`. The `set_group` method scopes by `current_user.groups`. *(Covered in `group_flows_test.rb` — `non-member cannot inspect group balances`)*

## Invite link lifecycle

- **INV-REVOKE-ON-NEW P0** Creating a new invite via `POST /api/v1/groups/:id/invites` must revoke all previously active invites for the group. *(Covered in `invite_flows_test.rb` — `creating a new invite revokes all previous active invites`)*

## Notification edge cases

- **NOTIF-PAYER-SPLIT-EXCL P1** A payer deliberately excluded from the expense splits must still receive a notification, because `expense_notification_recipients` unions `paid_by_id` with split participant IDs. *(Covered in `notification_producing_flows_test.rb` — `payer who is excluded from the expense splits still receives a notification`)*

- **NOTIF-SET-PREF P1** A settlement recipient who has disabled `notify_settlement_created` must not receive a notification. *(Covered in `notification_producing_flows_test.rb` — `settlement recipient who disabled the preference does not get a notification`)*

## Push subscription security

- **PUSH-SAME-ENDPOINT P0** When two different users submit the same push endpoint the application must make a deterministic, documented security decision (safe transfer or rejection). The chosen behavior must be explicitly asserted. *(Covered in `push_subscription_flow_test.rb` — `submitting an existing endpoint belonging to another user transfers it to the current user`)*

## Notification limit clamping

- **NOTIF-LIMIT-LOW P1** `limit=0` or a negative limit for `GET /api/v1/notifications` must fall back to the default page size of 20. *(Covered in `notification_flow_test.rb`)*

- **NOTIF-LIMIT-HIGH P1** `limit=100` must be capped at 50. *(Covered in `notification_flow_test.rb`)*
