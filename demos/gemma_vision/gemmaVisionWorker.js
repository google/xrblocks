import {installWebGpuTimeslicing} from '../gemma_on_device/GemmaRuntime.js';
import {GemmaVisionRuntime} from './GemmaVisionRuntime.js';
import {isCompactDevice} from './modelChoice.js';
import {RUNTIME_URL} from './modelConfig.js';

// Phones and headsets share one GPU with the compositor. Split model work into
// short batches there so XR and page frames keep landing during inference.
// These are smaller than the on-device Gemma defaults: on a Quest 3 they cut
// the worst frame during a Lite answer from about 100 ms to 55 ms.
const TIMESLICING = {
  maxDispatchesPerChunk: 8,
  maxDispatchesPerSync: 16,
  adaptiveSync: false,
  maxWorkgroupsPerChunk: 16384,
  maxWorkgroupsPerSync: 65536,
  workBudgetMs: 4,
  yieldMs: 2,
};

if (isCompactDevice(self.navigator)) {
  installWebGpuTimeslicing(self.navigator.gpu, TIMESLICING);
}

const runtime = new GemmaVisionRuntime({
  loadRuntime: () => import(RUNTIME_URL),
  postMessage: (message) => self.postMessage(message),
});
self.onmessage = ({data}) => void runtime.handle(data);
