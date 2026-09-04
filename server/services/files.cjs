// 文件(File) 业务服务层：设计稿存储与本地打开
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { getUploadsDir } = require('../db.cjs');

/** 生成安全文件名（保留扩展名，剔除非法字符） */
function safeFileName(filename) {
  return `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
}

/**
 * 保存 base64 上传文件到 uploads 目录
 * @param {string} filename - 原始文件名
 * @param {string} data - base64 编码内容
 * @returns {{url: string, hash: string, size: number}} url 访问地址 + SHA-256 指纹 + 字节数
 */
function save(filename, data) {
  if (!filename || !data) throw new Error('Missing filename or data');
  const safeName = safeFileName(filename);
  const filePath = path.join(getUploadsDir(), safeName);
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { url: `/uploads/${safeName}`, hash, size: buffer.length };
}

/**
 * 解析上传 URL 为磁盘绝对路径
 * @param {string} url - 如 /uploads/xxx.pdf
 * @returns {string|null} 绝对路径，文件不存在返回 null
 */
function resolvePath(url) {
  if (!url) return null;
  const filename = url.split('/').pop();
  const absolutePath = path.join(getUploadsDir(), filename);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

/**
 * 用本地默认程序打开文件
 * @param {string} url - 如 /uploads/xxx.pdf
 * @returns {{success: boolean}}
 */
function openLocally(url) {
  const absolutePath = resolvePath(url);
  if (!absolutePath) throw new Error('File not found on disk');
  exec(`start "" "${absolutePath}"`, (err) => {
    if (err) console.error('[Open Native Error]', err);
  });
  return { success: true };
}

module.exports = { save, resolvePath, openLocally };
