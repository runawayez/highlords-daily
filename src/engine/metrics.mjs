import { AsyncLocalStorage } from "node:async_hooks";
const scope = new AsyncLocalStorage();
export const currentMetrics = () => scope.getStore();
export function count(name, value = 1) {
  const metrics = currentMetrics();
  if (metrics) metrics.counters[name] = (metrics.counters[name] || 0) + value;
}
export async function measure(name, action) {
  const start = performance.now();
  try {
    return await action();
  } finally {
    const metrics = currentMetrics();
    if (metrics)
      metrics.stages[name] =
        (metrics.stages[name] || 0) + performance.now() - start;
  }
}
export async function withMetrics(action) {
  const metrics = {
    startedAt: new Date().toISOString(),
    stages: {},
    counters: {},
  };
  return scope.run(metrics, async () => {
    const start = performance.now();
    try {
      return await action(metrics);
    } finally {
      metrics.totalMs = performance.now() - start;
      metrics.peakRssBytes = process.resourceUsage().maxRSS * 1024;
    }
  });
}
