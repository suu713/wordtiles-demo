# Encouragement ribbons and gestures

The active player uses the supplied `Word tiles（闫祺）_slices (4)` assets, copied unchanged into `yanqi/`:

| File | Use | Size |
| --- | --- | --- |
| `caidai-1@2x.png` | Blue ribbon | 734×224 |
| `caidai-12@2x.png` | Gold ribbon | 728×220 |
| `caidai-13@2x.png` | Purple ribbon: advanced combo / almost finished | 740×224 |
| `caidai-14@2x.png` | Red ribbon | 736×224 |
| `dianzan@2x.png` | Bonus-discovery thumbs-up | 264×212 |
| `guzhang@2x.png` | Recovery applause | 240×224 |

Each PNG retains its original dimensions, pixels, and alpha. Ribbon text is a runtime overlay fitted to the central front face, rather than the center of the full image including its tails. Gesture icons contain no added text and only appear alongside an eligible ribbon. The ribbon center remains at 49.5% of player height, and the supplied frames retain their natural proportions. Scene pools, shared cooldowns and quotas are declared in `dist/core/encouragement-config.js`. All-target completion now uses the separate pre-settlement banner from `dist/art/floral-banners/`; the older red ribbon remains available as an asset without an ordinary encouragement trigger.

The older resources below are retained as source history and are no longer used by the active player.

`great-streak.png` is the original green P1 GREAT ribbon supplied by the user, extracted from its cream background with built-in imagegen.

`great-complete.png` is the original red P2 GREAT ribbon supplied by the user, extracted in the same way.

Both files are transparent 2172×724 PNGs. Their original edit prompts and source filenames are in `generation.json`. `rare-word.svg` is the earlier code-native Rare Word frame, also retained without runtime usage.
