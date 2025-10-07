# Changelog

本文件由 semantic-release 自动维护。请使用 Conventional Commits 规范提交：
- feat: 新功能
- fix: 缺陷修复
- docs: 文档变更
- refactor: 重构（无功能变化、无修复）
- perf: 性能优化
- test: 测试相关
- chore: 构建/依赖/工具调整
- BREAKING CHANGE: 在正文或脚注标记破坏性更新

## 2.1.0-alpha.1 (预置)
- refactor: 统一路径解析与安全校验（pathUtils + securityValidator）
- feat: 命令策略分级 deny/warn/allow
- feat: file_permissions 递归深度限制 max_depth 默认 5
- refactor: file_archive 使用 spawn 防注入
- feat: file_search 增加 max_depth/timeout_ms/ignore
- docs: 增补安全模型与开发约定章节
