# 发布与分发指南

本文指导如何将本 MCP 服务器以无需源码的方式分发给用户，包括发布到 npm、GitHub Packages，并提供 Homebrew/NPM 双通道的可选包装方案。

## 1. 发布到 npm（推荐）

### 1.1 准备工作
- 确保 `package.json` 已包含：
  - `name: local-file-operation-mcp`
  - `version`
  - `bin: { "local-file-operation-mcp": "bin/cli.js" }`
  - `files` 字段包含 `index.js`、`tools/`、`README.md` 等
  - `engines.node: ">=18.0.0"`
  - `publishConfig.access: public`
- `index.js` 顶部包含 shebang：`#!/usr/bin/env node`
- 本地测试：`node index.js` 与 `npx .` 均可正常输出

### 1.2 登录与发布
```bash
# 登录 npm（如未登录）
npm login

# 版本号自增（示例：补丁版）
npm version patch -m "chore(release): v%s"

# 发布到 npm（公共包）
npm publish --access public
```

### 1.3 验证安装
```bash
# 全局安装
yarn global add local-file-operation-mcp || npm install -g local-file-operation-mcp

# 运行
local-file-operation-mcp --help || local-file-operation-mcp

# 或者使用 npx
npx -y local-file-operation-mcp
```

## 2. GitHub Packages（企业/内网可选）

### 2.1 配置
在 `package.json` 添加或调整：
```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<your-org>/<repo>.git"
  }
}
```

### 2.2 发布
```bash
# 配置 npm registry（只对当前项目生效）
npm config set @<your-org>:registry https://npm.pkg.github.com

# 设置 GitHub Token（需要 write:packages 权限）
export NODE_AUTH_TOKEN="<GITHUB_TOKEN>"

# 发布
yarn npm publish || npm publish
```

### 2.3 使用
```bash
# .npmrc（全局或项目）
@<your-org>:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<GITHUB_TOKEN>

# 安装
npm install -g @<your-org>/local-file-operation-mcp
```

## 3. Homebrew 包装（可选）

如需为 macOS 用户提供 `brew install` 体验，可创建一个 tap：

### 3.1 创建 Formula（示例）
```ruby
class LocalFileOperationMcp < Formula
  desc "Local file operation MCP server"
  homepage "https://github.com/<your-org>/<repo>"
  url "https://registry.npmjs.org/local-file-operation-mcp/-/local-file-operation-mcp-2.0.2.tgz"
  sha256 "<fill-after-publish>"
  license "MIT"

  depends_on "node@18"

  def install
    system "npm", "install", "-g", "local-file-operation-mcp@#{version}"
    bin.install_symlink Dir.glob("/usr/local/bin/local-file-operation-mcp").first => "local-file-operation-mcp"
  end

  test do
    system "#{bin}/local-file-operation-mcp", "--version"
  end
end
```

> 备注：也可以使用 `brew npm` 社区工具或在 Formula 中通过 `resource` + `npm ci` 方式安装。

## 4. 兼容与回退方案
- 若用户无法访问 npm：
  - 提供 GitHub Releases 的打包 tgz（`npm pack` 生成）
  - 指引使用 `npm install -g local-file-operation-mcp-<version>.tgz`
- 若仅支持 `stdio` 启动：保留 `index.js` 标准入口即可
- 若客户端只接受绝对路径命令：提示用户通过 `which local-file-operation-mcp` 获取路径

## 5. 常见问题（FAQ）
- Q：npx 启动慢？
  - A：建议全局安装 `npm i -g local-file-operation-mcp`，或在企业环境设私有镜像加速
- Q：如何锁定版本？
  - A：LM Studio/Qwen 配置中将命令改为 `npx -y local-file-operation-mcp@2.0.2`
- Q：需要额外依赖吗？
  - A：仅需 Node.js 18+。依赖由 npm 自动安装。

## 6. 在中国大陆环境登录/发布（镜像切换指引）

若 `npm login` 跳转到 `registry.npmmirror.com`/CNPM 并提示 “Public registration is not allowed”，说明当前 registry 指向了镜像站。请临时切换到官方 npmjs 进行登录与发布：

```bash
# 查看当前 registry
npm config get registry

# 临时切换为官方 npmjs（只影响当前 shell，建议优先使用这种方式）
npm config set registry https://registry.npmjs.org

# 再次登录/发布
npm login
npm publish --access public

# 验证发布地址
npm view local-file-operation-mcp dist-tags versions

# 如需恢复到国内镜像（可选）
npm config set registry https://registry.npmmirror.com
```

为避免误发到镜像，`package.json` 已设置：

