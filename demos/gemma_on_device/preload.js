export function bindPreload(scene, panel) {
  const load = panel.querySelector('#preload-load');
  const cancel = panel.querySelector('#preload-cancel');
  const status = panel.querySelector('#startup');
  const ready = panel.querySelector('#preload-ready');
  let disposed = false;

  function refresh() {
    if (disposed || !scene.loadButton) return;
    if (load.textContent !== scene.loadButton.label)
      load.textContent = scene.loadButton.label;
    if (status.textContent !== scene.status.text)
      status.textContent = scene.status.text;
    load.disabled = scene.loadButton.disabled;
    const downloading =
      scene.stopButton.label === 'Cancel download' &&
      !scene.stopButton.disabled;
    cancel.hidden = !downloading;
    cancel.disabled = !downloading;
    ready.hidden = scene.client.state !== 'ready';
  }

  async function run(action) {
    try {
      const pending = action();
      refresh();
      await pending;
    } catch (error) {
      scene.showError(error);
    } finally {
      refresh();
    }
  }

  function loadModel() {
    if (!disposed && !load.disabled) void run(() => scene.loadModel());
  }

  function cancelDownload() {
    if (!disposed && !cancel.disabled) void run(() => scene.stop());
  }

  load.addEventListener('click', loadModel);
  cancel.addEventListener('click', cancelDownload);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      load.removeEventListener('click', loadModel);
      cancel.removeEventListener('click', cancelDownload);
    },
  };
}
