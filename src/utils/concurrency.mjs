// Preserve input order even when network tasks complete out of order.
export async function mapLimit(items, limit, action) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Concurrency must be a positive integer.");
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await action(items[index], index);
      }
    }),
  );
  return results;
}
export function limiter(limit) {
  let active = 0;
  const queue = [];
  return (action) =>
    new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          resolve(await action());
        } catch (error) {
          reject(error);
        } finally {
          active--;
          queue.shift()?.();
        }
      };
      if (active < limit) run();
      else queue.push(run);
    });
}
