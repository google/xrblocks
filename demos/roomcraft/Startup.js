let startup;

/**
 * Start after DOM readiness, even when dependency evaluation finishes later.
 * Keep this module independent of the SDK so import failures reach the page.
 */
export function startRoomcraftPage(load = () => import('./main.js')) {
  if (startup) return startup;
  startup = new Promise((resolve) => {
    const launch = async () => {
      const status = document.getElementById('status');
      const message = document.getElementById('error');
      let slowLoad;
      try {
        if (!status || !message) {
          throw new Error('Roomcraft startup status elements are missing.');
        }
        status.dataset.startup = 'loading-modules';
        status.textContent = 'Loading Roomcraft modules...';
        message.textContent = '';
        message.hidden = true;
        slowLoad = setTimeout(() => {
          status.textContent =
            'Roomcraft modules are still loading. Check the connection if this continues.';
        }, 20_000);
        const app = await load();
        clearTimeout(slowLoad);
        await app.startRoomcraftDemo((stage, text) => {
          status.dataset.startup = stage;
          if (text) status.textContent = text;
        });
        status.dataset.startup = 'ready';
        resolve(true);
      } catch (error) {
        console.error('[roomcraft] Startup failed', error);
        if (status) {
          status.dataset.startup = 'failed';
          status.textContent = 'Roomcraft could not start.';
        }
        if (message) {
          const reason = error instanceof Error ? error.message : String(error);
          message.textContent = `${reason} Check the connection and reload this page.`;
          message.hidden = false;
        }
        resolve(false);
      } finally {
        clearTimeout(slowLoad);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void launch(), {
        once: true,
      });
    } else {
      void launch();
    }
  });
  return startup;
}
