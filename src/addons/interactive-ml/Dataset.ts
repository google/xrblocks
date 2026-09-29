import {assertLabel} from './Types';

/** Shared dataset rules. Feature validation stays with each trainer. */
export class Dataset<T extends {id: string; label: string}> {
  protected examples: T[] = [];

  get counts(): Record<string, number> {
    const counts: Record<string, number> = Object.create(null);
    for (const {label} of this.examples)
      counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }

  protected add(example: Omit<T, 'id'>): string {
    assertLabel(example.label);
    const counts = this.counts;
    if (
      this.examples.length >= 512 ||
      (counts[example.label] ?? 0) >= 64 ||
      (!(example.label in counts) && Object.keys(counts).length >= 32)
    ) {
      throw new Error('Dataset limit reached. Remove examples first.');
    }
    const id = crypto.randomUUID();
    this.examples.push(structuredClone({...example, id}) as T);
    return id;
  }

  removeExample(id: string) {
    this.examples = this.examples.filter((example) => example.id !== id);
  }

  /** Remove the newest example without copying the dataset. */
  removeLastExample() {
    this.examples.pop();
  }

  relabelExample(id: string, label: string) {
    assertLabel(label);
    const example = this.examples.find((example) => example.id === id);
    if (!example) throw new Error('Unknown example.');
    if (example.label === label) return;
    const counts = this.counts;
    if (
      (counts[label] ?? 0) >= 64 ||
      (!(label in counts) &&
        Object.keys(counts).length >= 32 &&
        counts[example.label] > 1)
    ) {
      throw new Error('Class limit reached.');
    }
    example.label = label;
  }

  protected restore(examples: T[], validate: (example: T) => void) {
    const ids = new Set<string>();
    for (const example of examples) {
      if (
        !example ||
        typeof example.id !== 'string' ||
        !example.id ||
        ids.has(example.id)
      ) {
        throw new Error('Invalid example ID.');
      }
      validate(example);
      this.add(example);
      this.examples.at(-1)!.id = example.id;
      ids.add(example.id);
    }
  }
}
