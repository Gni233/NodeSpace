/// <reference types="vite/client" />

const bundledFonts = import.meta.glob<string>('./local-fonts/stzhongsong.ttf', {
  eager: true,
  query: '?url',
  import: 'default',
});

const family = 'NodeSpace STZhongsong';
const url = bundledFonts['./local-fonts/stzhongsong.ttf'];
const face = url
  ? new FontFace(family, `url(${JSON.stringify(url)}) format("truetype")`)
  : null;

if (face) {
  document.fonts.add(face);
  void face.load().catch(error => console.warn('华文中宋加载失败', error));
}

export const HUAWEN_CANVAS_FONT = `"${family}", serif`;
export const hasHuawenCanvasFont = () => face !== null && face.status !== 'error';
