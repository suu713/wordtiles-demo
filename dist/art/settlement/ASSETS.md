# Settlement art

The active top symbol is `golden-book/book@2x.png`, copied unchanged from supplied slices (9), `tu@2x.png`, on 2026-11-04. Its original 1454×596 RGBA dimensions and SHA-256 are recorded in `golden-book/manifest.json`. Only the top symbol is replaced; the supplied white panel and divider are outside this change's scope. A central light appears first, then the complete original unfolds outward from the book spine, keeping its baked-in glow continuous. The unfold lasts 900 ms with a gentler ease; a subtle overshoot settles at 1030 ms, and one soft glint finishes at 1230 ms. There is no final image swap or perpetual movement. Reduced motion shows the complete symbol immediately. The ABC artwork below is retained as historical source material and is no longer loaded at runtime.

`reference.png` is the user-supplied settlement reference, unchanged.

`abc-wreath.png` is the previous user-supplied transparent ABC wreath, copied unchanged on 2026-10-30. It replaced the WORD tiles and LOGIC PUZZLE caption before the golden-book update.

`abc-wreath-back.png` and `abc-tiles-front.png` are transparent 1254×1254 layers extracted with the built-in imagegen tool on 2026-10-30. The wreath appears first and the ABC tiles begin fading in 320 ms later. The unchanged `abc-wreath.png` fades over them at 1320 ms and the extracted layers retire at 1580 ms, preserving the exact original resting artwork. Only this layered reveal is used; there is no separate wreath wobble. Full prompts are in `icon-generation.json`.

`foreground.png` is a transparent extraction made with the built-in imagegen tool on 2026-10-30. Only its title and slogan regions are used. The progress panel and top-right coin still come directly from `reference.png`, and `abc-wreath.png` remains unchanged. The complete prompt set is recorded in `foreground-generation.json`. This separation allows background changes without returning to the old full-screen reference or changing controls/game behavior.

`background-entry.png` is the historical clean backdrop made with the built-in imagegen edit tool from `reference.png` on 2026-10-29. It is retained as a source artifact; runtime backgrounds now come from `../themes/` and the user's theme setting.

Prompt:

Use case: precise-object-edit. Asset type: clean background plate for an animated mobile game settlement screen. Input image is the EDIT TARGET. Remove ONLY every foreground UI element: top-left back arrow circle, top-right coin and number pill, WORD logo and LOGIC PUZZLE caption, Wonderful title with all stars and gold underline glow, two-line slogan, Chapter Progress glass panel and all its text/progress/coins, yellow Next Chapter button, Share label/icon/underline. Inpaint those removed UI areas with the naturally continuing background landscape. Preserve the exact original framing, blue/purple sky with pink clouds, blurred rolling lavender hills in the middle and close-up lavender flowers at bottom, colors, lighting, depth of field and background positions. Do not sharpen or redesign the scene. Return ONLY the clean full-bleed background, portrait 9:16, no text, no logo, no buttons, no coin, no UI, opaque background. This is a background extraction, not a new design; preserve the source background as closely as possible.
