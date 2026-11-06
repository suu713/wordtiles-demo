# Pre-settlement floral banners

The four original user-supplied PNGs from `Word tiles（闫祺）_slices (8)` are copied unchanged. Their dimensions, alpha and hashes are recorded in `manifest.json`.

| File | Artwork | Size |
| --- | --- | --- |
| `5@2x.png` | Book, quill and blue-purple plate | 1072 × 358 |
| `6@2x.png` | Pink blossoms and pink plate | 1172 × 368 |
| `7@2x.png` | Iris, lavender and purple plate | 1062 × 356 |
| `8@2x.png` | Rose, foliage and cream plate | 1048 × 296 |

`dist/floral-banner-art.js` uses complementary SVG masks to separate left ornaments, right ornaments and the plate without rewriting the source PNG pixels. The decoration enters first, briefly grows, settles and sways slightly; the plate and live `Level Complete!` label follow. Text fits a separate safe region for each design.

`dist/completion-banner.js` displays this once after the final target's existing animation finishes and before settlement opens. A shuffled four-design bag uses each design once per cycle and avoids repeats at the cycle boundary. This finish transition lasts 2200 ms. Ordinary encouragement rules and quotas are separate. Partial empty-grid fallback, machine simulation and reduced motion skip the finish banner. Leaving the game, changing levels or hiding the page cancels its timer.
