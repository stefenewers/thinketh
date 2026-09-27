# Thinketh brand

The approved identity has three parts:
- **Wordmark:** a bold, rounded, lowercase `thinketh`.
- **Compact mark:** a lowercase `th`, two distinct letters.
- **App icon:** the white `th` on terracotta.

## Source and construction

The artwork is vector outlines traced from the approved reference board (`logodocs.png`, not committed). Each mark was cropped from the board, upscaled 4×, and thresholded to pure black and white, which removes the raster texture and background. It was then traced into Bézier outlines with potrace.
- The wordmark comes from the large wordmark on the board.
- The compact mark comes from the standalone `th`.

No bitmap is embedded in any SVG. The traced outlines follow the reference's letterforms, spacing and rounded corners. They are only as precise as the board itself, so for print-scale use, replace them with the original design files when those exist.

## Assets

| Asset | File |
|---|---|
| Wordmark, dark (charcoal `#161616`) | `apps/mobile/assets/brand/wordmark-dark.svg` |
| Wordmark, light (white) | `apps/mobile/assets/brand/wordmark-light.svg` |
| Compact mark, dark | `apps/mobile/assets/brand/mark-dark.svg` |
| Compact mark, light | `apps/mobile/assets/brand/mark-light.svg` |
| Launcher icon: 1024, full-bleed coral, white mark at 60% width | `apps/mobile/assets/icon.png` |
| Android adaptive: coral background layer | `apps/mobile/assets/android-icon-background.png`, with `backgroundColor #D35935` in `app.json` |
| Android adaptive: white mark at 42% width, inside the safe zone | `apps/mobile/assets/android-icon-foreground.png` |
| Android monochrome: same silhouette | `apps/mobile/assets/android-icon-monochrome.png` |
| Splash: coral tile with white mark, shown at 120 pt on ivory `#F9F7F4` | `apps/mobile/assets/splash-icon.png` |
| Web favicon: 48 px coral tile | `apps/mobile/assets/favicon.png` |

The launcher icon is full-bleed with no rounded corners or margins baked in, so iOS and Android apply their own masks.

## In the app

Always render the identity through `src/components/Logo.tsx`. It draws the same outlines (from `src/components/brand/paths.ts`) with react-native-svg.

- `<Wordmark height={22} />` is for places where the full name helps recognition: the Today header and the onboarding intro.
- `<Mark size={20} />` is the compact `th` for constrained places: onboarding steps, the voice screen, and small system badges.
  - Pass `decorative` when a visible "Thinketh" label sits beside it, so screen readers don't hear the name twice.
- Both take `tone="dark"` (the default) or `tone="light"` for dark or coral grounds, and both keep their aspect ratio from the `viewBox`.

Don't put the logo on every screen, and don't redraw it in text. The lettering is artwork, not a UI font; body typography stays Inter.

## Colour and spacing

- **Brand coral `#D35935`** (`brand.coral` in `src/theme/tokens.ts`) is for artwork and filled surfaces: the icon, splash, favicon and tiles.
- **Accessible text shade `#C0553A`** (`color.coral`) is for coral text and signals on light grounds, because `#D35935` on white is below AA for small text.
- **Ink `#161616`** is for the marks on ivory or white. White is for marks on coral or charcoal.
- **Tab bar:** the selected tab is burnt orange `#C65D2E` (`color.navActive`), icon and label, with no pill. The other tabs are `#5F5F5B` (`color.navInactive`). These two are only for the bottom navigation; use `color.coral` everywhere else.
- **Clear space:** keep at least the height of the `t`'s crossbar around the mark on every side.
- **Minimum sizes:** the compact mark reads down to 12 px; use the wordmark at 18 px high or more.

## Books are not the logo

The book motif (`src/components/mind/world/Book.tsx`) is how Thinketh draws a concept in your Mind. It's functional and separate from the identity. Don't combine the two.

## Regenerating

Brand exports are generated from the traced outlines by a script (kept outside the repo during this pass). If the outlines change:
- regenerate the SVGs, `paths.ts` and every PNG together
- rebuild the native app to see icon and splash changes
