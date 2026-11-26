# mysabak shape system

Every corner in the app comes from tokens in `css/base.css` (`:root`, under "Shape language"). To change how round
something is, change the token. Don't change the component.

## What it replaced

- **462 `border-radius` declarations** across 17 stylesheets, using 26 different px values.
- **Three spellings of "pill":** `999px` (57 times), `99px` (6) and `50%` (90; also used for real circles).
- **Two private token sets that didn't agree:** admin's `--r-tag/--r-seg/--r-ctl/--r-card` and the driver dashboard's
  `--dcard-radius`.
- **No true squircles.** Cards, buttons and chips were all circular corners at slightly different sizes. Similar
  elements had different radii from page to page; for example, cards were 16, 18, 20, 22 or 24 px.

## The tokens

**Scale:** `--shape-2xs` 6 · `xs` 8 · `sm` 12 · `md` 16 · `lg` 22 · `xl` 28 · `2xl` 36 · `pill` 9999px · `circle` 50%.

| Role token | Shape | Used for |
|---|---|---|
| `--shape-card` | squircle, lg | cards, panels, feature tiles, Home service cards, promos |
| `--shape-tile` | squircle, md | small tiles, option cards, image, logo and vehicle containers |
| `--shape-icon` | squircle, sm | icon containers, thumbnails |
| `--shape-modal` | squircle, xl | dialogs, floating panels |
| `--shape-sheet` | squircle, xl | bottom sheets (top corners only) |
| `--shape-button` | rounded rectangle, md | buttons and full-width calls to action |
| `--shape-input` | rounded rectangle, md | inputs, search, selects |
| `--shape-row` | rounded rectangle, sm | rows, table containers, toasts |
| `--shape-chip` | pill | chips, filters, statuses, tags, badges, compact actions |
| `--shape-circle` | circle | avatars, map markers, dots, icon-only round buttons |

The admin and driver token sets now point at these, so nothing reads its corner size from anywhere else.

## How the squircle works

- **The curve.** A squircle rule sets `corner-shape: var(--shape-curve)`, where `--shape-curve: squircle`. That gives
  a true superellipse corner (`superellipse(2)`), not just a bigger `border-radius`.
- **The radius.** At the same radius, a squircle looks tighter than a circular corner. Inside
  `@supports (corner-shape: squircle)`, `--squircle: 1.3` scales up the squircle role tokens. A card is therefore 22px
  where `corner-shape` isn't supported and 28.6px squircle where it is.
- **The fallback.** Browsers without `corner-shape` (Safari and Firefox today) ignore it and draw ordinary rounded
  corners from the same tokens. No SVG masks, no JavaScript, no new dependency.
- **One switch for everything.** Set `--shape-curve: round` to turn every squircle back into a circular corner, or
  change a token to make every card tighter or rounder.
- **Overlays follow their card.** Overlays clipped to a card (`.sheen`, `.glitter`) use
  `border-radius: inherit; corner-shape: inherit`.
- **Circles stay circles.** A circle inside a squircle-styled family sets `corner-shape: round` itself. Example:
  `.tab[data-tab="food"] .tab__icon`, the centre food button.

## How the migration was done

`dev/migrate-shapes.py` (one-off) classified each rule by its selector (comments stripped), in this order: circle,
chip, sheet, modal, input, button, icon, row, card. It then swapped each hard-coded radius for the role token, or for
the nearest scale token if the rule had no role. Squircle roles also got `corner-shape`. A second run changes nothing.

After the script, these were tuned by hand:

- **Rounded rectangles:** full-width buttons (`.pick__book`, `.promo__claim`) and the branch `select`.
- **Pills:** the glass and food filter chips, and the tab icons (`.tab__icon`).
- **Squircle tiles:** the admin document photos (`.paper__img`), the merchant "Accepting orders" banner and the cart
  empty-state icons.
- **Plain bars:** the chart bars (`.schart__bar`) are rounded rectangles.
- **Circle:** the centre food button.

## Intentional exceptions

- **Hairlines (1–3px), about 15:** a token would be too big for them.
- **Landing page illustration maths** (`calc(var(--lw) * …)`): these are drawing, not UI.
- **`0` and one-sided corners** (for example, a header attached to a card).
- **Compact actions stay pills:** `.btn-soft`, `.back`, `.hot-btn`, `.bund__add`, `.medit__change`, `.mshop__edit`,
  `.dsheet__close` and the driver SOS pill.
- **Avatars, markers and dots stay circles.** Rounded-square shop logos and avatars became squircle tiles, since
  they're identity.

## Limitations

- **Safari and Firefox:** they show circular corners until they support `corner-shape`. Layout and sizes are the
  same; only the curve differs.
- **Classification was by selector name.** An element whose class name says nothing about it gets the nearest scale
  token, which keeps its old look. Those are worth a look when the component is next touched.
- **`corner-shape` doesn't inherit.** A new circle placed inside a squircle-styled rule needs `corner-shape: round`.

## QA (cache v187)

- **Pages:** 19 pages at phone size (390×844) and desktop (1366×768): customer (Home, Food, Cart, Trips, Wallet,
  Account, Support), driver (Drive, Earnings, Trips, Account, sign-up), admin (Overview, Registrations, Management,
  Analytics) and merchant (Home, Manage, Analytics).
- **Result:** no layout breaks; squircles render on cards, tiles, sheets and logos.
- **Circle check:** a scan for any circle, or any shape whose radius is at least half its height, that also had a
  squircle curve found none on the customer, admin and merchant pages.
- **Tests:** `node --test tests/*.test.mjs` passes 79 of 79.
