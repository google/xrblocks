import type {
  SerializerRenderer,
  SerializerRendererFactory,
} from './SerializerTypes';

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
  const globalScope = globalThis as {
    __splitEngineSerializer?: SerializerRenderer;
    ThreeSplitEngine?: {
      SplitEngineSerializer?: new () => SerializerRenderer;
    };
  };
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
