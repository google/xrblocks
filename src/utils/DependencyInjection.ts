import {Registry} from '../core/components/Registry';
import type {Constructor} from '../utils/Types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type InjectableConstructor = Function & {
  // Static property for dependencies.
  dependencies?: Record<string, Constructor>;
  /** Dependencies injected when registered, or undefined when unavailable. */
  optionalDependencies?: Record<string, Constructor>;
};

export interface Injectable {
  init(...args: unknown[]): Promise<void> | void; // The init method.
  constructor: InjectableConstructor; // A reference to its own constructor.
}

/**
 * Call init on a script or subsystem with dependency injection.
 */
export async function callInitWithDependencyInjection(
  script: Injectable,
  registry: Registry,
  fallback: unknown
) {
  const dependencies = script.constructor.dependencies;
  const optionalDependencies = script.constructor.optionalDependencies;
  if (dependencies == null && optionalDependencies == null) {
    await script.init(fallback);
    return;
  }
  const resolvedDependencies: Record<string, object | undefined> =
    Object.fromEntries(
      Object.entries(dependencies ?? {}).map(([key, value]) => {
        const dependency = registry.get(value);
        if (!dependency) {
          throw new Error(`Dependency not found for key: ${value.name}`);
        }
        return [key, dependency];
      })
    );
  for (const [key, value] of Object.entries(optionalDependencies ?? {})) {
    resolvedDependencies[key] = registry.get(value);
  }
  await script.init(resolvedDependencies);
}
