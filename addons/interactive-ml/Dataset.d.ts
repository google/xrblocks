//#region src/addons/interactive-ml/Dataset.d.ts
/** Shared dataset rules. Feature validation stays with each trainer. */
export declare class Dataset<T extends {
  id: string;
  label: string;
}> {
  protected examples: T[];
  get counts(): Record<string, number>;
  protected add(example: Omit<T, 'id'>): string;
  removeExample(id: string): void;
  /** Remove the newest example without copying the dataset. */
  removeLastExample(): void;
  relabelExample(id: string, label: string): void;
  protected restore(examples: T[], validate: (example: T) => void): void;
}
//#endregion