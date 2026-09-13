/**
 * 模块 3／5：files 安全 · 单元级断言（G9）
 * ------------------------------------------------------------------
 * 说明（避免与既有 e2e 脚本重复）：批 1 的 `scripts/test-upload-security.cjs`
 * 已在端到端层面覆盖「路径穿越载荷 / 白名单扩展名 / 50MB 边界 / 本机打开策略」。
 * 本文件**不重复**那批断言，只在测试框架里补**更细的单元级不变量**：
 *   · resolvePath 的返回语义：非字符串/空 → null；文件不存在 → null；非法路径 → 抛 400；
 *   · save 的内容完整性：落盘字节 == base64 解码结果，哈希 == SHA-256，size == 解码字节数；
 *   · 文件名净化契约：落盘名只含 [A-Za-z0-9._-]、保留扩展名、不产生额外路径分隔；
 *   · 「解析结果永不出 uploadsDir」不变量的补充输入（Unicode / 大写 / 多斜杠 / 绝对 URL）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createTempDb, cleanupTempDb } from '../helpers/dbHarness.js';

let env;
let files;

beforeAll(() => {
  env = createTempDb('gs-files');
  files = env.require('../../server/services/files.cjs');
});

afterAll(() => {
  cleanupTempDb(env);
});

describe('模块 3：files.resolvePath 返回语义', () => {
  it('非字符串 / 空值一律返回 null（而非抛错）', () => {
    for (const v of ['', null, undefined, 123, {}, []]) {
      expect(files.resolvePath(v)).toBeNull();
    }
  });

  it('文件名不存在（合法形态）返回 null，而不是抛错', () => {
    expect(files.resolvePath('/uploads/definitely-missing.pdf')).toBeNull();
  });

  it('非法路径（无有效文件名）统一抛 400', () => {
    const bad = ['/uploads/', '/uploads/.', '/uploads/..', '/uploads/..%5C../x'];
    for (const p of bad) {
      let code = null;
      try { files.resolvePath(p); } catch (e) { code = e.statusCode; }
      expect(code, `入参 ${p} 应抛 400`).toBe(400);
    }
  });

  it('合法且存在的文件返回绝对路径，且必落在 uploadsDir 内', () => {
    fs.writeFileSync(path.join(env.uploadsDir, 'exists.pdf'), 'x');
    const abs = files.resolvePath('/uploads/exists.pdf');
    expect(path.isAbsolute(abs)).toBe(true);
    expect(path.resolve(abs).startsWith(path.resolve(env.uploadsDir) + path.sep)).toBe(true);
  });

  it('不变量：解析结果永不出 uploadsDir（补充输入：Unicode / 大写 / 多斜杠 / 绝对 URL）', () => {
    const uploadsAbs = path.resolve(env.uploadsDir) + path.sep;
    const inputs = [
      '/uploads/设计稿.PDF',
      '/uploads/A.PDF',
      'http://127.0.0.1:3001/uploads/ok.pdf',
      '/uploads//ok.pdf',
      '/uploads/sub/ok.pdf',
      '/uploads/./ok.pdf',
    ];
    for (const p of inputs) {
      let resolved = null;
      let threw = false;
      try { resolved = files.resolvePath(p); } catch { threw = true; }
      const safe = threw || resolved === null || path.resolve(resolved).startsWith(uploadsAbs);
      expect(safe, `入参 ${p} 解析结果逃逸出 uploadsDir`).toBe(true);
    }
  });
});

describe('模块 3：files.save 内容完整性与净化契约', () => {
  it('落盘字节 == base64 解码结果；hash == SHA-256；size == 解码字节数', () => {
    const raw = Buffer.from('制单师-内容完整性校验');
    const b64 = raw.toString('base64');
    const res = files.save('content.pdf', b64);
    const disk = fs.readFileSync(path.join(env.uploadsDir, path.basename(res.url)));
    expect(Buffer.compare(disk, raw)).toBe(0);
    expect(res.hash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
    expect(res.size).toBe(raw.length);
    expect(res.url.startsWith('/uploads/')).toBe(true);
  });

  it('落盘文件名已净化：仅含 [A-Za-z0-9._-]、保留扩展名、无额外路径分隔', () => {
    const res = files.save('设计 稿 01.PDF', Buffer.from('x').toString('base64'));
    const base = path.basename(res.url);
    expect(base).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(path.extname(base).toLowerCase()).toBe('.pdf');
    // url 只应有 /uploads/ 一段前缀，文件名内不再含分隔符
    expect(res.url.split('/').filter(Boolean).length).toBe(2);
  });

  it('含路径分隔符的文件名不会造成目录逃逸（被压平为单段名）', () => {
    const res = files.save('a/b/c.pdf', Buffer.from('y').toString('base64'));
    const base = path.basename(res.url);
    expect(base).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(res.url.split('/').filter(Boolean).length).toBe(2);
    expect(fs.existsSync(path.join(env.uploadsDir, base))).toBe(true);
  });

  it('白名单大小写不敏感：大写扩展名照常放行并落盘真实文件', () => {
    const res = files.save('UPPER.PNG', Buffer.from('z').toString('base64'));
    expect(fs.existsSync(path.join(env.uploadsDir, path.basename(res.url)))).toBe(true);
  });
});
