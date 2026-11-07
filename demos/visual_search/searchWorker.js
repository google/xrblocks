import {SearchRuntime} from './SearchRuntime.js';
import {RUNTIME_URL} from './modelConfig.js';

const runtime = new SearchRuntime({
  loadRuntime: () => import(RUNTIME_URL),
  postMessage: (message) => self.postMessage(message),
});
self.onmessage = ({data}) => void runtime.handle(data);
