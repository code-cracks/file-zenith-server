import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MulterFile } from '@webundsoehne/nest-fastify-file-upload';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;
  private readonly tempDir: string;
  private readonly chunksDir: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // 基本上传目录
    this.uploadDir = path.join(process.cwd(), 'uploads');
    // 临时目录，用于存储文件块
    this.tempDir = path.join(this.uploadDir, 'temp');
    // 文件块目录
    this.chunksDir = path.join(this.uploadDir, 'chunks');
    // 基础URL，用于返回文件访问地址
    this.baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:8080');

    // 确保目录存在
    this.ensureDirectoriesExist();
  }

  private async ensureDirectoriesExist() {
    try {
      await this.ensureDir(this.uploadDir);
      await this.ensureDir(this.tempDir);
      await this.ensureDir(this.chunksDir);
      await this.ensureDir(path.join(this.uploadDir, 'files'));
    } catch (error) {
      this.logger.error(`Failed to create directories: ${error.message}`);
      throw error;
    }
  }

  private async ensureDir(dir: string) {
    try {
      await fsPromises.stat(dir);
    } catch {
      await fsPromises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 处理文件块上传
   */
  async uploadChunk(
    file: MulterFile,
    fileId: string,
    chunkNumber: number,
    totalChunks: number,
    fileName: string,
    totalSize: number,
    mimeType: string,
    fileHash?: string,
  ) {
    try {
      this.logger.log(`开始处理文件块 ${chunkNumber}/${totalChunks} 文件ID: ${fileId}`);

      // 如果提供了文件哈希，先检查文件是否已存在
      if (fileHash) {
        this.logger.log(`检查文件是否已存在，哈希值: ${fileHash}`);

        const existingFile = await this.checkFileExists(fileHash);

        if (existingFile.exists && existingFile.fileInfo) {
          this.logger.log(`文件已存在，使用秒传功能: ${existingFile.fileInfo.url}`);

          return {
            success: true,
            chunkNumber,
            fileId,
            completed: true,
            fileUrl: existingFile.fileInfo.url,
            message: '文件已存在，使用秒传功能',
          };
        }
      }

      // 创建文件ID目录
      const fileChunkDir = path.join(this.chunksDir, fileId);
      await this.ensureDir(fileChunkDir);

      // 保存当前块
      const chunkPath = path.join(fileChunkDir, `${chunkNumber}`);
      await fsPromises.writeFile(chunkPath, file.buffer);
      this.logger.log(`块 ${chunkNumber} 保存成功，大小: ${file.buffer.length} 字节`);

      // 检查是否所有块都已上传
      const uploadedChunks = await this.getUploadedChunks(fileId);
      this.logger.log(`已上传块数: ${uploadedChunks.length}/${totalChunks}`);

      // 如果所有块都已上传，合并文件
      if (uploadedChunks.length === totalChunks) {
        this.logger.log(`所有块已上传，开始合并文件，总块数: ${totalChunks}`);

        const fileUrl = await this.mergeChunks(
          fileId,
          fileName,
          totalChunks,
          mimeType,
          fileHash,
          totalSize,
        );

        return {
          success: true,
          chunkNumber,
          fileId,
          completed: true,
          fileUrl,
        };
      }

      return {
        success: true,
        chunkNumber,
        fileId,
        completed: false,
      };
    } catch (error) {
      this.logger.error(`Error uploading chunk: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取已上传的块列表
   */
  private async getUploadedChunks(fileId: string): Promise<number[]> {
    const fileChunkDir = path.join(this.chunksDir, fileId);

    try {
      const files = await fsPromises.readdir(fileChunkDir);

      return files.map(Number).sort((a, b) => a - b);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  /**
   * 合并文件块
   */
  async mergeChunks(
    fileId: string,
    fileName: string,
    totalChunks: number,
    mimeType: string,
    fileHash?: string,
    totalSize?: number,
  ): Promise<string> {
    try {
      // 如果提供了文件哈希，先检查文件是否已存在（秒传功能）
      if (fileHash) {
        this.logger.log(`合并前检查文件是否已存在，哈希值: ${fileHash}`);

        const existingFile = await this.checkFileExists(fileHash);

        if (existingFile.exists && existingFile.fileInfo && existingFile.fileInfo.url) {
          this.logger.log(`文件已存在，使用秒传功能返回URL: ${existingFile.fileInfo.url}`);

          return existingFile.fileInfo.url;
        }
      }

      // 确保文件块目录存在
      const fileChunkDir = path.join(this.chunksDir, fileId);

      try {
        await fsPromises.stat(fileChunkDir);
        this.logger.log(`文件块目录存在: ${fileChunkDir}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.error(`文件块目录不存在: ${fileChunkDir}`);
          throw new Error(`文件块目录不存在，可能文件块未上传: ${fileId}`);
        }

        throw error;
      }

      // 检查是否所有块都已上传
      let uploadedChunks: number[] = [];

      try {
        uploadedChunks = await this.getUploadedChunks(fileId);
        this.logger.log(`已上传块数: ${uploadedChunks.length}，需要总块数: ${totalChunks}`);

        if (uploadedChunks.length !== totalChunks) {
          this.logger.error(
            `文件块数量不匹配: 已上传 ${uploadedChunks.length}，需要 ${totalChunks}`,
          );
          throw new Error(`文件块数量不匹配: 已上传 ${uploadedChunks.length}，需要 ${totalChunks}`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.error(`获取已上传块列表失败，目录不存在: ${fileChunkDir}`);
          throw new Error(`文件块目录不存在，可能文件块未上传: ${fileId}`);
        }

        throw error;
      }

      // 确保最终文件目录存在
      const finalDir = path.join(this.uploadDir, 'files');
      await this.ensureDir(finalDir);

      // 创建以日期命名的子目录，用于组织文件
      const now = new Date();
      const dateDir = path.join(
        finalDir,
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      );
      await this.ensureDir(dateDir);

      // 生成安全的文件名（添加时间戳防止重名）
      const timestamp = Date.now();
      const fileExt = path.extname(fileName);
      const fileNameWithoutExt = path.basename(fileName, fileExt);
      const safeFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;

      const finalPath = path.join(dateDir, safeFileName);

      this.logger.log(`开始合并文件块为: ${finalPath}`);

      // 创建目标文件的写入流
      const writeStream = fs.createWriteStream(finalPath);

      // 按顺序读取每个块并写入最终文件
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(this.chunksDir, fileId, `${i}`);

        // 验证每个块文件是否存在
        try {
          await fsPromises.stat(chunkPath);
        } catch (error) {
          writeStream.end(); // 关闭文件流
          this.logger.error(`文件块 ${i} 不存在，路径: ${chunkPath}，错误: ${error.message}`);
          throw new Error(`文件块 ${i} 不存在，路径: ${chunkPath}`);
        }

        const chunkData = await fsPromises.readFile(chunkPath);
        writeStream.write(chunkData);
        this.logger.debug(`成功写入块 ${i}，大小: ${chunkData.length} 字节`);
      }

      // 关闭写入流
      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      this.logger.log(`文件合并完成: ${finalPath}`);

      // 如果提供了文件哈希，创建元数据文件
      if (fileHash) {
        const metadataPath = `${finalPath}.meta.json`;
        const metadata = {
          fileId,
          fileName,
          fileHash,
          mimeType,
          size: totalSize,
          uploadedAt: new Date().toISOString(),
        };
        await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        this.logger.log(`已创建文件元数据: ${metadataPath}`);
      }

      // 清理临时块文件
      await this.cleanupChunks(fileId);

      // 返回文件的访问URL - 使用静态文件路由
      const relativePath = finalPath.replace(this.uploadDir, '');
      const fileUrl = `${this.baseUrl}/uploads${relativePath.replace(/\\/g, '/')}`;

      this.logger.log(`文件URL: ${fileUrl}`);

      return fileUrl;
    } catch (error) {
      this.logger.error(`Error merging chunks: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理临时块文件
   */
  private async cleanupChunks(fileId: string): Promise<void> {
    try {
      const fileChunkDir = path.join(this.chunksDir, fileId);
      const files = await fsPromises.readdir(fileChunkDir);

      // 删除所有块文件
      for (const file of files) {
        await fsPromises.unlink(path.join(fileChunkDir, file));
      }

      // 删除块目录
      await fsPromises.rmdir(fileChunkDir);
      this.logger.log(`已清理临时块目录: ${fileChunkDir}`);
    } catch (error) {
      this.logger.warn(`Error cleaning up chunks: ${error.message}`);
      // 不抛出错误，因为这不影响主功能
    }
  }

  /**
   * 检查文件是否已存在（通过文件哈希）
   */
  async checkFileExists(fileHash: string): Promise<{ exists: boolean; fileInfo?: any }> {
    if (!fileHash) {
      return { exists: false };
    }

    try {
      this.logger.log(`检查文件是否存在，哈希值: ${fileHash}`);

      const finalDir = path.join(this.uploadDir, 'files');

      // 递归查找所有元数据文件
      const metadataFiles = await this.findAllMetadataFiles(finalDir);
      this.logger.log(`找到 ${metadataFiles.length} 个元数据文件`);

      for (const metaFile of metadataFiles) {
        const metadataContent = await fsPromises.readFile(metaFile, 'utf8');
        let metadata;

        try {
          metadata = JSON.parse(metadataContent);
        } catch {
          this.logger.warn(`解析元数据文件失败: ${metaFile}`);
          continue;
        }

        this.logger.debug(`检查元数据文件: ${metaFile}, 哈希值: ${metadata.fileHash}`);

        if (metadata.fileHash === fileHash) {
          // 文件已存在，返回信息
          const filePath = metaFile.replace('.meta.json', '');

          // 确认文件实际存在
          try {
            await fsPromises.stat(filePath);
          } catch {
            this.logger.warn(`元数据指向的文件不存在: ${filePath}`);
            continue;
          }

          const relativePath = filePath.replace(this.uploadDir, '');
          const fileUrl = `${this.baseUrl}/uploads${relativePath.replace(/\\/g, '/')}`;

          this.logger.log(`文件已存在，URL: ${fileUrl}`);

          return {
            exists: true,
            fileInfo: {
              fileId: metadata.fileId,
              fileName: metadata.fileName,
              mimeType: metadata.mimeType,
              size: metadata.size,
              url: fileUrl,
              uploadedAt: new Date(metadata.uploadedAt),
            },
          };
        }
      }

      this.logger.log(`未找到哈希值为 ${fileHash} 的文件`);

      return { exists: false };
    } catch (error) {
      this.logger.error(`Error checking file existence: ${error.message}`, error.stack);

      return { exists: false };
    }
  }

  /**
   * 递归查找所有元数据文件
   */
  private async findAllMetadataFiles(dir: string): Promise<string[]> {
    let results: string[] = [];

    try {
      const items = await fsPromises.readdir(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = await fsPromises.stat(itemPath);

        if (stat.isDirectory()) {
          const subResults = await this.findAllMetadataFiles(itemPath);
          results = results.concat(subResults);
        } else if (item.endsWith('.meta.json')) {
          results.push(itemPath);
        }
      }
    } catch (error) {
      this.logger.warn(`Error searching metadata files: ${error.message}`);
    }

    return results;
  }

  /**
   * 获取已上传的分片信息，用于断点续传
   */
  async getUploadedChunkInfo(fileId: string): Promise<{ uploadedChunks: number[] }> {
    try {
      const uploadedChunks = await this.getUploadedChunks(fileId);
      this.logger.log(`文件ID: ${fileId} 已上传块: ${uploadedChunks.join(', ')}`);

      return { uploadedChunks };
    } catch (error) {
      this.logger.error(`Error getting uploaded chunk info: ${error.message}`, error.stack);

      return { uploadedChunks: [] };
    }
  }

  /**
   * 处理普通图片上传（非分块）
   */
  async convertImage(file: MulterFile) {
    try {
      const fileId = crypto.randomUUID();
      const fileName = file.filename || 'unnamed-file';
      const mimeType = file.mimetype || 'application/octet-stream';

      this.logger.log(`开始处理普通图片上传: ${fileName}`);

      return await this.uploadChunk(
        file,
        fileId,
        0, // 只有一个块，索引为0
        1, // 总块数为1
        fileName,
        file.size,
        mimeType,
      );
    } catch (error) {
      this.logger.error(`Error converting image: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取文件内容（用于提供文件访问服务）
   */
  async getFile(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const filePath = path.join(this.uploadDir, relativePath);

      // 检查文件是否存在
      await fsPromises.stat(filePath);

      // 读取文件内容
      const buffer = await fsPromises.readFile(filePath);

      // 尝试获取MIME类型
      let mimeType = 'application/octet-stream';

      try {
        const metadataPath = `${filePath}.meta.json`;
        const metadataContent = await fsPromises.readFile(metadataPath, 'utf8');
        const metadata = JSON.parse(metadataContent);
        mimeType = metadata.mimeType;
      } catch {
        // 如果元数据文件不存在，使用默认MIME类型
      }

      return { buffer, mimeType };
    } catch (error) {
      this.logger.error(`Error getting file: ${error.message}`, error.stack);
      throw error;
    }
  }
}
