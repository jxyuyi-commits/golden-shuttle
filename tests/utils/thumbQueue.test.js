// tests/utils/thumbQueue.test.js —— U20 修订：并发受限队列 + cancel() 语义
//
// 断言：
//   1) 未开始的排队任务 cancel：promise 立即结算为 null，且**立即从排队移除**——
//      即便并发名额被占满，stats().queued 也立即下降（不虚高）；
//   2) 未开始且名额未占满：cancel 后队列长度立即下降；
//   3) 已开始的任务 cancel：仅标记，任务自然结束后结果不外泄（结算为 null）。
//
// 说明：占用名额的任务用「悬挂 Promise」hold 住，保证 active 计数确定，避免任务瞬时完成带来的时序抖动。
import { describe, it, expect } from 'vitest';
import { createQueue } from '../../src/utils/thumbQueue.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

describe('thumbQueue：并发受限队列 + cancel 语义（U20 修订）', () => {
  it('未开始排队任务 cancel：结算 null 且立即移除（并发占满时 stats().queued 也不虚高）', async () => {
    const q = createQueue(2);
    const gA = defer();
    const gB = defer();
    const a = q.enqueue(() => gA.promise); // 占用名额 1
    const b = q.enqueue(() => gB.promise); // 占用名额 2
    await tick();
    expect(q.stats()).toMatchObject({ active: 2, queued: 0, limit: 2 });

    const c = q.enqueue(() => Promise.resolve('C')); // 排队（名额已满）
    const d = q.enqueue(() => Promise.resolve('D')); // 排队
    expect(q.stats().queued).toBe(2);

    let cVal = 'unset';
    c.promise.then((v) => { cVal = v; });
    c.cancel(); // 未开始分支：立即结算并从排队移除
    expect(q.stats().queued).toBe(1); // c 已移除，仅剩 d（并发占满时同样立即准确）
    await tick();
    expect(cVal).toBe(null);          // 已结算为 null
    expect(q.stats().active).toBe(2); // 占用名额不受影响

    gA.resolve(null);
    gB.resolve(null);                 // 释放名额 → pump 启动 d
    expect(await d.promise).toBe('D'); // d 正常执行
    expect(await a.promise).toBe(null);
    expect(await b.promise).toBe(null);
    await tick();
    expect(q.stats().active).toBe(0);
  });

  it('未开始排队任务 cancel（名额未占满）：队列长度立即下降', async () => {
    const q = createQueue(2);
    const gC = defer();
    q.enqueue(() => gC.promise); // 占用名额 1
    await tick();
    const gX = defer();
    q.enqueue(() => gX.promise); // 占用名额 2
    const y = q.enqueue(() => Promise.resolve('Y')); // 排队
    await tick();
    expect(q.stats()).toMatchObject({ active: 2, queued: 1 });

    let yVal = 'unset';
    y.promise.then((v) => { yVal = v; });
    y.cancel();                       // 移除排队中的 y
    expect(q.stats().queued).toBe(0); // 立即下降
    await tick();
    expect(yVal).toBe(null);

    gC.resolve(null);
    gX.resolve(null);
    await tick();
    expect(q.stats().active).toBe(0);
  });

  it('已开始的任务 cancel：仅标记，结果不外泄（结算为 null）', async () => {
    const q = createQueue(1);
    const g = defer();
    const a = q.enqueue(() => g.promise);
    await tick();
    a.cancel();                       // 已开始 → 仅标记
    g.resolve('A');                   // 任务自然结束，但被取消 → 结果不外泄
    await tick();
    expect(await a.promise).toBe(null);
    expect(q.stats().active).toBe(0);
  });
});
