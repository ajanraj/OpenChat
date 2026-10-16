/**
 * Runs `fn` on each item one at a time, in order. Use it where each step depends on the previous
 * one (e.g. a copied reply needs its parent's new id) or must not run concurrently (R2 deletes run
 * the R2 component's mutation as a sub-transaction).
 */
export const forEachInOrder = async <T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
  index = 0
): Promise<void> => {
  if (index >= items.length) {
    return;
  }
  await fn(items[index]);
  await forEachInOrder(items, fn, index + 1);
};
