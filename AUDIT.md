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

---

# Pass 2: light/dark mode, new font, teal + white, front-end audit

## What was added
| Area | Change |
|---|---|
| Light / dark mode | `css/theme.css` holds every colour as a token; `js/theme.js` toggles and saves the choice (`qa-theme`). No saved choice = follows the phone/laptop setting live. A tiny inline script in `index.html` sets the theme before first paint, so dark users never see a white flash. Toggle lives in the dashboard header, admin header, and top-right of the sign-in screen. |
| Font | **Lexend** (one family, weights 400-800). Why: designed around reading-fluency research, wide open letterforms and even spacing lower visual strain for tired or anxious readers, which is exactly a student before a CBT. Heavy weights still hit hard on headlines and buttons. Timer, score and price use tabular numerals so they do not jitter. One font = one request = fast first paint. Cached by the service worker for offline. |
| Palette | Teal + white. Sand is now only the pay/reward accent. Brown removed from text, panels, shadows, manifest and theme-color. ~600 hardcoded colours across 22 stylesheets were moved to tokens. |
| Contrast | Teal fills darkened from #389695 to #27807f so white text passes 4.5:1. Teal used as text is #1d6a69 (light) / #6fd6d3 (dark). Dark-mode hover goes lighter, not darker. |
| Alerts | Every `alert()` (about 40) now shows a non-blocking toast. `confirm()` is untouched because it must return an answer. |

## Bugs and design mishaps fixed
1. Hero headline lines overlapped (line-height 0.95 at weight 900); now 1.08 at 800 with fluid size.
2. `background: white` keyword was invisible to the old token system; 13 panels would have stayed white in dark mode.
3. `100vh` on phones hides content under the browser bar; now `100dvh` with fallback (base, auth, verify gate, dashboard).
4. `overflow-x: hidden` on both html and body breaks `position: sticky`; now `clip`.
5. Inputs under 16px make iOS Safari zoom the page on focus; forced to 16px minimum.
6. Dashboard cards used brown, blue and green accents; now all teal shades.
7. Error and offline pages (boot, main, service worker) still used the old brown; fixed and theme-aware.
8. Confetti colours swapped from brown to teal and white.
9. Service worker now caches Lexend (CSS + font files) so offline keeps the look.

## Attention (5-second rule), applied
Bold headline, one clear primary button per screen, single accent for reward moments, no motion that blocks the first tap, toggle never appears during a quiz.

## Still worth doing
- Landing: put a "Try a free quiz" button above the fold with no sign-up (biggest 5-second win).
- Self-host Lexend (woff2 in /fonts) to remove the Google Fonts dependency.
- Admin title truncates on very narrow phones.
- Admin is still identified by a hardcoded email; move to a custom claim.

## Deploy
`node tools/build-sw.mjs` (already run), then deploy as before. Users get the new look on the second load (service worker update).
