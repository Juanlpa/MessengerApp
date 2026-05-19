export type FilterId = 'none' | 'grayscale' | 'sepia' | 'warm' | 'cool' | 'vivid';

const FILTER_CSS: Record<FilterId, string> = {
  none: 'none',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.85)',
  warm: 'saturate(1.4) hue-rotate(350deg) brightness(1.05)',
  cool: 'saturate(1.1) hue-rotate(10deg) brightness(0.95) contrast(1.05)',
  vivid: 'saturate(1.8) contrast(1.1)',
};

export function applyColorFilter(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  filter: FilterId,
  w: number,
  h: number
): void {
  ctx.filter = FILTER_CSS[filter] ?? 'none';
  ctx.drawImage(video, 0, 0, w, h);
  ctx.filter = 'none';
}
