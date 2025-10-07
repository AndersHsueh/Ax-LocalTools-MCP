/**
 * 文件压缩/解压工具模块
 * 支持ZIP、TAR、GZ格式的压缩和解压
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class FileArchiveTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
  const { operation, source, destination, format = 'zip', output_format = 'text' } = args;

    // 字符白名单：字母数字、下划线、点、连字符、斜杠（不允许分号/换行等）
    const safePattern = /^[A-Za-z0-9._\-\/]+$/;
    if (!safePattern.test(source) || (destination && !safePattern.test(destination))) {
      throw ERR.INVALID_ARGS('路径包含非法字符（仅允许 A-Z a-z 0-9 . _ - /）');
    }

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(source) || (destination && !this.securityValidator.isPathAllowed(destination))) {
      throw ERR.PATH_DENIED(source);
    }

    // 验证格式
    const supportedFormats = ['zip', 'tar', 'gz', 'tar.gz'];
    if (!supportedFormats.includes(format.toLowerCase())) {
      throw new Error(`不支持的压缩格式: ${format}。支持的格式: ${supportedFormats.join(', ')}`);
    }

    try {
      switch (operation) {
        case 'compress':
          return await this.compress(source, destination, format, output_format);
        case 'extract':
          return await this.extract(source, destination, output_format);
        default:
          throw ERR.INVALID_ARGS(`不支持的操作类型: ${operation}`);
      }
    } catch (error) {
      if (error.code && error.code.startsWith('E_')) throw error;
      throw ERR.INVALID_ARGS(`压缩/解压操作失败: ${error.message}`);
    }
  }

  async compress(source, destination, format, outputFormat) {
    const sourcePath = this.securityValidator.resolveAndAssert(source);
    const destPath = destination ? this.securityValidator.resolveAndAssert(destination) : this.generateArchiveName(sourcePath, format);
    let cmd; let args;
    switch (format.toLowerCase()) {
      case 'zip':
        cmd = 'zip'; args = ['-r', destPath, path.basename(sourcePath)];
        break;
      case 'tar':
        cmd = 'tar'; args = ['-cf', destPath, path.basename(sourcePath)];
        break;
      case 'gz':
        // 简化：使用 gzip 压单文件
        cmd = 'gzip'; args = ['-c', sourcePath];
        break;
      case 'tar.gz':
        cmd = 'tar'; args = ['-czf', destPath, path.basename(sourcePath)];
        break;
      default:
        throw ERR.INVALID_ARGS(`不支持的压缩格式: ${format}`);
    }
    const cwd = path.dirname(sourcePath);
    await this.runProcess(cmd, args, { cwd, pipeTo: format === 'gz' ? destPath : null });
    const stats = await fs.stat(destPath);
    const info = { action: 'compress', format: format.toUpperCase(), source: sourcePath, archive: destPath, size: stats.size };
    return buildOutput(outputFormat, `压缩成功:\n源文件: ${info.source}\n压缩文件: ${info.archive}\n格式: ${info.format}\n大小: ${info.size} 字节`, info);
  }

  async extract(source, destination, outputFormat) {
    const sourcePath = this.securityValidator.resolveAndAssert(source);
    const destPath = destination ? this.securityValidator.resolveAndAssert(destination) : path.dirname(sourcePath);
    await fs.mkdir(destPath, { recursive: true });
    if (sourcePath.endsWith('.zip')) {
      await this.runProcess('unzip', [sourcePath, '-d', destPath]);
    } else if (sourcePath.endsWith('.tar')) {
      await this.runProcess('tar', ['-xf', sourcePath, '-C', destPath]);
    } else if (sourcePath.endsWith('.tar.gz')) {
      await this.runProcess('tar', ['-xzf', sourcePath, '-C', destPath]);
    } else if (sourcePath.endsWith('.gz')) {
      const out = path.join(destPath, path.basename(sourcePath, '.gz'));
      await this.runProcess('gunzip', ['-c', sourcePath], { pipeTo: out });
    } else {
      throw ERR.INVALID_ARGS('无法识别的压缩文件格式');
    }
    const info = { action: 'extract', source: sourcePath, destination: destPath };
    return buildOutput(outputFormat, `解压成功:\n压缩文件: ${info.source}\n解压到: ${info.destination}`, info);
  }

  generateArchiveName(source, format) {
    const sourcePath = path.resolve(source);
    const baseName = path.basename(sourcePath);
    const dirName = path.dirname(sourcePath);
    
    let extension;
    switch (format.toLowerCase()) {
      case 'zip':
        extension = '.zip';
        break;
      case 'tar':
        extension = '.tar';
        break;
      case 'gz':
        extension = '.gz';
        break;
      case 'tar.gz':
        extension = '.tar.gz';
        break;
    }
    
    return path.join(dirName, `${baseName}${extension}`);
  }

  runProcess(command, args, { cwd, pipeTo } = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd });
      let stderr = '';
      let stdout = '';
      if (pipeTo) {
        const fsStream = require('fs').createWriteStream(pipeTo);
        proc.stdout.pipe(fsStream);
      } else {
        proc.stdout.on('data', d => { stdout += d.toString(); });
      }
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('error', err => reject(err));
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(stderr || `进程退出码 ${code}`));
        resolve({ stdout, stderr });
      });
    });
  }
}

module.exports = FileArchiveTool;
