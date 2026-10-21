// Free, approximate styling preview. All photo/camera pixels stay on the device.
// Only public product photos, a pinned vision library and public model weights are downloaded.
import { esc, img, icon, state, registerSlot, registerRouteHook, openOverlay, closeOverlay } from '../core.js';
import { clamp, bodyFrame, garmentPlacement, stopMedia, acquireCamera, cameraError, checkPhoto } from './outfit-geometry.js';

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
const POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SEGMENT = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
let visionFiles, active;
const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
const imageOf = (url) => new Promise((resolve, reject) => {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
  image.onload = () => resolve(image); image.onerror = () => reject(new Error('The photo could not load. Try another dress photo or check your connection.')); image.src = url;
});
function resized(image, limit = 960) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height, scale = Math.min(1, limit / Math.max(w, h));
  const c = canvasOf(Math.round(w * scale), Math.round(h * scale)); c.getContext('2d').drawImage(image, 0, 0, c.width, c.height); return c;
}
function maskedGarment(photo, result) {
  const mask = result.categoryMask, bytes = mask.getAsUint8Array(), w = mask.width, h = mask.height;
  const alpha = canvasOf(w, h), ac = alpha.getContext('2d'), pixels = ac.createImageData(w, h);
  let count = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 4) {
    pixels.data[i * 4 + 3] = 255; count++; const x = i % w, y = Math.floor(i / w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (count < w * h * .015) throw new Error('The dress could not be separated in this photo. Choose a clearer, front-facing dress photo below.');
  ac.putImageData(pixels, 0, 0);
  const cutout = canvasOf(photo.width, photo.height), context = cutout.getContext('2d');
  context.drawImage(photo, 0, 0); context.globalCompositeOperation = 'destination-in'; context.drawImage(alpha, 0, 0, cutout.width, cutout.height);
  return { cutout, fallback: { x: (x0 + x1) / 2 / w * photo.width, y: (y0 + (y1 - y0) * .07) / h * photo.height, span: (x1 - x0) / w * photo.width * .62, angle: 0 } };
}

export function init() {
  registerSlot('pdp-actions', (el, data) => {
    const product = state.byId[data.pid];
    if (!product?.images?.length || product.gender !== 'women' || !['unstitched', 'ready-to-wear'].includes(product.category)) return;
    const entry = document.createElement('div'); entry.className = 'op-entry';
    entry.innerHTML = `<button class="btn ghost" type="button">${icon('camera', '', 18)} Try the look</button><small>Camera or photo · Free styling preview</small>`;
    entry.querySelector('button').onclick = () => openPreview(product, entry.querySelector('button'));
    el.append(entry);
  });
  registerRouteHook(() => active?.close());
}

function openPreview(product, opener) {
  let disposed = false, stream, pose, segmenter, wardrobe, reference, sourcePhoto, background;
  let preparing, raf = 0, inputEpoch = 0, lastInference = 0, lastVideoTime = -1, lastSeen = 0, target, mode = 'none', facing = 'user';
  let recorder, recordStream, recordTimer, recordTick, clipUrl, drag;
  const controls = { scale: 1, x: 0, y: 0, angle: 0 }, blobUrls = new Set();
  const root = openOverlay(`<div class="op-shell">
    <header><span class="eyebrow">Your private dressing mirror</span><h2>Try the <em>look.</em></h2><p>${esc(product.title)}</p></header>
    <div class="op-grid"><div class="op-visual"><canvas width="640" height="800" aria-label="Your outfit styling preview"></canvas>
      <div class="op-placeholder">${icon('camera', '', 38)}<strong>Your look starts here</strong><span>Choose a photo or start your camera.<br>Face forward with your shoulders visible.</span></div>
      <span class="op-private">${icon('lock', '', 13)} Stays on your device</span><video class="op-camera-source" autoplay muted playsinline hidden></video></div>
    <div class="op-controls"><p class="op-note"><b>A styling preview, made for you.</b> This places the outfit from its product photo over your image. It is approximate: fit, drape and stitching can look different in person.</p>
      <p class="op-status" role="status" aria-live="polite">Preparing the dress… The first visit may take a moment.</p>
      <div class="op-buttons"><button type="button" class="btn rani sm" data-camera disabled>${icon('camera', '', 16)} Start camera</button>
        <button type="button" class="btn ghost sm" data-upload disabled>${icon('upload', '', 16)} Choose photo</button><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden aria-label="Choose your photo"></div>
      <div class="op-camera-buttons" hidden><button type="button" data-stop>Stop camera</button><button type="button" data-switch>Switch camera</button></div>
      <button type="button" class="op-example" data-example disabled>See an example with the model photo</button>
      <details class="op-adjust"><summary>Adjust the outfit</summary><p>Drag the outfit to move it. Use the sliders to fine-tune your preview.</p>
        <label>Outfit size <input data-control="scale" type="range" min=".35" max="2.5" step=".01" value="1"></label>
        <label>Rotation <input data-control="angle" type="range" min="-.5" max=".5" step=".01" value="0"></label>
        <label>Vertical position <input data-control="y" type="range" min="-300" max="300" step="1" value="0"></label>
        <button type="button" data-reset>Reset adjustments</button></details>
      ${product.images.length > 1 ? `<label class="op-source-label">Dress photo<select data-source>${product.images.map((_, i) => `<option value="${i}">View ${i + 1}</option>`).join('')}</select></label>` : ''}
      <div class="op-buttons"><button type="button" class="btn ghost sm" data-save disabled>Save photo</button><button type="button" class="btn ghost sm" data-record hidden>Record 5 seconds</button></div>
      <div class="op-clip" hidden><video controls playsinline aria-label="Your five-second outfit preview"></video><a class="btn ghost sm" download>Save video</a></div>
      <p class="op-privacy">No sign-in or payment. Camera and chosen photos stay in this browser and are cleared when you close the preview. Your camera turns off when you leave this tab.</p>
    </div></div></div>`, { width: 940, cls: 'outfit-preview', onClose: dispose });
  const $ = selector => root.querySelector(selector), canvas = $('canvas'), ctx = canvas.getContext('2d'), video = $('.op-camera-source');
  const controller = { close: () => { if (!disposed) closeOverlay(); } }; active = controller;
  $('.modal-box').setAttribute('aria-label', 'Try the look'); $('.modal-box').tabIndex = -1;
  const status = text => { if (!disposed && $('.op-status').textContent !== text) $('.op-status').textContent = text; };
  function buttons(ready) { for (const selector of ['[data-camera]', '[data-upload]', '[data-example]', '[data-source]']) if ($(selector)) $(selector).disabled = !ready; }
  function stopCamera() {
    inputEpoch++; cancelAnimationFrame(raf); raf = 0; finishRecording(); stopMedia(stream); stream = null; video.pause(); video.srcObject = null;
    $('.op-camera-buttons').hidden = true; $('[data-record]').hidden = true;
    if (mode === 'camera') { mode = 'none'; background = null; target = null; ctx.clearRect(0, 0, canvas.width, canvas.height); $('.op-placeholder').hidden = false; $('[data-save]').disabled = true; }
  }
  function clearClip() { if (clipUrl) { URL.revokeObjectURL(clipUrl); clipUrl = null; } $('.op-clip video').removeAttribute('src'); $('.op-clip').hidden = true; }
  function finishRecording() { clearTimeout(recordTimer); clearInterval(recordTick); if (recorder?.state === 'recording') recorder.stop(); stopMedia(recordStream); recordStream = null; }
  function dispose() {
    disposed = true; stopCamera(); clearClip(); for (const url of blobUrls) URL.revokeObjectURL(url); blobUrls.clear();
    pose?.close(); segmenter?.close(); pose = segmenter = null; background = sourcePhoto = wardrobe = null;
    canvas.width = canvas.height = 0; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', dispose);
    if (active === controller) active = null; opener?.focus();
  }
  function visibility() { if (document.hidden && stream) { stopCamera(); status('Camera paused while you were away. Press Start camera when you are ready.'); } }
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', dispose, { once: true });
  async function prepare(index = 0) {
    if (preparing) return preparing;
    buttons(false); status('Preparing the dress… The first visit may take a moment.');
    preparing = (async () => {
      if (!pose || !segmenter) {
        visionFiles ||= import(`${VISION}/vision_bundle.mjs`).then(async lib => ({ lib, files: await lib.FilesetResolver.forVisionTasks(`${VISION}/wasm`) })).catch(error => { visionFiles = null; throw error; });
        const { lib, files } = await visionFiles; if (disposed) return;
        pose = await lib.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: .5, minTrackingConfidence: .5 });
        if (disposed) { pose.close(); pose = null; return; }
        segmenter = await lib.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: SEGMENT, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false });
        if (disposed) { segmenter.close(); pose.close(); segmenter = pose = null; return; }
      }
      const image = await imageOf(img(product.images[index])); if (disposed) return;
      const photo = resized(image); await pose.setOptions({ runningMode: 'IMAGE' });
      const points = pose.detect(photo).landmarks[0]; const result = segmenter.segment(photo);
      let garment; try { garment = maskedGarment(photo, result); } finally { result.close(); }
      wardrobe = garment.cutout; reference = bodyFrame(points, photo.width, photo.height) || garment.fallback; sourcePhoto = photo;
      status('Dress ready. Choose a photo or start your camera.');
    })().catch(error => { status(error.message.includes('photo') ? error.message : 'The preview could not load. Check your connection and reopen it to try again.'); })
      .finally(() => { preparing = null; if (!disposed) buttons(Boolean(wardrobe)); });
    return preparing;
  }
  function defaultTarget() { return { x: canvas.width / 2, y: canvas.height * .27, span: canvas.width * .31, angle: 0 }; }
  function paint() {
    if (disposed || !background || !wardrobe) return;
    const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
    ctx.save(); if (mode === 'camera' && facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(background, 0, 0, w, h);
    const transform = garmentPlacement(reference, target || defaultTarget(), controls);
    if (transform) { ctx.translate(transform.x, transform.y); ctx.rotate(transform.angle); ctx.scale(transform.scale, transform.scale); ctx.drawImage(wardrobe, -reference.x, -reference.y); }
    ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(0, h - 28, w, 28); ctx.fillStyle = '#51373f'; ctx.font = '12px sans-serif'; ctx.fillText('AARZU · Styling preview · Actual fit may differ', 12, h - 10);
  }
  async function usePhoto(image, label) {
    stopCamera(); const epoch = ++inputEpoch; await prepare(Number($('[data-source]')?.value || 0)); if (disposed || epoch !== inputEpoch || !wardrobe) return;
    await pose.setOptions({ runningMode: 'IMAGE' }); if (disposed || epoch !== inputEpoch) return;
    background = resized(image); canvas.width = background.width; canvas.height = background.height; mode = 'photo';
    target = bodyFrame(pose.detect(background).landmarks[0], canvas.width, canvas.height);
    $('.op-placeholder').hidden = true; $('[data-save]').disabled = false; paint();
    status(target ? `${label} — outfit aligned. You can adjust its position and size.` : 'Shoulders were not clearly visible. Use Adjust the outfit and drag to position it yourself.');
  }
  async function startCamera() {
    stopCamera(); const epoch = ++inputEpoch; buttons(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status('Live camera needs a secure browser connection. Choose a photo instead.'); buttons(Boolean(wardrobe)); return; }
    status('Allow camera access when your browser asks.');
    // Ask only after an explicit click. A late permission response must never reopen a closed preview.
    try {
      const camera = await acquireCamera(c => navigator.mediaDevices.getUserMedia(c), () => !disposed && epoch === inputEpoch && !document.hidden, { video: { facingMode: { ideal: facing }, width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      if (!camera) return;
      stream = camera; await prepare(Number($('[data-source]')?.value || 0));
      if (disposed || epoch !== inputEpoch || !wardrobe) { stopMedia(camera); return; }
      await pose.setOptions({ runningMode: 'VIDEO' }); if (disposed || epoch !== inputEpoch) { stopMedia(camera); return; }
      video.srcObject = camera; await video.play(); if (disposed || epoch !== inputEpoch) { stopMedia(camera); return; }
      camera.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (!disposed && stream === camera) { stopCamera(); status('The camera disconnected. Start it again or choose a photo.'); } }, { once: true }));
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight)); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      background = video; mode = 'camera'; target = null; lastInference = 0; lastSeen = 0; lastVideoTime = -1;
      $('.op-placeholder').hidden = true; $('.op-camera-buttons').hidden = false; $('[data-save]').disabled = false;
      $('[data-record]').hidden = !(typeof MediaRecorder !== 'undefined' && canvas.captureStream); status('Camera is on. Face forward with your shoulders visible.');
      const draw = time => {
        if (disposed || mode !== 'camera' || epoch !== inputEpoch) return;
        if (time - lastInference > 120 && video.currentTime !== lastVideoTime && video.readyState >= 2) {
          try {
            const frame = bodyFrame(pose.detectForVideo(video, time).landmarks[0], canvas.width, canvas.height);
            if (frame) { target = target ? Object.fromEntries(Object.entries(frame).map(([k, v]) => [k, target[k] * .6 + v * .4])) : frame; lastSeen = time; status('Following your shoulders. Move slowly; use Adjust the outfit to fine-tune.'); }
            else if (time - lastSeen > 900) { target = null; status('Move back until both shoulders are visible, or position the outfit using the sliders.'); }
          } catch { stopCamera(); status('Live tracking paused. Choose a photo or restart the camera.'); return; }
          lastInference = time; lastVideoTime = video.currentTime;
        }
        paint(); raf = requestAnimationFrame(draw);
      }; raf = requestAnimationFrame(draw);
    } catch (error) { stopCamera(); status(cameraError(error)); }
    finally { if (!disposed) buttons(Boolean(wardrobe)); }
  }
  $('[data-camera]').onclick = startCamera;
  $('[data-stop]').onclick = () => { stopCamera(); status('Camera is off. Start it again or choose a photo.'); };
  $('[data-switch]').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); };
  $('[data-upload]').onclick = () => $('input[type=file]').click();
  $('input[type=file]').onchange = async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const error = checkPhoto(file); if (error) { status(error); return; }
    stopCamera(); const epoch = ++inputEpoch, url = URL.createObjectURL(file); blobUrls.add(url);
    try { const image = await imageOf(url); if (!disposed && epoch === inputEpoch) await usePhoto(image, 'Your photo'); }
    catch { status('This photo could not be opened. Try a JPG or PNG photo.'); }
    finally { URL.revokeObjectURL(url); blobUrls.delete(url); }
  };
  $('[data-example]').onclick = async () => { try { if (sourcePhoto) await usePhoto(sourcePhoto, 'Example using the product model photo'); } catch { status('The example could not load. Reopen the preview to try again.'); } };
  if ($('[data-source]')) $('[data-source]').onchange = async e => { stopCamera(); wardrobe = null; await prepare(Number(e.target.value)); if (background && mode === 'photo' && wardrobe) paint(); };
  for (const input of root.querySelectorAll('[data-control]')) input.oninput = () => { controls[input.dataset.control] = Number(input.value); paint(); };
  $('[data-reset]').onclick = () => { Object.assign(controls, { x: 0, y: 0, scale: 1, angle: 0 }); for (const input of root.querySelectorAll('[data-control]')) input.value = String(controls[input.dataset.control]); paint(); };
  canvas.onpointerdown = e => { if (!background) return; canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, ox: controls.x, oy: controls.y }; };
  canvas.onpointermove = e => { if (!drag) return; const r = canvas.getBoundingClientRect(), sign = mode === 'camera' && facing === 'user' ? -1 : 1; controls.x = drag.ox + (e.clientX - drag.x) * canvas.width / r.width * sign; controls.y = clamp(drag.oy + (e.clientY - drag.y) * canvas.height / r.height, -300, 300); $('[data-control=y]').value = controls.y; paint(); };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
  $('[data-save]').onclick = () => {
    if (!background || disposed) return;
    canvas.toBlob(blob => { if (!blob || disposed) return; const url = URL.createObjectURL(blob); blobUrls.add(url); const a = document.createElement('a'); a.href = url; a.download = `aarzu-${product.slug}-styling-preview.png`; a.click(); }, 'image/png');
  };
  $('[data-record]').onclick = () => {
    if (!stream || recorder?.state === 'recording') return;
    clearClip(); const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { status('Video recording is not supported in this browser. You can save a photo instead.'); return; }
    try {
      recordStream = canvas.captureStream(24); recorder = new MediaRecorder(recordStream, { mimeType }); const chunks = [], started = performance.now();
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => { stopMedia(recordStream); clearInterval(recordTick); $('[data-record]').disabled = false; $('[data-record]').textContent = 'Record 5 seconds'; if (disposed || !chunks.length || performance.now() - started < 4500) return; clipUrl = URL.createObjectURL(new Blob(chunks, { type: mimeType })); $('.op-clip video').src = clipUrl; $('.op-clip a').href = clipUrl; $('.op-clip a').download = `aarzu-${product.slug}-preview.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`; $('.op-clip').hidden = false; status('Your preview is ready. Save it below if you like.'); };
      recorder.onerror = () => { finishRecording(); status('Recording could not finish. You can save a photo instead.'); };
      recorder.start(); $('[data-record]').disabled = true;
      recordTick = setInterval(() => { $('[data-record]').textContent = `Recording… ${Math.max(1, Math.ceil(5 - (performance.now() - started) / 1000))}s`; }, 200);
      recordTimer = setTimeout(finishRecording, 5000);
    } catch { finishRecording(); status('Recording is not available here. You can save a photo instead.'); }
  };
  prepare(); $('.modal-box').focus();
}
