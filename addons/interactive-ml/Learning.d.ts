import { ClassifierData, TrainingOptions } from "./Types.js";
//#region src/addons/interactive-ml/Learning.d.ts
export declare function probabilities(features: number[], data: ClassifierData): number[];
/** Small balanced softmax head; feature extraction never runs here. */
export declare function fitClassifier(samples: {
  label: string;
  features: number[];
}[], options?: TrainingOptions): Promise<ClassifierData>;
export declare function trainClassifier(samples: {
  label: string;
  features: number[];
}[], options: TrainingOptions): Promise<ClassifierData>;
//#endregion