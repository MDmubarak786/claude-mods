---
version: 1
slug: "mods-dino-hooks-register-ts"
primary_target: "mods/dino/hooks/register.ts"
related_targets: ["mods/dino/README.md"]
---

# Surface: the dino pane (`mods/dino/hooks/register.ts`)

Scope: the pane `/dino` opens, drawn from `Box`, `Text` and `Button` cells for the terminal and the Desktop app. Visitor mode: Experience. Audience: developers who judge the mod by its GIF and first screen, then play it for a short break. Must keep: the keys w, p, n, h, Esc; the rules in `game.ts`; the on-screen strings the tests pin (the five-digit score, `HI 00388 · 110 ms`, the paused and game-over lines, `How to play`, the four button keys). Undecided: whether the pane may exceed 30 rows on the Desktop.

## Direction contract

THESIS: The pane is a 1998 single-subject fan page devoted to the dinosaur, and the game is the shrine's centrepiece: a star-tiled ground, a block-letter banner, the lane in a centred double-bordered table, marching `~` dividers between every section, and a hit counter at the bottom that is really your games played. It refuses the category default of a bare lane with a status line above it.

OWN-WORLD: Navy `#000033` ground tiled with `.` `*` `+` stars in fan purple `#8800ff` with `*` in star yellow `#ffea00` (the world's quality-bar board names exactly those two star inks; the earlier `#666699` was a placeholder); the DINO banner in hot pink `#ff66cc` block letters; yellow `#ffff66` for the score label, HI and counter digits, with the live score value in white `#ffffff` so the one number that changes every step is the brightest thing in the header; cyan `#66ffff` for links (the controls) and the table border; the lane on black inside a `double` border; the dinosaur in lime `#00ff99` with a black eye, cacti in orange `#ff9933`, the ground strip `#333366`; dividers alternate pink and cyan `~`. Every cell is a fixed-width Box with a background and an ASCII glyph of at most two characters, no leading spaces. Web-safe hex only. Record: a blinking `*NEW HIGH SCORE*` notice. Visited link: Pause reads Resume while paused.

STORY: The visitor recognises a GeoCities shrine in the first second, smiles, sees the dinosaur waiting in the table, presses w, and plays; the counter at the bottom tells them how many times this page has been "visited" and their best run.

FIRST VIEWPORT: Row 0 a star-tile row; rows 1–5 the DINO banner (17 cells wide, centred); row 6 a tagline; row 7 a marching divider; rows 8–16 the table: a header cell with `SCORE 00016  HI 00388 · 120 ms` and the speed meter, six lane rows (two per model height), one ground row, double border; row 17 the status line as the shrine's update notice; row 18 a divider; row 19 the controls as section links (`w` Jump, `p` Pause); row 20 a divider; rows 21–22 the counter block (`You are visitor No. 000042`, `Best run 00388`); row 23 the footer links (`n` New game, `h` Help, Esc closes). The how-to, when shown, is an FAQ section under one more divider. Pane rows 30. Cells are two columns wide at 62+ body columns and one column below that; the table stays centred. The primary action is the Jump link, lit cyan.

FORM: A devoted single-subject fan page (catalog `digital-design-canon-fansite-shrine-page`), dealt as a challenger and chosen by the user over the assigned direction (candidate 5, Desert Dusk Postcard) and the pick (candidate 1, Notebook Margin Doodle). Seed key 0a188e06. Code-led: no image generation in this harness.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
