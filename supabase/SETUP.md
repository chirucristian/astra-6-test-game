# Astra Bird accounts

Project: `astra-bird` (`lhoqqluuffbxwzorlihw`), organization `cristi`, Frankfurt.

The account UI uses email magic links, public nicknames, account best scores, and weekly/all-time top-20 leaderboards. Guest play and local best scores continue to work without Supabase. Guest scores are deliberately not imported into ranked accounts.

## Required before enabling public sign-in

In Supabase Authentication → URL Configuration, set the Site URL to:

`https://chirucristian.github.io/astra-6-test-game/`

Add the same URL to the Redirect URLs allowlist. Email authentication is enabled; keep email confirmation enabled. The client requests a magic link with this exact redirect URL. Default magic-link templates are sufficient.

Configure a production email provider in Authentication → SMTP. Supabase's default mail service only sends to project team members and is not a public email service. This cannot be configured with the currently exposed Supabase connector tools. SMTP credentials belong in the Supabase dashboard, never in this repository. Alternatively, Google login would require a separate OAuth application and a provider configuration change.

Perform an actual end-to-end login with an authorized tester after email configuration: request a link, open it, choose a nickname, play a new flight, check the leaderboard, then sign in on a second device and verify the account best. No email was sent as part of automated testing.

## Database

`accounts.sql` records the deployed schema. It is a bootstrap reference, not an idempotent migration to re-run on the existing project. Supabase migration history contains `astra_bird_accounts` and `explicit_private_run_deny_policy`.

Only nicknames, user UUIDs, scores, and score dates are publicly readable. Email addresses remain in Auth. Row policies and column grants restrict profile changes to the owner and prevent direct writes to best scores. Run records are in the non-exposed `private` schema with no client table access. Narrow private security-definer routines validate the authenticated caller, run ownership, duration and a conservative score ceiling; public wrappers run as the caller. Score submission retries are idempotent.

Weekly scores use Monday 00:00 UTC. Ties use the timestamp when the score was first reached, followed by nickname. Run records older than eight days are cleaned up on a player's next run; public best scores persist. Deleting an Auth user cascades through their profile and scores.

These are plausibility checks, not authoritative gameplay verification. A modified client can still fabricate a plausible flight. Do not use this leaderboard for prizes without server replay validation or authoritative simulation.

## Client and testing

`vendor/supabase-2.57.4.js` pins the browser SDK; its MIT license is included. The frontend contains only a publishable key. Never put service-role keys or SMTP credentials in client code.

Browser tests: serve this directory, then run `node tests/accounts.cjs` with Playwright available. `ASTRA_TEST_URL` changes the preview URL; `ASTRA_CHROMIUM` optionally sets a Chromium executable. Tests mock all Supabase HTTP calls, including email, and cover guest play, keyboard isolation, sign-in submission, profile restoration and edits, leaderboard retry/XSS handling, score submission, and sign-out.

Database tests were run in a rolled-back transaction with synthetic users: valid and duplicate score submissions, cross-user run/profile access, direct score writes, guest run attempts, and impossible scores. The final Supabase security advisor reported no findings.
