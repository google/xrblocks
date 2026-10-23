import {describe, expect, it, vi} from 'vitest';

import {Registry} from '../core/components/Registry';
import type {Constructor} from './Types';
import {callInitWithDependencyInjection} from './DependencyInjection';

class RequiredService {}
class OptionalService {}

function createScript(
  dependencies?: Record<string, Constructor>,
  optionalDependencies?: Record<string, Constructor>
) {
  const init = vi.fn();
  class TestScript {
    static dependencies = dependencies;
    static optionalDependencies = optionalDependencies;
    init = init;
  }
  return {script: new TestScript(), init};
}

describe('callInitWithDependencyInjection', () => {
  it('passes the fallback when no dependencies are declared', async () => {
    const {script, init} = createScript();
    const fallback = {};

    await callInitWithDependencyInjection(script, new Registry(), fallback);

    expect(init).toHaveBeenCalledWith(fallback);
  });

  it('injects a registered optional dependency', async () => {
    const registry = new Registry();
    const service = new OptionalService();
    registry.register(service);
    const {script, init} = createScript(undefined, {service: OptionalService});

    await callInitWithDependencyInjection(script, registry, {});

    expect(init).toHaveBeenCalledWith({service});
  });

  it('passes undefined for a missing optional dependency', async () => {
    const {script, init} = createScript(undefined, {service: OptionalService});

    await callInitWithDependencyInjection(script, new Registry(), {});

    expect(init).toHaveBeenCalledWith({service: undefined});
  });

  it('still throws when a required dependency is missing', async () => {
    const {script, init} = createScript(
      {required: RequiredService},
      {optional: OptionalService}
    );

    await expect(
      callInitWithDependencyInjection(script, new Registry(), {})
    ).rejects.toThrow('Dependency not found for key: RequiredService');
    expect(init).not.toHaveBeenCalled();
  });

  it('combines required and optional dependencies', async () => {
    const registry = new Registry();
    const required = new RequiredService();
    registry.register(required);
    const {script, init} = createScript(
      {required: RequiredService},
      {optional: OptionalService}
    );

    await callInitWithDependencyInjection(script, registry, {});

    expect(init).toHaveBeenCalledWith({required, optional: undefined});
  });
});