```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

如果公司使用私有 npm（如 Nexus、Verdaccio），请在发布时确保使用官方 registry，安装时可切换回私有源/镜像源以加速下载。

---

完成上述配置后，用户可通过：
- `npm install -g local-file-operation-mcp`，或
- `npx -y local-file-operation-mcp`

直接使用本 MCP 服务器，无需下载源码与手动配置路径。

---

# 开发约定（新增）

## 1. 模块结构
```
lib/
  pathUtils.js         # 统一路径解析 & 主目录断言
  commandPolicy.js     # 命令分级策略
errors.js              # ToolError + 错误工厂
responses.js           # 输出封装 (text/json/both)
tools/                 # 各工具（逐步拆分注册）
```

## 2. 路径策略
- 所有外部传入的 `path` / `source` / `destination` 必须经 `securityValidator.resolveAndAssert`
- 若越界抛 `ERR.PATH_DENIED()`
- 新增的工具严禁自行 `path.resolve()` 后绕过断言

## 3. 命令策略扩展
`lib/commandPolicy.js` 采用简单数组 + 正则：
```js
const DENY = [/\bpasswd\b/i];
const WARN = [/\brm\s+-rf\b/i];
```
扩展步骤：
1. 添加正则到对应数组
2. 若需动态策略（企业白名单）可读取 `process.env.MCP_CMD_POLICY_FILE` JSON
3. 保持 evaluate 返回结构：`{ level, reason }`

## 4. 错误码约定
| Code | 场景 |
|------|------|
| E_PATH_DENIED | 路径越界或不允许 |
| E_NOT_FOUND | 文件/目录不存在 |
| E_INVALID_ARGS | 参数非法 / 操作不支持 |
| E_DANGEROUS_CMD | 被策略 deny 的命令 |
| E_LIMIT_REACHED | 超出递归/配额限制 |

工具内部抛出：`throw ERR.NOT_FOUND(p)` 等；入口层（未来）集中捕获映射到协议响应。

## 5. 递归 & 资源限制
- `file_permissions`: 默认 `max_depth = 5`；可调整参数传入
- 未来：`file_search` 将新增 `timeout_ms`, `max_depth`, `ignore[]`

## 6. 压缩/解压安全
- 禁止再引入 `exec("zip ...")` 拼接
- 所有进程调用统一使用 `spawn(command, args, { cwd })`

## 7. 输出格式
统一走 `responses.text/json/both`，避免重复构建 `{ content: [...] }`。

## 8. 测试建议（待补充 Phase 1）
| 模块 | 用例要点 |
|------|----------|
| pathUtils | 相对/绝对/越界路径 |
| commandPolicy | deny/warn/allow 分支 |
| fileOperation | read/write/list/delete 正常 & ENOENT |
| commandExecution | warn 未 confirm；confirm 后执行 |
| filePermissions | 深度限制触发 E_LIMIT_REACHED |

## 9. 发布 & 版本策略
- 采用语义化版本：修复补丁 -> patch；向后兼容功能 -> minor；破坏性改动 -> major
- 预发布标签：`v2.1.0-alpha.n` / `beta` / `rc`
- 推荐引入 `semantic-release`（后续自动生成 CHANGELOG）

## 10. 后续重构计划（概述）
- 工具注册表 `tools/registry.js` 自动扫描并暴露 descriptors
- 添加 `dispose()` 钩子（watch/任务持久化）
- 指标采集（调用耗时 / 错误频率）

---

本文档新增“开发约定”章节反映近期安全与结构演进，更新日期：2025-09-26。

---

# 版本发布流程（semantic-release）

已集成 semantic-release 自动化发布：

## 分支策略
- main: 稳定分支（产生正式版本）
- develop: 预发布（未加标签，仅生成预发行版本号但默认配置不发布，如需发布可改为 prerelease 分支）
- alpha / beta: 预发布渠道，对应 `alpha` / `beta` 先行版本（例如 2.2.0-alpha.1）

## 提交规范（Conventional Commits）
格式：`<type>(scope?): <description>`
支持 type：feat / fix / docs / refactor / perf / test / chore / build / ci
破坏性变更：在正文或脚注加入 `BREAKING CHANGE:` 描述

## 版本号规则
- feat => 次版本 (minor)
- fix / perf => 补丁 (patch)
- BREAKING CHANGE => 主版本 (major)
- 预发布：在 alpha / beta 分支触发，生成 `x.y.z-alpha.n`

## 运行方式
CI 中执行：
```
npm ci
npm run release
```
本地 dry-run（不推送、不改文件）：
```
npx semantic-release --dry-run
```

## 输出内容
- 更新 `CHANGELOG.md`
- 更新 `package.json` version
- 发布到 npm（需配置 `NPM_TOKEN` 环境变量）
- 创建 Git tag & 生成 Release Notes

## 必要环境变量（CI）
- `GITHUB_TOKEN`：允许创建 Release / Tag
- `NPM_TOKEN`：允许 npm 发布

## 初次迁移注意
当前 `package.json` 手动维护版本；第一次使用 semantic-release 后请避免再手工修改 version 字段。

---