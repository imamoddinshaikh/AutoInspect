// utils/photoSequence.ts
// Phase 7: guard against out-of-order async photo compression.
// When photos are captured/replaced in rapid succession, an earlier (slower)
// compression must not overwrite a later one. Pure, dependency-free.

export interface PhotoGuard {
  /** Take the next sequence token for a slot. */
  take: (slotKey: string) => number;
  /** True only if the token is still the latest issued for that slot. */
  isLatest: (slotKey: string, token: number) => boolean;
}

export const createPhotoGuard = (): PhotoGuard => {
  const latest = new Map<string, number>();
  let counter = 0;
  return {
    take: (slotKey: string) => {
      counter += 1;
      latest.set(slotKey, counter);
      return counter;
    },
    isLatest: (slotKey: string, token: number) => latest.get(slotKey) === token,
  };
};
