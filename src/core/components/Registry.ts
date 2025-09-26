import type {Constructor} from '../../utils/Types';

export class Registry {
  private instances = new Map<Constructor, object>();

  /**
   * Registers an new instanceof a given type.
   * If an existing instance of the same type is already registered, it will be
   * overwritten.
   * @param instance - The instance to register.
   * @param type - Type to register the instance as. Will default to
   * `instance.constructor` if not defined.
   */
  register<T extends object>(instance: T, type?: Constructor<T>) {
    const registrationType = type ?? instance.constructor as Constructor<T>;
    if (instance instanceof registrationType) {
      this.instances.set(registrationType, instance);
    } else {
      throw new Error(`Instance of type '${
          instance.constructor
              .name}' is not an instance of the registration type '${
          registrationType.name}'.`);
    }
  }

  /**
   * Gets an existing instance of a registered type.
   * @param type - The constructor function of the type to retrieve.
   * @returns The instance of the requested type.
   */
  get<T extends object>(type: Constructor<T>): T|undefined {
    return this.instances.get(type) as T | undefined;
  }

  /**
   * Gets an existing instance of a registered type, or creates a new one if it
   * doesn't exist.
   * @param type - The constructor function of the type to retrieve.
   * @param factory - A function that creates a new instance of the type if it
   * doesn't already exist.
   * @returns The instance of the requested type.
   */
  getOrCreate<T extends object>(type: Constructor<T>, factory: () => T): T {
    let instance = this.get(type);
    if (instance === undefined) {
      instance = factory();
      if (!(instance instanceof type)) {
        throw new Error(`Factory for type ${
            type.name} returned an incompatible instance of type ${
            (instance.constructor as Constructor).name}.`);
      }
      // Register the new instance with the requested type.
      this.register(instance, type);
    }
    return instance;
  }

  /**
   * Unregisters an instance of a given type.
   * @param type - The type to unregister.
   */
  unregister(type: Constructor): void {
    this.instances.delete(type);
  }
}
