const defaultScriptMethods = new WeakSet<object>();

/** Records the no-op methods supplied by one ScriptMixin base class. */
export function markDefaultScriptMethods(prototype: object): void {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') continue;
    const method = Reflect.get(prototype, name);
    if (typeof method === 'function') defaultScriptMethods.add(method);
  }
}

/** Returns whether a Script method is supplied by ScriptMixin unchanged. */
export function isDefaultScriptMethod(method: unknown): boolean {
  return typeof method !== 'function' || defaultScriptMethods.has(method);
}
