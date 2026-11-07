/** Bind the landing panel to the same scene and worker used inside XR. */
export function bindPreload(scene, panel) {
  const load = panel.querySelector('#preload-load');
  const stop = panel.querySelector('#preload-stop');
  const status = panel.querySelector('#startup');
  const ready = panel.querySelector('#preload-ready');
  const continueButton = panel.querySelector('#preload-continue');
  let disposed = false;
  let pending = false;

  function refresh() {
    if (disposed || !scene.loadButton) return;
    scene.refreshControls();
    const loading = scene.operation?.type === 'loading';
    // The scene's load button reads Cancel while loading; this panel has Stop.
    if (!loading && load.textContent !== scene.loadButton.label) {
      load.textContent = scene.loadButton.label;
    }
    if (status.textContent !== scene.status.text) {
      status.textContent = scene.status.text;
    }
    load.disabled =
      pending ||
      loading ||
      scene.busy ||
      scene.client.loaded ||
      !scene.supported;
    stop.hidden = !loading;
    stop.disabled = !loading || !!scene.stopping;
    ready.hidden = !scene.client.loaded;
  }

  async function run(action) {
    pending = true;
    try {
      const result = action();
      refresh();
      await result;
    } catch (error) {
      if (!disposed) scene.showError(error);
    } finally {
      pending = false;
      refresh();
    }
  }

  function loadModel() {
    if (disposed || load.disabled) return;
    // A cache-only click never turns into download consent after eviction.
    const allowDownload = !scene.cached;
    void run(() => scene.loadModel({allowDownload}));
  }

  function stopModel() {
    if (disposed || stop.disabled) return;
    void scene.cancelLoad().finally(refresh);
    refresh();
  }

  function continueInSimulator() {
    if (!disposed && !continueButton.hidden) panel.hidden = true;
  }

  load.addEventListener('click', loadModel);
  stop.addEventListener('click', stopModel);
  continueButton.addEventListener('click', continueInSimulator);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      load.removeEventListener('click', loadModel);
      stop.removeEventListener('click', stopModel);
      continueButton.removeEventListener('click', continueInSimulator);
    },
  };
}
