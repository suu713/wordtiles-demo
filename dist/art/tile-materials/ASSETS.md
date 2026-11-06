# Supplied special tile materials

All 24 PNGs from the user's `块/特殊材质/` folder are copied unchanged. Each is 154×156 RGBA. `manifest.json` records the original relative path, dimensions, byte size and SHA-256.

| Source number | Folder | Label |
| --- | --- | --- |
| 1 | stone | 石纹 |
| 2 | sand | 沙土 |
| 3 | ice | 冰晶 |
| 4 | biscuit | 饼干 |
| 5 | jelly | 果冻 |
| 6 | wood | 木纹 |

Within each folder, `normal.png` is the supplied `{n}.png`, `highlight.png` is `{n}-1.png`, `pressed.png` comes from `按压/{n}.png`, and `pressed-short.png` comes from `按压缩短/{n}.png`.

Settings provide direct material selection, a one-click cycle through the original and six supplied materials, and both press variants. Idle board and target faces use the supplied pale `highlight.png`. Every selected cell in the live path uses the chosen dark `pressed.png` or `pressed-short.png`, including keyboard selection; backtracking and release restore the pale face. This is driven by the game's `.selected` state rather than the pointer's `:active` origin. Collected target slots use the dark uncompressed `normal.png`. The settings samples show idle, held and collected states. Live letters, counts, cell geometry, word paths, consumption and collection animations remain owned by the existing game. Preferences use `wordtiles.tile-material.v1`, synchronize across local tabs and are included in clear-all-data. No bitmap edits or new material generation are involved.

`board-shatter.js` crops pure bitmap fragments without ever reading or copying live letters or counts. There are no separate sparkle/dust sprites: every particle is a piece of the current tile face. Stone uses coarse angular fragments with heavier gravity, sand uses many small grains with strong drag, ice uses sharp slivers with faster spin, biscuit uses small crumbs, jelly uses rounded pieces with damped squash/stretch, and wood uses long grain-aligned splinters. Texture coordinates remain aligned to the original tile while each fragment moves independently. The supplied `按住效果预览.html` was played locally to inspect multi-cell hold/backtrack and material-specific breakup; its embedded assets and scripts are not copied into the application. Verify with `node --test tests/board-shatter.test.mjs`, `node scripts/check-tile-materials-browser.mjs` and `node scripts/check-material-shatter-browser.mjs`.

The supplied `2248选中.mp4` is a motion reference for the thin white rounded outline. Every selected board tile, including the original style, receives a 120 ms fade/settle on its CSS pseudo-element. The outline remains while that cell belongs to the live path, and disappears on backtracking, release or cancellation. Its insets follow the opaque face boundary of each PNG and the chosen press variant, with matched elliptical corner radii so the white stroke touches the material rather than surrounding its transparent padding. It never changes layout or pointer targets. Reduced motion shows it immediately. Video assets are not copied into the game.

## Matching connection strips

`connectors/purple.png` is the user's supplied 26×46 purple connection strip, copied byte-for-byte; its hash is in `connectors/manifest.json`. It is used only with the original purple pressed tile shown in the supplied HEN reference. The six special materials each reuse a center crop of their own active press PNG: stone with stone, sand with sand, ice with ice, biscuit with biscuit, jelly with jelly, and wood with wood. The provided purple strip is not recolored or applied to those materials. Runtime CSS crops the 154×156 special tile to its central 26×46 texture region, preserving the source bitmap.

Manual links are short textured necks, about one fifth of a cell wide. Their center-to-center spans render below all tile faces, so only the spaces between blocks remain visible and letters/counts stay unobscured. Horizontal, vertical and turning paths follow the existing legal selection rules, resizing with the board and disappearing immediately on backtrack, release or cancellation. Existing white outlines and the separate upper SVG guide layer remain in place.
