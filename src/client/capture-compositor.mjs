// Keep this program self-contained: it also runs from the minified client bundle.
const workerSource = `
let canvas;
self.onmessage = async ({ data: { id, source, width, height, background } }) => {
  let image;
  try {
    image = await createImageBitmap(await (await fetch(source)).blob());
    if (image.width !== width || image.height !== height) throw new Error('Screenshot dimensions changed during composition');
    canvas ??= new OffscreenCanvas(width, height);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, dataUrl: new FileReaderSync().readAsDataURL(blob) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  } finally { image?.close(); }
};
`;

const stopped = () => Object.assign(new Error('The browser image compositor is closed'), { code: 'CONTROL_STOPPED' });

/** One lazy compositor per guest; the capture owner coalesces concurrent requests. */
export function createCaptureCompositor() {
  let worker, pending, sequence = 0, closed = false;
  const fail = error => {
    const request = pending; pending = undefined;
    worker?.terminate(); worker = undefined;
    request?.reject(error);
  };
  return {
    compose(frame) {
      if (closed) return Promise.reject(stopped());
      if (pending) return Promise.reject(new Error('A browser frame is already being composed'));
      return new Promise((resolve, reject) => {
        if (!worker) {
          const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
          try {
            worker = new Worker(url, { name: 'OpenCU image compositor' });
            const instance = worker;
            worker.onmessage = ({ data }) => {
              if (worker !== instance) return;
              const request = pending;
              if (!request || data?.id !== request.id) return;
              if (data.error || typeof data.dataUrl !== 'string' || !data.dataUrl.startsWith('data:image/png;base64,')) {
                fail(new Error(data.error || 'The browser image compositor returned an invalid PNG')); return;
              }
              pending = undefined; request.resolve(data.dataUrl);
            };
            worker.onerror = event => { event.preventDefault(); if (worker === instance) fail(new Error(event.message || 'The browser image compositor failed')); };
            worker.onmessageerror = () => { if (worker === instance) fail(new Error('The browser image compositor response could not be read')); };
          } catch (error) { worker?.terminate(); worker = undefined; reject(error); return; }
          finally { URL.revokeObjectURL(url); }
        }
        pending = { id: ++sequence, resolve, reject };
        try { worker.postMessage({ ...frame, id: pending.id }); }
        catch (error) { fail(error); }
      });
    },
    cancel() { if (pending) fail(stopped()); },
    dispose() { closed = true; fail(stopped()); },
  };
}
