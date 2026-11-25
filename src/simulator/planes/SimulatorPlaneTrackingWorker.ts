import {DepthPlaneTracker} from './DepthPlaneTracker';
import type {
  PlaneTrackingWorkerRequest,
  PlaneTrackingWorkerResponse,
} from './SimulatorPlaneTrackingTypes';

export interface PlaneTrackingWorkerHost {
  postMessage(message: PlaneTrackingWorkerResponse): void;
  close(): void;
}

interface DedicatedWorkerScopeLike extends PlaneTrackingWorkerHost {
  onmessage: ((event: MessageEvent<PlaneTrackingWorkerRequest>) => void) | null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates a message handler for simulator depth-to-plane tracking worker
 * requests. Separated from global worker wiring so unit tests can exercise
 * the worker protocol directly without spawning a browser worker.
 */
export function createPlaneTrackingWorkerHandler(
  host: PlaneTrackingWorkerHost,
  tracker: DepthPlaneTracker = new DepthPlaneTracker()
): (message: PlaneTrackingWorkerRequest) => void {
  return (message: PlaneTrackingWorkerRequest) => {
    if (!message || typeof message !== 'object') {
      host.postMessage({
        type: 'error',
        message: 'Invalid plane tracking worker message',
      });
      return;
    }

    try {
      switch (message.type) {
        case 'configure':
          tracker.configure(message.config);
          return;

        case 'reset':
          tracker.reset(message.sceneGeneration);
          return;

        case 'dispose':
          tracker.reset();
          host.close();
          return;

        case 'processDepth': {
          const planes = tracker.processDepthFrame(message);
          host.postMessage({
            type: 'planes',
            requestId: message.requestId,
            sceneGeneration: message.sceneGeneration,
            planes,
          });
          return;
        }

        default: {
          const unknownType = (message as {type?: unknown}).type;
          host.postMessage({
            type: 'error',
            message: `Unknown plane tracking worker message type: ${String(unknownType)}`,
          });
          return;
        }
      }
    } catch (error: unknown) {
      if (message.type === 'processDepth') {
        host.postMessage({
          type: 'error',
          requestId: message.requestId,
          sceneGeneration: message.sceneGeneration,
          message: describeError(error),
        });
      } else {
        host.postMessage({
          type: 'error',
          message: describeError(error),
        });
      }
    }
  };
}

// Keep the worker global surface explicit so this entry typechecks against
// XR Blocks' standard DOM tsconfig without requiring `lib: ["webworker"]`.
const isDedicatedWorkerScope =
  typeof self !== 'undefined' &&
  typeof document === 'undefined' &&
  typeof (self as {postMessage?: unknown}).postMessage === 'function';

if (isDedicatedWorkerScope) {
  const worker = self as unknown as DedicatedWorkerScopeLike;
  const handleMessage = createPlaneTrackingWorkerHandler(worker);
  worker.onmessage = (event: MessageEvent<PlaneTrackingWorkerRequest>) => {
    handleMessage(event.data);
  };
}
