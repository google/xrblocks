//#region src/addons/lipsync/computeAudioFeatures.ts
/**
* Pure-function feature extractor. Given the raw analyser buffers and the
* audio context's sample rate, returns the per-frame features the viseme
* mappers consume. Extracted from `LipsyncMouth` so the math is testable
* without a real `AudioContext` / `AnalyserNode`.
*/
function computeAudioFeatures(inputs, sampleRate) {
	const { freqData, timeData, mfcc } = inputs;
	let sumSq = 0;
	for (let i = 0; i < timeData.length; i++) {
		const v = timeData[i] / 128 - 1;
		sumSq += v * v;
	}
	const rms = Math.sqrt(sumSq / timeData.length);
	const binHz = sampleRate / 2 / freqData.length;
	let totalEnergy = 0;
	let weightedSum = 0;
	let low = 0;
	let mid = 0;
	let high = 0;
	for (let i = 0; i < freqData.length; i++) {
		const energy = freqData[i] / 255;
		const hz = i * binHz;
		totalEnergy += energy;
		weightedSum += hz * energy;
		if (hz < 500) low += energy;
		else if (hz < 2e3) mid += energy;
		else if (hz < 8e3) high += energy;
	}
	const centroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;
	const norm = (x) => Math.min(1, x / 50);
	const f1Hz = peakHzInRange(freqData, binHz, 200, 1e3);
	const f2Hz = peakHzInRange(freqData, binHz, 800, 3e3);
	const lowMid = low + mid;
	const voiced = rms > .02 && lowMid > high * 1.2 && lowMid > 1;
	return {
		rms,
		centroid,
		low: norm(low),
		mid: norm(mid),
		high: norm(high),
		f1Hz,
		f2Hz,
		voiced,
		mfcc
	};
}
function peakHzInRange(freqData, binHz, lowHz, highHz) {
	const loBin = Math.max(0, Math.floor(lowHz / binHz));
	const hiBin = Math.min(freqData.length - 1, Math.ceil(highHz / binHz));
	const WIN = 5;
	let bestBin = -1;
	let bestVal = 0;
	for (let i = loBin; i <= hiBin; i++) {
		let sum = 0;
		for (let k = -2; k <= 2; k++) {
			const j = i + k;
			if (j >= loBin && j <= hiBin) sum += freqData[j];
		}
		const avg = sum / WIN;
		if (avg > bestVal) {
			bestVal = avg;
			bestBin = i;
		}
	}
	if (bestVal < 20) return 0;
	return bestBin * binHz;
}
//#endregion
export { computeAudioFeatures };
