import { ReadonlySignal, Signal } from "@preact/signals-core";
//#region src/addons/glasses/ui/utils.d.ts
export declare function isSignal<T>(value: T | Signal<T> | ReadonlySignal<T>): value is Signal<T> | ReadonlySignal<T>;
export declare function extractValue<T>(value: T | 'initial' | undefined | Signal<T | 'initial' | undefined> | ReadonlySignal<T | 'initial' | undefined>): T | undefined;
//#endregion