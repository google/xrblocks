import { fitClassifier } from "./Learning.js";
//#region src/addons/interactive-ml/training.worker.ts
const scope = globalThis;
scope.onmessage = async ({ data }) => {
	try {
		const model = await fitClassifier(data.samples, {
			epochs: data.epochs,
			onProgress: (progress) => scope.postMessage({ progress })
		});
		scope.postMessage({ model });
	} catch (error) {
		scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
	}
};
//#endregion
