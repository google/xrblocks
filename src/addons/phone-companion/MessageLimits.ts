/** Fixed-size token buckets; callers use a bounded vocabulary, never peer IDs. */
export class MessageLimits {
  private buckets = new Map<string, {tokens: number; time: number}>();

  allow(type: string, perSecond: number, burst = perSecond): boolean {
    const now = performance.now();
    const bucket = this.buckets.get(type) ?? {tokens: burst, time: now};
    bucket.tokens = Math.min(
      burst,
      bucket.tokens + ((now - bucket.time) * perSecond) / 1000
    );
    bucket.time = now;
    this.buckets.set(type, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
  }
}
