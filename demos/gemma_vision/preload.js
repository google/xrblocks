/** Bind the landing panel to the same scene and worker used inside XR. */
export function bindPreload(scene, panel) {
  const model = panel.querySelector('#preload-model');
  const load = panel.querySelector('#preload-load');
  const stop = panel.querySelector('#preload-stop');
  const status = panel.querySelector('#startup');
  const ready = panel.querySelector('#preload-ready');
  const continueButton = panel.querySelector('#preload-continue');
  let disposed = false;
  let loading = false;
  let stopping = false;

  function refresh() {
    if (disposed || !scene.loadButton) return;
    scene.refreshControls();
    if (load.textContent !== scene.loadButton.label) {
      load.textContent = scene.loadButton.label;
    }
    if (status.textContent !== scene.status.text) {
      status.textContent = scene.status.text;
    }
    if (model.value !== scene.modelKey) model.value = scene.modelKey;
    model.disabled =
      loading ||
      scene.busy ||
      ['loading', 'generating'].includes(scene.client.state);
    load.disabled = loading || scene.busy || scene.loadButton.disabled;
    stop.hidden = scene.stopButton.disabled;
    stop.disabled = stopping || scene.stopButton.disabled;
    const stopLabel =
      scene.client.state === 'loading' ? 'Cancel loading' : 'Stop';
    if (stop.textContent !== stopLabel) stop.textContent = stopLabel;
    ready.hidden = !scene.client.loaded;
  }

  async function run(action, isLoad) {
    if (isLoad) loading = true;
    else stopping = true;
    try {
      const pending = action();
      refresh();
      await pending;
    } catch (error) {
      if (!disposed) {
        scene.status.text = `Error: ${error.message ?? String(error)}`;
      }
    } finally {
      if (isLoad) loading = false;
      else stopping = false;
      refresh();
    }
  }

  function loadModel() {
    if (disposed || load.disabled) return;
    // A cache-only click never turns into download consent after eviction.
    const allowDownload = !scene.cached;
    void run(() => scene.loadModel({allowDownload}), true);
  }

  function chooseModel() {
    if (disposed) return;
    scene.selectModel(model.value);
    refresh();
  }

  function stopModel() {
    if (disposed || stop.disabled) return;
    void run(() => scene.stop(), false);
  }

  function continueInSimulator() {
    if (!disposed && !continueButton.hidden) panel.hidden = true;
  }

  model.addEventListener('change', chooseModel);
  load.addEventListener('click', loadModel);
  stop.addEventListener('click', stopModel);
  continueButton.addEventListener('click', continueInSimulator);
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      model.removeEventListener('change', chooseModel);
      load.removeEventListener('click', loadModel);
      stop.removeEventListener('click', stopModel);
      continueButton.removeEventListener('click', continueInSimulator);
    },
  };
}
