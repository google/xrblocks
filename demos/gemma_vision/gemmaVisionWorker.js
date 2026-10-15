import {installWebGpuTimeslicing} from '../gemma_on_device/GemmaRuntime.js';
import {GemmaVisionRuntime} from './GemmaVisionRuntime.js';
import {isCompactDevice} from './modelChoice.js';
import {RUNTIME_URL} from './modelConfig.js';

// Phones and headsets share one GPU with the compositor. Split model work into
// short batches there so XR and page frames keep landing during inference.
if (isCompactDevice(self.navigator)) {
  installWebGpuTimeslicing(self.navigator.gpu);
}

const runtime = new GemmaVisionRuntime({
  loadRuntime: () => import(RUNTIME_URL),
  postMessage: (message) => self.postMessage(message),
});
self.onmessage = ({data}) => void runtime.handle(data);
