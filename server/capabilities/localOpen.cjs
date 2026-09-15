// 本机能力（Capability）：用系统默认程序打开本机文件。
//
// G17 · 前后端拆分"留缝"：把「本机打开文件」从业务服务（services/files.cjs）中抽出为
// **可替换能力**。将来部署为"服务器端"时，只需把本模块替换为「返回不支持 → 前端降级为下载」，
// 业务层与路由层无需改动。
//
// 接口：openLocal(absPath) -> { ok: boolean, mode: 'electron-shell' | 'windows-fallback' | 'unsupported' }
//
// 职责边界（重要）：
//   本模块只负责"如何调用本机打开"，**不含任何安全断言**（路径硬化 / 危险扩展名拒绝）。
//   那些断言仍由调用方 files.openLocally 复用 G2 既有逻辑先行把关，因此本模块**不得**
//   被直接暴露为对外接口，也不得放宽调用方的约束。
//
// 与 G2 的关系：本模块即 G2 改造后两种打开方式的提取（行为逐字等价）——
//   · Electron 主进程 → shell.openPath（无 shell 注入面）
//   · 非 Electron（纯 Node / 开发态单跑后端）→ rundll32 url.dll,FileProtocolHandler
//     （execFile + 数组参数，经 CreateProcess 传递 argv，不经任何 shell）
'use strict';

const { execFile } = require('child_process');

/**
 * 静默探测 Electron shell。
 * Electron 主进程可用；ELECTRON_RUN_AS_NODE 或纯 Node 下 require('electron') 返回
 * 可执行文件路径字符串（无 .shell）或抛错，此处一律降级为 null。
 * @returns {object|null} 可用的 shell 对象，或 null
 */
function getElectronShell() {
  try {
    const shell = require('electron').shell;
    return shell && typeof shell.openPath === 'function' ? shell : null;
  } catch {
    return null;
  }
}

/**
 * 用系统默认程序打开本机文件。
 * @param {string} absPath - **绝对路径**，须由调用方完成路径硬化与危险扩展名校验
 * @returns {{ok: boolean, mode: string}} 结果与所用方式：
 *   ok=true  mode='electron-shell'  走 Electron shell.openPath
 *   ok=true  mode='windows-fallback' 走本机 rundll32（Windows 桌面、无 Electron）
 *   ok=false mode='unsupported'     无任何本机打开机制（如将来的服务器端）→ 供降级为"下载"
 */
function openLocal(absPath) {
  const shell = getElectronShell();
  if (shell) {
    // Electron：openPath 返回 Promise<string>，空串表示成功，非空为错误信息（fire-and-forget）
    shell
      .openPath(absPath)
      .then((errMsg) => { if (errMsg) console.error('[Open Native Error]', errMsg); })
      .catch((err) => console.error('[Open Native Error]', err));
    return { ok: true, mode: 'electron-shell' };
  }

  // 非 Electron 环境（开发态单跑后端）：Windows 桌面下回退 rundll32。
  // 刻意 NOT 使用 `cmd.exe /c start "" <path>` —— Node 在 Windows 下的参数转义不处理
  // `&`/`^`/`|` 等 cmd 元字符，路径一旦落到 cmd 命令行就仍存在二次解析面。
  // execFile + 数组参数直接传 argv，不经 shell。
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', absPath], (err) => {
      if (err) console.error('[Open Native Error]', err);
    });
    return { ok: true, mode: 'windows-fallback' };
  }

  // 既无 Electron shell，也无本机桌面打开机制（如将来的 Linux 服务器）→ 明确降级，
  // 供调用方（前端）改走"下载"而非"本机打开"。
  return { ok: false, mode: 'unsupported' };
}

module.exports = { openLocal };
