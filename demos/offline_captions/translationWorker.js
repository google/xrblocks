import {TranslationRuntime} from './TranslationRuntime.js';
import {RUNTIME_URL} from './modelConfig.js';

const runtime = new TranslationRuntime({
  loadRuntime: () => import(RUNTIME_URL),
  postMessage: (message) => self.postMessage(message),
});
self.onmessage = ({data}) => void runtime.handle(data);
