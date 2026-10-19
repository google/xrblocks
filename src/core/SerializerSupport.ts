import type {
  SerializerRenderer,
  SerializerRendererFactory,
} from './SerializerTypes';

interface SplitEngineGlobalScope {
  __splitEngineSerializer?: SerializerRenderer;
  ThreeSplitEngine?: {
    SplitEngineSerializer?: new () => SerializerRenderer;
  };
}

/**
 * Returns true when running inside a Split Engine host environment where a
 * global `SplitEngineSerializer` instance or constructor is registered.
 */
export function isSplitEngineEnvironment(): boolean {
  const globalScope = globalThis as SplitEngineGlobalScope;
  return Boolean(
    globalScope.__splitEngineSerializer ||
      typeof globalScope.ThreeSplitEngine?.SplitEngineSerializer === 'function'
  );
}

/**
 * Resolves a `SerializerRenderer` from `Options.serializer` or from the global
 * `ThreeSplitEngine.SplitEngineSerializer` runtime entrypoint.
 */
export async function resolveSerializerRenderer(
  serializer?: SerializerRenderer | SerializerRendererFactory
): Promise<SerializerRenderer> {
  if (typeof serializer === 'function') {
    return await serializer();
  }
  if (serializer != null) {
    return serializer;
  }
  const globalScope = globalThis as SplitEngineGlobalScope;
  if (globalScope.__splitEngineSerializer) {
    return globalScope.__splitEngineSerializer;
  }
  if (
    typeof globalScope.ThreeSplitEngine?.SplitEngineSerializer === 'function'
  ) {
    return new globalScope.ThreeSplitEngine.SplitEngineSerializer();
  }
  throw new Error(
    'Options.rendererBackend is "serializer", but no serializer instance or factory was provided in Options.serializer and globalThis.ThreeSplitEngine.SplitEngineSerializer is unavailable.'
  );
}
