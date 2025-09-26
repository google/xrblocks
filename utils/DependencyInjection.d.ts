import { Registry } from '../core/components/Registry';
import type { Constructor } from '../utils/Types';
export type InjectableConstructor = Function & {
    dependencies?: Record<string, Constructor>;
};
export interface Injectable {
    init(...args: unknown[]): Promise<void> | void;
    constructor: InjectableConstructor;
}
/**
 * Call init on a script or subsystem with dependency injection.
 */
export declare function callInitWithDependencyInjection(script: Injectable, registry: Registry, fallback: unknown): Promise<void>;
