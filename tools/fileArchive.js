/**
 * 文件压缩/解压工具模块
 * 支持ZIP、TAR、GZ格式的压缩和解压
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class FileArchiveTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { operation, source, destination, format = 'zip' } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(source) || 
        (destination && !this.securityValidator.isPathAllowed(destination))) {
      throw new Error('不允许操作指定路径的文件');
    }

    // 验证格式
    const supportedFormats = ['zip', 'tar', 'gz', 'tar.gz'];
    if (!supportedFormats.includes(format.toLowerCase())) {
      throw new Error(`不支持的压缩格式: ${format}。支持的格式: ${supportedFormats.join(', ')}`);
    }

    try {
      switch (operation) {
        case 'compress':
          return await this.compress(source, destination, format);
        case 'extract':
          return await this.extract(source, destination);
        default:
          throw new Error(`不支持的操作类型: ${operation}`);
      }
    } catch (error) {
      throw new Error(`压缩/解压操作失败: ${error.message}`);
    }
  }

  async compress(source, destination, format) {
    const sourcePath = path.resolve(source);
    const destPath = destination ? path.resolve(destination) : this.generateArchiveName(source, format);
    
    let command;
    
    switch (format.toLowerCase()) {
      case 'zip':
        command = `zip -r "${destPath}" "${sourcePath}"`;
        break;
      case 'tar':
        command = `tar -cf "${destPath}" "${sourcePath}"`;
        break;
      case 'gz':
        command = `gzip -c "${sourcePath}" > "${destPath}"`;
        break;
      case 'tar.gz':
        command = `tar -czf "${destPath}" "${sourcePath}"`;
        break;
      default:
        throw new Error(`不支持的压缩格式: ${format}`);
    }

    await execAsync(command);
    
    const stats = await fs.stat(destPath);
    
    return {
      content: [
        {
          type: 'text',
          text: `压缩成功:\n源文件: ${sourcePath}\n压缩文件: ${destPath}\n格式: ${format.toUpperCase()}\n大小: ${stats.size} 字节`
        }
      ]
    };
  }

  async extract(source, destination) {
    const sourcePath = path.resolve(source);
    const destPath = destination ? path.resolve(destination) : path.dirname(sourcePath);
    
    // 确保目标目录存在
    await fs.mkdir(destPath, { recursive: true });
    
    const ext = path.extname(sourcePath).toLowerCase();
    let command;
    
    if (ext === '.zip') {
      command = `unzip "${sourcePath}" -d "${destPath}"`;
    } else if (ext === '.tar') {
      command = `tar -xf "${sourcePath}" -C "${destPath}"`;
    } else if (ext === '.gz') {
      command = `gunzip -c "${sourcePath}" > "${path.join(destPath, path.basename(sourcePath, '.gz'))}"`;
    } else if (sourcePath.endsWith('.tar.gz')) {
      command = `tar -xzf "${sourcePath}" -C "${destPath}"`;
    } else {
      throw new Error(`无法识别的压缩文件格式: ${ext}`);
    }

    await execAsync(command);
    
    return {
      content: [
        {
          type: 'text',
          text: `解压成功:\n压缩文件: ${sourcePath}\n解压到: ${destPath}`
        }
      ]
    };
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
}

module.exports = FileArchiveTool;
