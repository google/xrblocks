import type { Constructor } from '../../utils/Types';
export declare class Registry {
    private instances;
    /**
     * Registers an new instanceof a given type.
     * If an existing instance of the same type is already registered, it will be
     * overwritten.
     * @param instance - The instance to register.
     * @param type - Type to register the instance as. Will default to
     * `instance.constructor` if not defined.
     */
    register<T extends object>(instance: T, type?: Constructor<T>): void;
    /**
     * Gets an existing instance of a registered type.
     * @param type - The constructor function of the type to retrieve.
     * @returns The instance of the requested type.
     */
    get<T extends object>(type: Constructor<T>): T | undefined;
    /**
     * Gets an existing instance of a registered type, or creates a new one if it
     * doesn't exist.
     * @param type - The constructor function of the type to retrieve.
     * @param factory - A function that creates a new instance of the type if it
     * doesn't already exist.
     * @returns The instance of the requested type.
     */
    getOrCreate<T extends object>(type: Constructor<T>, factory: () => T): T;
    /**
     * Unregisters an instance of a given type.
     * @param type - The type to unregister.
     */
    unregister(type: Constructor): void;
}
