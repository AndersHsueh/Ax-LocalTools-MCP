# 1. 切换到官方registry
npm config set registry https://registry.npmjs.org/

# 2. 登录
npm login

# 3. 验证登录
npm whoami

# 4. 更新版本号到3.0.0（根据您的标签MCP-Named-R1）
# 已经在前面的回复中提供了package.json的更新

# 5. 提交代码并创建标签
git add .
git commit -m "chore: prepare for release MCP-Named-R1"
git tag -a MCP-Named-R1 -m "Release MCP-Named-R1"
git push origin MCP-Named-R1
git push origin main

# 6. 发布
npm publish

# 7. 验证发布
npm info ax-local-operations-mcp

# 8. （可选）切换回国内镜像
npm config set registry https://registry.npmmirror.com/

