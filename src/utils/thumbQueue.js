// 通用「并发受限任务队列」——用于缩略图渲染节流（U20）。
//
// 背景：看板一屏多卡时，若每个 PDF 缩略图挂载即调用 pdf.js 渲染，会同时解码多张
// 首页位图，抢占主线程/Worker 带宽，拖慢首屏。这里把渲染放进**并发上限队列**，
// 同一时刻最多执行 `limit` 个任务（默认 2），其余排队。
//
// 设计要点：
// - 纯函数式、零依赖，便于单元测试与复用；
// - `enqueue(fn)` 返回 `{ promise, cancel }`；`cancel()` 在任务**尚未开始**时：立即结算
//   （resolve(null)）并**从排队中移除**（U20 修订：避免 `stats().queued` 虚高），再 `pump()`
//   推进后续任务，避免组件卸载后 Promise 悬挂；**已开始**的任务无法中断（交由
//   pdf.js 自然结束），仅标记为已取消、结果不再向外抛出；
// - `stats()` 暴露 active/queued/maxActive 供端到端探针断言「并发 ≤ limit」。
//
// U20：开发态把队列挂到 window.__thumbQueue，供 CDP 探针只读断言并发上限；
// 生产构建（import.meta.env.DEV 为 false）不挂载，不污染全局。

const DEFAULT_LIMIT = 2;

/**
 * 创建一个并发受限队列。
 * @param {number} [limit=2] 并发上限（≥1）
 * @returns {{ enqueue: (fn: () => Promise<any>) => { promise: Promise<any>, cancel: () => void }, stats: () => { active: number, queued: number, maxActive: number }, resetStats: () => void, limit: number }}
 */
export function createQueue(limit = DEFAULT_LIMIT) {
  const cap = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  let active = 0;
  let maxActive = 0;
  /** @type {Array<{fn: () => Promise<any>, cancelled: boolean, started: boolean, resolve: (v: any) => void}>} */
  const waiting = [];

  function pump() {
    while (active < cap && waiting.length) {
      const job = waiting.shift();
      if (job.cancelled) continue; // 排队期间已被取消（已在 cancel 时结算）
      job.started = true;
      active += 1;
      if (active > maxActive) maxActive = active;
      Promise.resolve()
        .then(() => job.fn())
        .then((value) => job.resolve(job.cancelled ? null : value))
        .catch(() => job.resolve(null)) // 失败一律降级为 null，绝不向上抛
        .finally(() => { active -= 1; pump(); });
    }
  }

  return {
    /**
     * 入队一个返回 Promise 的任务。
     * @param {() => Promise<any>} fn 任务体（执行时才开始计时并发）
     * @returns {{ promise: Promise<any>, cancel: () => void }}
     */
    enqueue(fn) {
      /** @type {any} */
      const job = { fn, cancelled: false, started: false, resolve: null };
      const promise = new Promise((resolve) => { job.resolve = resolve; });
      waiting.push(job);
      pump();
      return {
        promise,
        cancel() {
          if (job.started) { job.cancelled = true; return; } // 已开始：仅标记，结果不外泄
          job.cancelled = true;
          const i = waiting.indexOf(job);
          if (i >= 0) waiting.splice(i, 1); // U20 修订：从未开始的排队中移除，避免 stats().queued 虚高（含并发占满场景）
          job.resolve(null);                // 未开始：立即结算，防止卸载后悬挂
          pump();                           // U20 修订：若因此空出名额/有可跑任务，推进队列
        },
      };
    },
    stats() { return { active, queued: waiting.length, maxActive, limit: cap }; },
    resetStats() { maxActive = active; },
    limit: cap,
  };
}

/** 全局共享的缩略图渲染队列（并发 ≤2） */
export const thumbQueue = createQueue(DEFAULT_LIMIT);

// 开发态：暴露给端到端（CDP）探针，用于断言并发上限；生产构建不挂载。
if (typeof window !== 'undefined' && import.meta && import.meta.env && import.meta.env.DEV) {
  window.__thumbQueue = thumbQueue;
}
