---
name: Dino Shrine '98 (the dino pane only, mods/dino/)
description: The visual world of the /dino pane, a 1998 fan page devoted to the dinosaur. Not a system for the other 26 mods.
colors:
  # The INK table in mods/dino/hooks/register.ts. Keys are the build's own names.
  ground: "#000033"
  star: "#8800ff"
  starBright: "#ffea00"
  banner: "#ff66cc"
  bannerDark: "#cc33aa"
  text: "#ffff66"
  link: "#66ffff"
  border: "#66ffff"
  box: "#000066"
  white: "#ffffff"
  muted: "#cc99ff"
  cell: "#000000"
  dino: "#00ff99"
  dead: "#ff3366"
  cactus: "#ff9933"
  dirt: "#333366"
  dirtLit: "#9999cc"
  divA: "#ff66cc"
  divB: "#66ffff"
spacing:
  # Units are character columns, not px. There is no other unit on this surface.
  cell-narrow: "1 column"
  cell-wide: "2 columns"
  gap-tight: "1 column"
  gap-link: "2 columns"
  inset: "1 column"
  digit-box-wide: "3 columns"
components:
  cell-star:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.star}"
    width: "{spacing.cell-wide}"
  cell-star-bright:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.starBright}"
    width: "{spacing.cell-wide}"
  cell-divider-a:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.divA}"
    width: "{spacing.cell-wide}"
  cell-divider-b:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.divB}"
    width: "{spacing.cell-wide}"
  cell-banner:
    backgroundColor: "{colors.banner}"
    textColor: "{colors.ground}"
    width: "{spacing.cell-wide}"
  cell-banner-base:
    backgroundColor: "{colors.bannerDark}"
    textColor: "{colors.ground}"
    width: "{spacing.cell-wide}"
  cell-lane:
    backgroundColor: "{colors.cell}"
    textColor: "{colors.cell}"
    width: "{spacing.cell-wide}"
  cell-dino:
    backgroundColor: "{colors.dino}"
    textColor: "{colors.cell}"
    width: "{spacing.cell-wide}"
  cell-dino-dead:
    backgroundColor: "{colors.dead}"
    textColor: "{colors.cell}"
    width: "{spacing.cell-wide}"
  cell-cactus:
    backgroundColor: "{colors.cactus}"
    textColor: "{colors.cell}"
    width: "{spacing.cell-wide}"
  cell-ground:
    backgroundColor: "{colors.dirt}"
    textColor: "{colors.dirtLit}"
    width: "{spacing.cell-wide}"
  table-header:
    backgroundColor: "{colors.box}"
    textColor: "{colors.text}"
    padding: "0 {spacing.inset}"
  meter-lit:
    backgroundColor: "{colors.link}"
    width: "{spacing.cell-narrow}"
  meter-unlit:
    backgroundColor: "{colors.dirt}"
    width: "{spacing.cell-narrow}"
  counter-digit:
    backgroundColor: "{colors.box}"
    textColor: "{colors.text}"
    width: "{spacing.digit-box-wide}"
  link-primary:
    textColor: "{colors.link}"
  link-secondary:
    textColor: "{colors.link}"
---

# Design System: Dino Shrine '98

This file documents the `dino` pane's world (`mods/dino/hooks/register.ts`) and nothing else. The other games in this repository (snake, bingo, 2048, connect-four, xo, pairs, typing, sudoku) keep their own looks built on theme colour keys; none of them was redesigned, and later work on another mod must not inherit anything here.

## Overview

**Creative North Star: "The Dinosaur's Fan Page"**

The pane is a 1998 single-subject fan page devoted to the dinosaur, and the game is the shrine's centrepiece. The page is a star-tiled navy ground; the name DINO sits at the top in hot-pink block letters; the lane runs inside a centred, double-bordered table; marching `~` dividers separate every section; and the bottom carries a hit counter that is really your games played. It refuses the category default of a bare lane with a status line above it.

