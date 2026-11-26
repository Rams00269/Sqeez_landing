# Sqeez_landing

Landing page for Squeez: *Where loyalty, access and experiences come together.*

- `index.html` is the whole page (plain HTML, CSS and JS, no build step).
- `assets/img/` holds the Squeez logo (`wordmark-coral.svg`, the original shape recoloured; `wordmark-white.svg` is the untouched original) and just two photographs (`golf.webp`, `dining.webp`). Everything else is animated SVG/CSS: the hero golf scene (the ball is struck when the sample member uses points and drops in as "You're in." lands), the three "Who it's for" scenes, and the closing scene.
- `assets/mascot/` is Squizzle, the lemon guide. A reusable module: see `assets/mascot/README.md`.

## Branches

- `main`: the current design (deep teal, mint, paper and coral; Instrument Serif and Manrope; coral logo).
- `on-brand-navy-gold`: the earlier version built from the live trysqueez.com look (navy, ivory and champagne gold; Newsreader and Hanken Grotesk).

## The floating navbar

The `<ul id="fnList">` in `index.html` is the single source of truth. To add a page, add an `<li>`:

```html
<li><a href="#pricing" data-sec="pricing">Pricing</a></li>   <!-- in-page: data-sec highlights it while that section (id="pricing") is on screen -->
<li><a href="https://example.com/team">Team</a></li>          <!-- external link -->
```

That is all. Items that do not fit the pill move into a "More" menu automatically, the mobile sheet is rebuilt from the same list, and the active-section indicator follows. Tested with 17 items.
Behaviour: it floats off the top edge, compacts after a short scroll, hides when you scroll down, returns when you scroll up (or when the mouse nears the top edge), and shows a thin progress line.

## Palette (change it in `:root` at the top of `index.html`)

`--ink #0B3B36` · `--mint #DCEFE6` · `--paper #F7F4EC` · `--coral #FF6A4D` · `--sun #FFD25E`. The mascot takes its colours from the `.mx { --mx-… }` block at the bottom of the style sheet.
To recolour the logo, change the `fill` on the three paths in `assets/img/wordmark-coral.svg`. The shape is never touched.

## Run it

Open `index.html` in a browser, or serve the folder with any static server.

## Deploy

Static site. On Vercel, import the repository and keep the defaults (no build command, no output directory).

## Content

Copy, links and imagery come from the public site (trysqueez.com). The "sample redemption" card is an illustration and says so on the page.
