// 服务器集中配置（G17 · 前后端拆分"留缝"）
//
// 目的：把原先散落在 index.cjs 里的「端口 / CORS 白名单 / 路径前缀 / 体积上限」
// 收敛到一处常量表，为将来拆分服务器端时集中调整留出唯一入口。
//
// 约定（硬约束）：
//   - 这里只做"搬家"，**值与原实现逐字等价**，不改变任何运行行为；
//   - **不引入新的环境变量要求**（保持单机开箱即用）；
//   - 仅集中"对象稳定"的基础常量，不在这里预写任何业务/多租户/多库配置。
'use strict';

/** 后端默认端口（Electron main.js 亦显式传入 3001，二者一致） */
const DEFAULT_PORT = 3001;

/** CORS 白名单：允许的回环主机名 */
const ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

/** CORS 白名单：允许的端口（'' = URL 未显式带端口；5173 = Vite dev；3001 = 生产同源） */
const ALLOWED_PORTS = ['', '5173', '3001'];

/** 上传文件静态挂载路径 */
const UPLOADS_MOUNT_PATH = '/uploads';

/** 交给后端处理的 API 路径前缀（用于 SPA 回退时排除） */
const API_PATH_PREFIX = '/api/';

/** 上传资源路径前缀（用于 SPA 回退时排除） */
const UPLOADS_PATH_PREFIX = '/uploads/';

/** 打包后前端产物目录（相对 server/ 目录） */
const DIST_DIR_REL = '../dist';

/** 请求体大小上限（支持 base64 大文件，含 dxf 等专业格式） */
const JSON_BODY_LIMIT = '100mb';

/** 请求日志：超过此体积不序列化 body，仅记字节数 */
const LOG_BODY_MAX_BYTES = 2000;

module.exports = {
  DEFAULT_PORT,
  ALLOWED_HOSTS,
  ALLOWED_PORTS,
  UPLOADS_MOUNT_PATH,
  API_PATH_PREFIX,
  UPLOADS_PATH_PREFIX,
  DIST_DIR_REL,
  JSON_BODY_LIMIT,
  LOG_BODY_MAX_BYTES,
};
