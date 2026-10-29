//#region src/addons/phone-companion/MessageLimits.d.ts
/** Fixed-size token buckets; callers use a bounded vocabulary, never peer IDs. */
export declare class MessageLimits {
  private buckets;
  allow(type: string, perSecond: number, burst?: number): boolean;
}
//#endregion