This is not a web page. The surface is a Claude Code pane drawn from `Box`, `Text` and `Button` primitives, rendered by a terminal and by the Desktop app from the same tree. Every "pixel" is a fixed-width `Box` with a `backgroundColor` and at most two ASCII characters. There are no fonts, px sizes, shadows or breakpoints; the tokens are hex inks, cell widths in character columns, ASCII glyphs and `borderStyle` names.

**Key Characteristics:**
- Navy star-tiled ground behind everything; the page never shows bare terminal background.
- A palette of saturated inks on dark ground: pink banner, yellow labels, cyan links, lime dinosaur, orange cacti.
- Every element is a row of fixed-width cells; alignment comes from cell widths and colour, never from padded text.
- The page moves on the game clock: dividers march, stars drift, the record notice blinks, the legs alternate.
- Each state (fresh, running, paused, over, record) reads from colour alone, without reading a sentence.

## Colors

The inks are the saturated, mostly web-safe ones a 1998 shrine page used, laid on a navy ground.

### Primary
- **Hot Pink** (`banner`, `divA`): the DINO block letters, the `*NEW HIGH SCORE*` notice, the "How to play" heading, and every other cell of a divider.
- **Pink Shadow** (`bannerDark`): the bottom row of the banner only, so the letters sit on a base.
- **Shrine Cyan** (`link`, `border`, `divB`): the controls as section links, the table's double border, the lit segments of the speed meter, the alternate divider cells, and the status line when it is an invitation ("Press w to jump", "Jump the cacti").

### Secondary
- **Visitor Yellow** (`text`): the SCORE label, the HI readout, the counter digits, the tagline, and the status line when it is a warning or a pause ("A tall cactus ahead", "Paused").
- **Pure White** (`white`): the live score value (the one number that changes every step is the brightest thing in the header) and the counter's prose. The ink the player's eye lands on.

### Tertiary
- **Dino Lime** (`dino`): the dinosaur's two cells and its tail, as a background with a black glyph on it.
- **Crash Red** (`dead`): the dinosaur and the table border when the run is over, and the game-over status line in bold.
- **Cactus Orange** (`cactus`): every cactus cell.

### Neutral
- **Shrine Navy** (`ground`): the page background and the background of every star, divider and banner cell.
- **Table Navy** (`box`): the header cell and the counter's digit boxes, one step lighter than the page.
- **Lane Black** (`cell`): the lane the game runs on, and the glyph colour on dinosaur and cactus cells.
- **Dirt** (`dirt`): the ground strip under the lane and the unlit segments of the speed meter.
- **Dirt Lit** (`dirtLit`): the `-` and `.` grain on the ground, and the landing dust.
- **Fan Purple** (`star`): the `.` and `+` stars on the ground tile and the far stars along the top row of the lane.
- **Star Yellow** (`starBright`): the `*` stars only.
- **Lilac** (`muted`): secondary prose, "steps", "Esc closes and pauses", and the help's last line.

### Named Rules
**The Lit Number Rule.** In the header the label is yellow and the live score is white: the value that changes every step is always the brightest ink in its row.

**The Crash Ink Rule.** Game over is told by colour before text: the dinosaur's background and the table border both switch from their rest inks to `dead`. No other state recolours the border.

**The Register Rule.** The palette reads as the 216-colour web-safe register; three inks sit just outside it where the register had no close value (`star`, `starBright`, `bannerDark`). A new ink should read as web-safe to the eye.

## Typography

Not applicable: character-cell pane. The face is whatever the terminal or the Desktop app renders; the only type properties the build sets are `bold` and `dimColor` on `Text`.

