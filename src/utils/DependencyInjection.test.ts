import {expect, it} from 'vitest';
import {Registry} from '../core/components/Registry';
import {callInitWithDependencyInjection} from './DependencyInjection';

class RequiredService {
  value = 42;
}
class OptionalService {
  value = 3;
}

it('initializes a consumer with required and optional services from the registry', async () => {
  class Consumer {
    static dependencies = {required: RequiredService};
    static optionalDependencies = {optional: OptionalService};
    result = 0;
    init({
      required,
      optional,
    }: {
      required: RequiredService;
      optional?: OptionalService;
    }) {
      this.result = required.value + (optional?.value ?? 0);
    }
  }
  const registry = new Registry();
  const consumer = new Consumer();
  await expect(
    callInitWithDependencyInjection(consumer, registry, {})
  ).rejects.toThrow(/RequiredService/);
  expect(consumer.result).toBe(0);
  registry.register(new RequiredService());
  await callInitWithDependencyInjection(consumer, registry, {});
  expect(consumer.result).toBe(42);
  registry.register(new OptionalService());
  await callInitWithDependencyInjection(consumer, registry, {});
  expect(consumer.result).toBe(45);
});

it('initializes an undeclared consumer with the fallback value', async () => {
  const consumer = {
    value: 0,
    init(value: number) {
      this.value = value;
    },
  };
  await callInitWithDependencyInjection(consumer, new Registry(), 7);
  expect(consumer.value).toBe(7);
});
