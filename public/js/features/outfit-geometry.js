// Geometry and media cleanup for the on-device styling preview.
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export function bodyFrame(points, width, height) {
  const shoulders = [points?.[11], points?.[12]];
  if (shoulders.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.visibility ?? 1) < .55)) return null;
  const [left, right] = shoulders.sort((a, b) => a.x - b.x);
  const span = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  if (span < width * .07 || span > width * .95) return null;
  return { x: (left.x + right.x) * width / 2, y: (left.y + right.y) * height / 2, span, angle: Math.atan2((right.y - left.y) * height, (right.x - left.x) * width) };
}
export function garmentPlacement(source, target, controls = {}) {
  if (!source || !target || !(source.span > 0) || !(target.span > 0)) return null;
  const scale = clamp(target.span / source.span, .05, 12) * clamp(Number(controls.scale ?? 1), .35, 2.5);
  return { x: target.x + Number(controls.x || 0), y: target.y + Number(controls.y || 0), scale, angle: target.angle - source.angle + Number(controls.angle || 0) };
}
export function stopMedia(stream) { for (const track of stream?.getTracks?.() || []) track.stop(); }
export async function acquireCamera(request, isCurrent, constraints) {
  const stream = await request(constraints);
  if (!isCurrent()) { stopMedia(stream); return null; }
  return stream;
}
export function cameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Camera access was not allowed. You can choose a photo instead, or allow camera access in your browser.';
  if (error?.name === 'NotFoundError') return 'No camera was found. Choose a photo instead.';
  if (error?.name === 'NotReadableError') return 'The camera is busy. Close other apps using it and try again, or choose a photo.';
  return 'The camera could not start. Choose a photo instead, or try again.';
}
export function checkPhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return 'Please choose a JPG, PNG, WebP or AVIF photo.';
  return file.size > 12 * 1024 * 1024 ? 'Choose a photo smaller than 12 MB.' : null;
}
