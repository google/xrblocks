import type {DeepReadonly} from './Types';

/**
 * Recursively freezes an object and all its nested properties, making them
 * immutable. This prevents any future changes to the object or its sub-objects.
 * @param obj - The object to freeze deeply.
 * @returns The same object that was passed in, now deeply frozen.
 */
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T> {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(name => {
    // We use `any` here because `T` is a generic and we can't be sure
    // what properties it has without more complex type manipulation.
    // The function's signature provides the necessary type safety for
    // consumers.
    const prop = obj[name as keyof T];
    if (prop && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  });
  return obj as DeepReadonly<T>;
}

/**
 * Recursively merges properties from `obj2` into `obj1`.
 * If a property exists in both objects and is an object itself, it will be
 * recursively merged. Otherwise, the value from `obj2` will overwrite the
 * value in `obj1`.
 * @param obj1 - The target object to merge into.
 * @param obj2 - The source object to merge from.
 */
export function deepMerge<T extends object, U extends object>(
    obj1: T, obj2?: U) {
  if (obj2 == null) {
    return obj1 as T & U;
  }

  const merged = obj1 as Record<string, unknown>;

  for (const key in obj2) {
    // Ensure the key is actually on obj2, not its prototype chain.
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
      const val1 = merged[key];
      const val2 = obj2[key];

      if (val1 && typeof val1 === 'object' && val2 &&
          typeof val2 === 'object') {
        // If both values are objects, recurse
        deepMerge(val1, val2);
      } else {
        // Otherwise, overwrite
        merged[key] = val2;
      }
    }
  }
}
