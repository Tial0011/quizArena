# Quiz Arena: psychology audit + what changed

Rule used: a new visitor should get value or a clear next tap within ~5 seconds.

## Fixed in this pass
| Problem | Why it hurts | Fix |
|---|---|---|
| Welcome screen took ~7s of typing and waiting before the first button | Past the 5s window; many leave | Copy cut roughly in half, typing ~2x faster, auto-advance 0.7s, tap-anywhere still skips |
| "It's on your phone" could appear on a tap or a fake timer | Broken trust on first contact | "Installed" now shows only after the browser's `appinstalled` event OR the OS reports the app installed (polled). Otherwise "We can't confirm it yet" |
| Progress bar implied it would reach 100% on its own | Same trust problem | Capped at 90%, only completes on real confirmation |
| Marketplace: one quiz per payment, dialog per quiz | 3 quizzes = 3 dialogs + 3 payments; friction kills the sale | Tap cards to add, one sticky bar, one payment |
| "Open Quiz" in the marketplace pointed at a function that doesn't exist | Buyers hit a dead button | Now opens the quiz directly |
| Purple palette, no link to the logo | Brand mismatch | Teal / brown / sand from the logo (see below) |

## Colour psychology (from the logo)
- **#389695 teal**: calm focus, trust. Used for primary actions, selection, progress.
- **#2D190B deep brown**: grounded, serious. Used for text, the cart bar, the app frame.
- **#EEBF92 sand**: warmth, reward. Used only for the pay button and celebration moments so it keeps its pull.
- Contrast note: white on #389695 is about 3.5:1. Fine for bold buttons, marginal for small text. Buttons use bold 14px+. For small teal text on white, prefer `#2b7a79`.

## Marketplace stimulation (honest version)
No fake urgency, fake counters or hidden fees. Total is always the plain sum of prices. What is used:
1. One-tap add, instant card response, phone buzz, animated total (fast feedback loop).
2. Pack rank meter: Warm-up (1), Scholar (3), Topper (5), Legend (8), with "add 2 more to reach..." (goal-gradient effect).
3. Confetti on rank-up and on payment.
4. After payment the main button is "Start <quiz> now", so the reward moment leads straight into studying.
5. "Select all" per subject, and the cart survives a refresh.
All motion respects `prefers-reduced-motion`.

## Still worth doing (not changed)
1. **Landing hero**: headline is fine, but the sign-up form sits below a paragraph and stats. Put one "Try a free quiz" button above the fold that needs no account.
2. **Sign-up friction**: offer Google first; ask name only after the first quiz.
3. **Dashboard**: show one "Continue where you left off" card at the top, everything else below it.
4. **Quiz screen**: show a streak or "3 in a row" indicator; small wins keep attention.
5. **Session timeout uses `alert()`**: replace with a friendly in-app message.
6. **Bundle discounts** (e.g. 3+ quizzes) would boost the cart, but that is a pricing decision, so it is not included.
7. Admin is a hardcoded email (`admin@test.com`). Move to a custom claim before launch.

## Deploy checklist
1. `node tools/build-sw.mjs` (already run once here)
2. `firebase deploy --only functions` (multi-quiz verification lives there; deploy it BEFORE the frontend)
3. Deploy the frontend
4. Google Search: favicon updates are slow (days to weeks). Speed it up with Search Console > URL Inspection > Request indexing for `https://quizarena.name.ng/` and `/favicon.ico`.
