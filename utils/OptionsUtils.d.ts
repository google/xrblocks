import type { DeepReadonly } from './Types';
/**
 * Recursively freezes an object and all its nested properties, making them
 * immutable. This prevents any future changes to the object or its sub-objects.
 * @param obj - The object to freeze deeply.
 * @returns The same object that was passed in, now deeply frozen.
 */
export declare function deepFreeze<T extends object>(obj: T): DeepReadonly<T>;
/**
 * Recursively merges properties from `obj2` into `obj1`.
 * If a property exists in both objects and is an object itself, it will be
 * recursively merged. Otherwise, the value from `obj2` will overwrite the
 * value in `obj1`.
 * @param obj1 - The target object to merge into.
 * @param obj2 - The source object to merge from.
 */
export declare function deepMerge<T extends object, U extends object>(obj1: T, obj2?: U): (T & U) | undefined;
