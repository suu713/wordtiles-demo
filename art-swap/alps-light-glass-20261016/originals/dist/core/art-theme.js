import manifest from '../art/paris/manifest.json?v=15' with {type:'json'};

// Load both screens and their interactive states before the first playable frame.
export async function preloadArt() {
  await Promise.all(manifest.assets.map(async entry => {
    const image = new Image();
    image.src = new URL('../art/paris/' + entry.path, import.meta.url).href;
    await image.decode();
  }));
  await document.fonts.ready;
}
