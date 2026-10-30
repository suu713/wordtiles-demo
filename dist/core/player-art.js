// User-supplied slices are preserved at their original resolution and alpha.
export const PLAYER_ART = [
  'btn_fanhui@2x.png',
  'dancikuai_1@2x.png', 'dancikuai_2@2x.png',
  'frame_1@2x.png', 'frame_2@2x.png', 'frame_3@2x.png',
  'frame_4@2x.png', 'frame_5@2x.png',
  'icon_tishi@2x.png', 'jinbi@2x.png',
];

export async function preloadPlayerArt() {
  const urls=PLAYER_ART.map(filename=>new URL('../art/yanqi/'+filename,import.meta.url).href);
  urls.push(new URL('../art/settlement/reference.png',import.meta.url).href);
  urls.push(new URL('../art/settlement/foreground.png',import.meta.url).href);
  urls.push(new URL('../art/settlement/abc-wreath.png',import.meta.url).href);
  urls.push(new URL('../art/settlement/abc-wreath-back.png',import.meta.url).href);
  urls.push(new URL('../art/settlement/abc-tiles-front.png',import.meta.url).href);
  urls.push(new URL('../art/encouragement/great-streak.png',import.meta.url).href);
  urls.push(new URL('../art/encouragement/great-complete.png',import.meta.url).href);
  await Promise.all(urls.map(async url => {
    const image = new Image();
    image.src = url;
    await image.decode();
  }));
}
