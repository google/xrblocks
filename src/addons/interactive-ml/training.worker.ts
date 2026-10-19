import {fitClassifier} from './Learning';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async ({data}) => {
  try {
    const model = await fitClassifier(data.samples, {
      epochs: data.epochs,
      onProgress: (progress) => scope.postMessage({progress}),
    });
    scope.postMessage({model});
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