- **Bold** marks the SCORE label, the score value, the counter digits, the `*NEW HIGH SCORE*` notice, the "How to play" heading, the game-over line, and the glyphs on the dinosaur's cells.
- **Dim** (`dimColor`) marks the secondary links: Pause/Resume, New game, Help. Jump is never dim.
- Glyphs are ASCII and at most two characters per cell: `.` `*` `+` for stars, `~` or `~-` for dividers, `-` `.` for ground grain, `o>` `|\` `/\` `\/` `<=` for the dinosaur, `/\` `||` for cacti, `.:` for dust. Below 62 body columns each pair collapses to its first character (`o`, `|`, `^`, `v`, `<`, `~`, `.`).

### Named Rules
**The Two-Glyph Rule.** A cell carries at most `cw` ASCII characters and never a leading space. Alignment comes from the Box width and its background, because the Desktop collapses whitespace and widens non-ASCII glyphs.

## Layout

The page is a single centred column on a navy ground. Every pictorial row is `COLS` (30) cells wide; a cell is 2 columns wide when the pane's `bodyColumns` is 62 or more and 1 column below that, so the picture is 60 or 30 columns across and stays centred either way. The pane asks for 32 rows.

The composition, top to bottom: a star row; the DINO banner (5 rows, 17 cells, centred); the tagline `*~* the dinosaur runner shrine *~*`; a divider; the table (header, six lane rows, two per model height, one ground row, inside a double border); the update notice (status line, and the record notice when earned); a divider; the controls as section links (`[ w: Jump ] [ p: Pause ]`); a divider; the hit counter (`You are visitor No. 000001`, `Best run 00059 steps`); a star row; the footer links (`[ n: New game ] [ h: Help ] Esc closes and pauses`); and a closing star row. When help is shown it is an FAQ section ("How to play", three numbered lines and a lilac note) under one more divider, before the closing star row. Help shows itself on a fresh game when the pane is at least 50 columns wide, until the first jump or until `h` sets it either way.

Spacing is in columns: links sit 2 apart, header fields 2 apart, the counter's label and digits 1 apart, the header and help are inset 1 column; the wide counter digits are 3-column boxes with no gap, the narrow ones 1-column boxes 1 apart. The notice is as wide as the table (`COLS * cw + 2`) and wraps inside it.

## Elevation & Depth

No shadows; the surface has none. Depth is three navies stacked by role: the page (`ground`), the header and counter boxes (`box`) one step lighter, and the lane (`cell`) fully black inside the table's double border. The ground strip (`dirt`) and the lit grain on it give the lane a floor. Nothing floats; the table is set into the page by its border, not lifted off it.

## Shapes

Not applicable beyond the terminal's own glyphs: there is no radius. The one border is the table's `borderStyle: 'double'`, cyan at rest and red when the run is over. Letters, stars, dinosaur and cacti are all rectangles of coloured cells; the banner is a 17-by-5 bitmap with the bottom row in the darker pink.

## Components

### Cells
The unit of the whole page. A `Box` of width `cw` with `flexShrink: 0`, a `backgroundColor`, and one `Text` child of at most `cw` ASCII characters (a single space when empty). Rows are `Box`es with `flexDirection: 'row'` and the row's own background, so a cell with no glyph still paints.

### Star row
30 cells on `ground` sampled from the 14-step tile `. _ _ * _ _ + _ . _ _ _ * _`, `*` in `starBright`, the rest in `star`. The three star rows on the page sample the tile at different phases (`phase`, `phase + 5`, `phase + 3`) so they do not repeat each other.

### Divider
30 cells of `~` (or `~-` wide) on `ground`, alternating `divA` and `divB` by column plus phase. The three dividers on the page use phases `score`, `score + 1`, `score` so neighbours are out of step.

### Banner
The five `BANNER` rows drawn as cells: an `X` is a `banner` cell (the bottom row `bannerDark`), a `.` is a `ground` cell. Centred with `alignItems: 'center'`.

### Table
`Box` with `borderStyle: 'double'`, `borderColor: border` (or `dead` when over), `backgroundColor: cell`, `alignSelf: 'center'`, holding the header, six lane rows and the ground row.
- **Header:** background `box`, inset 1, fields 2 apart, wrapping: `SCORE` (text, bold), the five-digit score (white, bold), `HI 00388 · 120 ms` (text), and the speed meter.
- **Meter:** ten 1-column boxes, lit in `link` up to the tenth of the current 100-point ramp, unlit in `dirt`; all ten lit at the 60 ms floor.
- **Lane:** six rows on `cell`. The dinosaur occupies column 4 at its height as two stacked cells (`o>` over the legs) with its tail `<=` one column behind on the lower row, all on `dino` with `cell` glyphs in bold. Cacti are `cactus` cells, `/\` at their crown and `||` below. The far stars (`.`, `+` only) ride the top row, which only the peak of a jump reaches.
- **Ground:** 30 cells on `dirt` sampled from the 8-step `GROUND_TILE` at the score's phase, grain in `dirtLit`.

### Notice
A centred wrapping row as wide as the table, inset 1: the status line in its state's ink, preceded by `*NEW HIGH SCORE*` in bold `banner` when a record is held.

### Links (Buttons)
`Button` with `plain: true` and a `hotkey`, so the terminal draws `w: Jump` and the Desktop draws the key as a badge. In the terminal each link sits between `[` and `]` in `link`; on the Desktop the brackets become a single `|` separator because the badge already boxes the key. Jump is the one primary link (full strength); Pause/Resume, New game and Help are `dimColor`. Pause reads Resume while paused: the visited link.

### Hit counter
Two centred rows of white prose and digit boxes: `You are visitor No.` with the games count padded to six digits, and `Best run` with the best score padded to five, then `steps` in lilac. Each digit is its own `box`-coloured cell with a bold yellow glyph.

### FAQ (help)
A column inset 1: `How to play` in bold `banner`, three numbered white lines that wrap, and a lilac note about focus and the `h` key.

### States
- **Fresh:** status `Press w to jump. The first jump starts the run.` in `link`; the dinosaur stands with legs `|\`; the meter is empty; Pause reads Resume. Help is open if the pane is wide enough.
- **Running:** status in `link` (`Jump the cacti. The ground gets faster as you go.`) or in `text` when a tall cactus is next; the legs alternate `|\` and `/\` on odd scores; `\/` through a jump; the ground and dividers advance each step.
- **Paused:** status `Paused. Press p, or w, to go on.` in `text`; Pause reads Resume; the clock stops.
- **Over:** the dinosaur's cells and the table border turn `dead`; the status is the game-over line in bold `dead`.
- **Record:** `*NEW HIGH SCORE*` in bold `banner` before the status, blinking on even scores while the run continues and steady once it is over.

### Motion
All motion is driven by the game clock, one redraw per step (120 ms at start, 10 ms faster every 100 points, floor 60 ms). Per step: the ground grain and dividers advance one cell; the legs alternate on odd scores; the record notice blinks on even scores. Every four steps the star rows and the lane's far stars drift one cell. A landing kicks up `.:` in `dirtLit` behind the dinosaur for one drawing. Nothing animates while paused or over.

## Do's and Don'ts

### Do:
- **Do** draw every picture element as a fixed-width `Box` with a background and at most `cw` ASCII characters, so the terminal and the Desktop draw the same cells.
- **Do** keep the page 30 cells wide and size cells by `bodyColumns >= 62`, so the banner and table stay centred in both widths.
- **Do** tell state by ink first: cyan for an invitation, yellow for a warning or pause, red for a crash, pink for a record.
- **Do** put the brackets around links only in the terminal; on the Desktop the hotkey badge is the chrome and a `|` separates the links.
- **Do** move only on the clock: dividers, ground, stars, legs and the blink all follow the score, never a timer of their own.

### Don't:
- **Don't** align with padded text or leading spaces; the Desktop collapses whitespace.
- **Don't** use non-ASCII or symbol glyphs in cells; the Desktop draws them in a wider face and the picture breaks.
- **Don't** add an ink that does not read as web-safe; the three off-register inks are the world's own and not a licence for more.
- **Don't** recolour the table border for any state other than game over.
- **Don't** carry any of this into another mod; the other games use theme colour keys and their own grammar.
