/**
 * 文件压缩/解压工具模块
 * 支持ZIP、TAR、GZ格式的压缩和解压
 * 注意：Windows 上需要 PATH 中有 zip/unzip/tar/gzip（Git Bash、WSL 或手动安装）
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
    const {
      operation,
      source,
      destination,
      format = 'zip',
      working_directory,
      working_dir,
      output_format = 'text'
    } = args;

    const workDir = working_directory || working_dir;

    if (!source) throw ERR.INVALID_ARGS('缺少 source 参数');

    // 安全验证：通过 resolveAndAssert 解析路径，不做字符白名单（支持 Windows 路径）
    let sourcePath, destPath;
    try {
      sourcePath = this.securityValidator.resolveAndAssert(source, workDir);
    } catch (e) {
      throw ERR.PATH_DENIED(source);
    }
    if (destination) {
      try {
        destPath = this.securityValidator.resolveAndAssert(destination, workDir);
      } catch (e) {
        throw ERR.PATH_DENIED(destination);
      }
    }

    // 验证格式
    const supportedFormats = ['zip', 'tar', 'gz', 'tar.gz'];
    if (!supportedFormats.includes(format.toLowerCase())) {
      throw ERR.INVALID_ARGS(`不支持的压缩格式: ${format}。支持的格式: ${supportedFormats.join(', ')}`);
    }

    try {
      switch (operation) {
        case 'compress':
          return await this.compress(sourcePath, destPath, format, output_format);
        case 'extract':
          return await this.extract(sourcePath, destPath, output_format);
        default:
          throw ERR.INVALID_ARGS(`不支持的操作类型: ${operation}`);
      }
    } catch (error) {
      if (error.code && error.code.startsWith('E_')) throw error;
      throw ERR.INVALID_ARGS(`压缩/解压操作失败: ${error.message}`);
    }
  }

  async compress(sourcePath, destPath, format, outputFormat) {
    const finalDest = destPath || this.generateArchiveName(sourcePath, format);
    let cmd, args;

    switch (format.toLowerCase()) {
      case 'zip':
        cmd = 'zip'; args = ['-r', finalDest, path.basename(sourcePath)];
        break;
      case 'tar':
        cmd = 'tar'; args = ['-cf', finalDest, path.basename(sourcePath)];
        break;
      case 'gz':
        cmd = 'gzip'; args = ['-c', sourcePath];
        break;
      case 'tar.gz':
        cmd = 'tar'; args = ['-czf', finalDest, path.basename(sourcePath)];
        break;
      default:
        throw ERR.INVALID_ARGS(`不支持的压缩格式: ${format}`);
    }

    const cwd = path.dirname(sourcePath);
    await this.runProcess(cmd, args, { cwd, pipeTo: format === 'gz' ? finalDest : null });
    const stats = await fs.stat(finalDest);
    const info = {
      action: 'compress',
      format: format.toUpperCase(),
      source: sourcePath,
      archive: finalDest,
      size: stats.size
    };
    return buildOutput(
      outputFormat,
      `压缩成功:\n源文件: ${info.source}\n压缩文件: ${info.archive}\n格式: ${info.format}\n大小: ${info.size} 字节`,
      info
    );
  }

  async extract(sourcePath, destPath, outputFormat) {
    const finalDest = destPath || path.dirname(sourcePath);
    await fs.mkdir(finalDest, { recursive: true });

    const src = sourcePath.toLowerCase();
    if (src.endsWith('.zip')) {
      await this.runProcess('unzip', [sourcePath, '-d', finalDest]);
    } else if (src.endsWith('.tar.gz') || src.endsWith('.tgz')) {
      await this.runProcess('tar', ['-xzf', sourcePath, '-C', finalDest]);
    } else if (src.endsWith('.tar')) {
      await this.runProcess('tar', ['-xf', sourcePath, '-C', finalDest]);
    } else if (src.endsWith('.gz')) {
      const out = path.join(finalDest, path.basename(sourcePath, '.gz'));
      await this.runProcess('gunzip', ['-c', sourcePath], { pipeTo: out });
    } else {
      throw ERR.INVALID_ARGS('无法识别的压缩文件格式（支持 .zip .tar .tar.gz .gz）');
    }

    const info = { action: 'extract', source: sourcePath, destination: finalDest };
    return buildOutput(
      outputFormat,
      `解压成功:\n压缩文件: ${info.source}\n解压到: ${info.destination}`,
      info
    );
  }

  generateArchiveName(sourcePath, format) {
    const baseName = path.basename(sourcePath);
    const dirName = path.dirname(sourcePath);
    const ext = { zip: '.zip', tar: '.tar', gz: '.gz', 'tar.gz': '.tar.gz' }[format.toLowerCase()] || '.zip';
    return path.join(dirName, `${baseName}${ext}`);
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
      proc.on('error', err => {
        if (err.code === 'ENOENT') {
          reject(new Error(`命令未找到: ${command}。Windows 上请确保 PATH 中有 ${command}（Git Bash、WSL 或手动安装）`));
        } else {
          reject(err);
        }
      });
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(stderr || `进程退出码 ${code}`));
        resolve({ stdout, stderr });
      });
    });
  }
}

module.exports = FileArchiveTool;
