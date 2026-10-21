import assert from 'node:assert/strict';
import { bodyFrame, garmentPlacement, stopMedia, acquireCamera, cameraError, checkPhoto } from '../public/js/features/outfit-geometry.js';

const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
points[11] = { x: .7, y: .25, visibility: .9 }; points[12] = { x: .3, y: .25, visibility: .9 };
const source = bodyFrame(points, 1000, 1000);
assert.equal(source.x, 500); assert.equal(source.y, 250); assert.equal(source.angle, 0); assert(Math.abs(source.span - 400) < 1e-9);
const target = bodyFrame(points, 500, 500), placement = garmentPlacement(source, target);
assert.equal(placement.scale, .5); assert.equal(placement.x, 250); assert.equal(placement.y, 125);
// The photo's shoulder anchor must land at the viewer's shoulder anchor, independent of resolution.
assert.equal(placement.x + (source.x - source.x) * placement.scale, target.x);
const adjusted = garmentPlacement(source, target, { scale: 1.2, x: 25, y: -40, angle: .1 });
assert.equal(adjusted.x, 275); assert.equal(adjusted.y, 85); assert.equal(adjusted.scale, .6); assert.equal(adjusted.angle, .1);
points[11].visibility = .1; assert.equal(bodyFrame(points, 500, 500), null);
assert.equal(bodyFrame([], 500, 500), null); assert.equal(garmentPlacement(null, target), null);
points[11] = { x: .7, y: .3 }; assert(bodyFrame(points, 500, 500).angle > 0);
points[11].x = NaN; assert.equal(bodyFrame(points, 500, 500), null);
let stopped = 0; stopMedia({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] }); assert.equal(stopped, 2); stopMedia(null);
assert(cameraError({ name: 'NotAllowedError' }).includes('choose a photo'));
assert(cameraError({ name: 'NotFoundError' }).includes('No camera'));
assert(cameraError({ name: 'NotReadableError' }).includes('busy'));
assert.equal(checkPhoto({ type: 'image/jpeg', size: 1024 }), null);
assert(checkPhoto({ type: 'image/svg+xml', size: 1024 }));
assert(checkPhoto({ type: 'image/png', size: 13 * 1024 * 1024 }));
// A permission prompt can resolve after the preview was closed or another photo was chosen.
let resolveCamera, current = true, lateStopped = 0;
const pending = acquireCamera(() => new Promise(resolve => { resolveCamera = resolve; }), () => current, { video: true, audio: false });
current = false; resolveCamera({ getTracks: () => [{ stop: () => lateStopped++ }] });
assert.equal(await pending, null); assert.equal(lateStopped, 1);
const live = { getTracks: () => [] }; assert.equal(await acquireCamera(async () => live, () => true, {}), live);
console.log('PASS outfit shoulder placement, adjustments, lost-pose handling, camera cleanup, permission errors and local photo limits');
