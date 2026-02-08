const EnvironmentMemoryAdapter = require('./tools/environmentMemoryAdapter.js');
const SecurityValidator = require('./tools/securityValidator.js');

// 创建安全验证器和环境记忆适配器
const securityValidator = new SecurityValidator();
const envMemory = new EnvironmentMemoryAdapter(securityValidator);

// 测试读取环境变量
async function testReadEnvironment() {
  console.log('测试读取环境变量:');
  try {
    const result = await envMemory.handle({ operation: 'read' });
    console.log(result.content[0].text);
  } catch (error) {
    console.error('读取环境变量时出错:', error.message);
  }
}

// 测试更新环境变量
async function testUpdateEnvironment() {
  console.log('\n测试更新环境变量:');
  try {
    const result = await envMemory.handle({ 
      operation: 'update', 
      key: 'TEST_VAR', 
      value: 'test_value',
      description: '测试环境变量' 
    });
    console.log(result.content[0].text);
  } catch (error) {
    console.error('更新环境变量时出错:', error.message);
  }
}

// 测试获取特定环境变量
async function testGetEnvironment() {
  console.log('\n测试获取特定环境变量:');
  try {
    const result = await envMemory.handle({ 
      operation: 'get', 
      key: 'TEST_VAR' 
    });
    console.log(result.content[0].text);
  } catch (error) {
    console.error('获取环境变量时出错:', error.message);
  }
}

// 运行测试
async function runTests() {
  await testReadEnvironment();
  await testUpdateEnvironment();
  await testGetEnvironment();
}

runTests().catch(console.error);