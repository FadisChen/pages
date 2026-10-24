// A small worker pool for the simulation tests: `await runTasks([{ task, args }, ...])` gives the results in the same order.
// One worker per core (at most one per task); a task that throws rejects the whole call with its stack.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

export function runTasks(tasks, { size = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length) } = {}) {
  return new Promise((resolve, reject) => {
    const results = new Array(tasks.length);
    let next = 0, done = 0, failed = false;
    const workers = [];
    const finish = () => { for (const w of workers) w.terminate(); };
    const feed = (w) => {
      if (failed) return;
      if (next >= tasks.length) return;
      const id = next++;
      w.postMessage({ id, task: tasks[id].task, args: tasks[id].args });
    };
    const n = Math.min(size, tasks.length);
    if (!n) { resolve([]); return; }
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL('./sim-worker.mjs', import.meta.url));
      workers.push(w);
      w.on('message', (m) => {
        if (failed) return;
        if (m.error) { failed = true; finish(); reject(new Error(m.error)); return; }
        results[m.id] = m.result;
        if (++done === tasks.length) { finish(); resolve(results); } else feed(w);
      });
      w.on('error', (e) => { if (!failed) { failed = true; finish(); reject(e); } });
      feed(w);
    }
  });
}
