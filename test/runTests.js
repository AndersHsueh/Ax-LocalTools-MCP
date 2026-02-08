#!/usr/bin/env node

/**
 * 跨平台兼容性测试运行器
 * 执行测试套件并生成报告
 */

const path = require('path');
const fs = require('fs').promises;
const CrossPlatformTestSuite = require('./crossPlatformTestSuite');

/**
 * 测试报告生成器
 */
class TestReportGenerator {
  constructor(report) {
    this.report = report;
  }

  generateTextReport() {
    const { summary, results, platform } = this.report;
    
    let output = '';
    output += '='.repeat(80) + '\n';
    output += '              MCP 跨平台兼容性测试报告\n';
    output += '='.repeat(80) + '\n\n';
    
    // 平台信息
    output += `测试平台: ${platform.platform}\n`;
    output += `系统架构: ${platform.architecture}\n`;
    output += `Node.js版本: ${platform.nodeVersion}\n`;
    output += `测试时间: ${new Date(summary.startTime).toLocaleString()}\n`;
    output += `测试耗时: ${summary.duration}ms\n\n`;
    
    // 测试总结
    output += '测试总结:\n';
    output += '-'.repeat(40) + '\n';
    output += `总测试数: ${summary.total}\n`;
    output += `通过: ${summary.passed} (${Math.round(summary.passed/summary.total*100)}%)\n`;
    output += `失败: ${summary.failed} (${Math.round(summary.failed/summary.total*100)}%)\n`;
    output += `跳过: ${summary.skipped} (${Math.round(summary.skipped/summary.total*100)}%)\n\n`;
    
    // 分类统计
    const categories = {};
    results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = { passed: 0, failed: 0, skipped: 0, total: 0 };
      }
      categories[result.category][result.status]++;
      categories[result.category].total++;
    });
    
    output += '分类统计:\n';
    output += '-'.repeat(40) + '\n';
    Object.entries(categories).forEach(([category, stats]) => {
      const successRate = Math.round(stats.passed / stats.total * 100);
      output += `${category}: ${stats.passed}/${stats.total} (${successRate}%)\n`;
    });
    output += '\n';
    
    // 失败的测试详情
    const failedTests = results.filter(r => r.status === 'failed');
    if (failedTests.length > 0) {
      output += '失败测试详情:\n';
      output += '-'.repeat(40) + '\n';
      failedTests.forEach((test, index) => {
        output += `${index + 1}. ${test.testName} (${test.category})\n`;
        if (test.details.error) {
          output += `   错误: ${test.details.error}\n`;
        }
        output += `   时间: ${test.timestamp}\n\n`;
      });
    }
    
    // 跳过的测试
    const skippedTests = results.filter(r => r.status === 'skipped');
    if (skippedTests.length > 0) {
      output += '跳过测试:\n';
      output += '-'.repeat(40) + '\n';
      skippedTests.forEach((test, index) => {
        output += `${index + 1}. ${test.testName} (${test.category})\n`;
        if (test.details.reason) {
          output += `   原因: ${test.details.reason}\n`;
        }
        output += '\n';
      });
    }
    
    // 成功的测试（仅显示关键信息）
    const passedTests = results.filter(r => r.status === 'passed');
    if (passedTests.length > 0) {
      output += `通过测试 (${passedTests.length}项):\n`;
      output += '-'.repeat(40) + '\n';
      
      // 按分类显示
      Object.keys(categories).forEach(category => {
        const categoryPassed = passedTests.filter(t => t.category === category);
        if (categoryPassed.length > 0) {
          output += `${category}: `;
          output += categoryPassed.map(t => t.testName).join(', ') + '\n';
        }
      });
      output += '\n';
    }
    
    // 性能数据
    const perfTests = results.filter(r => r.category === '性能测试' && r.status === 'passed');
    if (perfTests.length > 0) {
      output += '性能测试结果:\n';
      output += '-'.repeat(40) + '\n';
      perfTests.forEach(test => {
        if (test.details.opsPerSecond) {
          output += `${test.testName}: ${test.details.opsPerSecond} ops/sec\n`;
        }
      });
      output += '\n';
    }
    
    // 建议和注意事项
    output += '建议和注意事项:\n';
    output += '-'.repeat(40) + '\n';
    
    if (summary.failed > 0) {
      output += '• 发现失败测试，请检查相关功能的平台兼容性\n';
    }
    
    if (platform.platform === 'linux') {
      output += '• Linux平台建议配置sudo无密码访问以支持系统级操作\n';
    }
    
    if (platform.platform === 'win32') {
      output += '• Windows平台建议以管理员权限运行以支持完整功能\n';
    }
    
    output += '• 定期运行测试套件以确保跨平台兼容性\n';
    output += '• 查看详细的JSON报告了解更多技术细节\n\n';
    
    output += '='.repeat(80) + '\n';
    output += '                     测试完成\n';
    output += '='.repeat(80) + '\n';
    
    return output;
  }

  generateJSONReport() {
    return JSON.stringify(this.report, null, 2);
  }

  generateHTMLReport() {
    const { summary, results, platform } = this.report;
    
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP 跨平台兼容性测试报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; }
        .metric { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex: 1; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 2em; font-weight: bold; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .skipped { color: #ffc107; }
        .test-results { margin-top: 20px; }
        .test-category { margin-bottom: 20px; background: white; padding: 15px; border-radius: 5px; }
        .test-item { padding: 10px; margin: 5px 0; border-left: 4px solid #ddd; }
        .test-item.passed { border-left-color: #28a745; background: #f8fff9; }
        .test-item.failed { border-left-color: #dc3545; background: #fff8f8; }
        .test-item.skipped { border-left-color: #ffc107; background: #fffdf7; }
        .details { font-size: 0.9em; color: #666; margin-top: 5px; }
        .platform-info { background: #e9ecef; padding: 10px; border-radius: 3px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>MCP 跨平台兼容性测试报告</h1>
        <div class="platform-info">
            <strong>平台:</strong> ${platform.platform} | 
            <strong>架构:</strong> ${platform.architecture} | 
            <strong>Node.js:</strong> ${platform.nodeVersion} | 
            <strong>测试时间:</strong> ${new Date(summary.startTime).toLocaleString()}
        </div>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>总测试数</h3>
            <div class="value">${summary.total}</div>
        </div>
        <div class="metric">
            <h3>通过率</h3>
            <div class="value passed">${Math.round(summary.passed/summary.total*100)}%</div>
        </div>
        <div class="metric">
            <h3>失败数</h3>
            <div class="value failed">${summary.failed}</div>
        </div>
        <div class="metric">
            <h3>耗时</h3>
            <div class="value">${summary.duration}ms</div>
        </div>
    </div>

    <div class="test-results">
        ${this.generateCategoryHTML(results)}
    </div>

    <script>
        // 添加交互功能
        document.querySelectorAll('.test-item').forEach(item => {
            item.addEventListener('click', function() {
                const details = this.querySelector('.details');
                if (details) {
                    details.style.display = details.style.display === 'none' ? 'block' : 'none';
                }
            });
        });
    </script>
</body>
</html>`;
    
    return html;
  }

  generateCategoryHTML(results) {
    const categories = {};
    results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    });

    return Object.entries(categories).map(([category, tests]) => {
      const passed = tests.filter(t => t.status === 'passed').length;
      const total = tests.length;
      
      return `
        <div class="test-category">
            <h3>${category} (${passed}/${total})</h3>
            ${tests.map(test => `
                <div class="test-item ${test.status}">
                    <strong>${test.testName}</strong>
                    <span class="status ${test.status}">${test.status.toUpperCase()}</span>
                    ${test.details && Object.keys(test.details).length > 0 ? `
                        <div class="details" style="display: none;">
                            <pre>${JSON.stringify(test.details, null, 2)}</pre>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
      `;
    }).join('');
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('启动 MCP 跨平台兼容性测试...\n');
  
  try {
    // 运行测试套件
    const testSuite = new CrossPlatformTestSuite();
    const report = await testSuite.runAllTests();
    
    // 生成报告
    const reportGenerator = new TestReportGenerator(report);
    
    // 创建报告目录
    const reportDir = path.join(__dirname, 'reports');
    try {
      await fs.mkdir(reportDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const platform = report.platform.platform;
    
    // 保存文本报告
    const textReport = reportGenerator.generateTextReport();
    const textPath = path.join(reportDir, `test-report-${platform}-${timestamp}.txt`);
    await fs.writeFile(textPath, textReport);
    
    // 保存JSON报告
    const jsonReport = reportGenerator.generateJSONReport();
    const jsonPath = path.join(reportDir, `test-report-${platform}-${timestamp}.json`);
    await fs.writeFile(jsonPath, jsonReport);
    
    // 保存HTML报告
    const htmlReport = reportGenerator.generateHTMLReport();
    const htmlPath = path.join(reportDir, `test-report-${platform}-${timestamp}.html`);
    await fs.writeFile(htmlPath, htmlReport);
    
    // 输出结果
    console.log(textReport);
    console.log(`\n报告已保存到:`);
    console.log(`- 文本报告: ${textPath}`);
    console.log(`- JSON报告: ${jsonPath}`);
    console.log(`- HTML报告: ${htmlPath}`);
    
    // 退出码
    const exitCode = report.summary.failed > 0 ? 1 : 0;
    process.exit(exitCode);
    
  } catch (error) {
    console.error('测试运行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { TestReportGenerator };