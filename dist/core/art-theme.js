import manifest from '../art/alps/manifest.json?v=22' with {type:'json'};

// Dynamic boards use the reusable skins, never scenery baked for fixed cells.
export const RUNTIME_ART = manifest.assets.filter(entry =>
  /^assets\/(ui|icons)\//.test(entry.path) || ['bg-lobby','bg-level'].includes(entry.id));

export async function preloadArt() {
  await Promise.all(RUNTIME_ART.map(async entry => {
    const image = new Image();
    image.src = new URL('../art/alps/' + entry.path, import.meta.url).href;
    await image.decode();
  }));
  await Promise.all([400,500,600].map(weight => document.fonts.load(`${weight} 20px "Nunito Sans"`)));
  await document.fonts.ready;
  document.documentElement.dataset.artReady = 'true';
}
