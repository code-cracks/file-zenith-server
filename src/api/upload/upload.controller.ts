import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Body,
  Param,
  Res,
  HttpStatus,
  HttpException,
  Query,
} from '@nestjs/common';
import { FileInterceptor, MulterFile } from '@webundsoehne/nest-fastify-file-upload';
import { ApiTags, ApiConsumes, ApiOperation, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { UploadService } from './upload.service';
import { ChunkUploadResponseDto, CheckFileExistsResponseDto } from './dto/upload-response.dto';
import { ChunkUploadDto } from './dto/chunk-upload.dto';
import { CompleteFileDto } from './dto/complete-file.dto';

@ApiTags('文件上传')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传图片（单文件上传）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '要上传的图片文件',
        },
      },
    },
  })
  async convertImage(@UploadedFile() file: MulterFile) {
    return this.uploadService.convertImage(file);
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件块（支持大文件分块上传）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '文件块数据',
        },
        fileId: {
          type: 'string',
          description: '文件唯一标识符',
        },
        totalSize: {
          type: 'number',
          description: '文件总大小（字节）',
        },
        fileName: {
          type: 'string',
          description: '文件原始名称',
        },
        mimeType: {
          type: 'string',
          description: '文件类型',
        },
        chunkNumber: {
          type: 'number',
          description: '当前块序号，从0开始',
        },
        chunkSize: {
          type: 'number',
          description: '每块大小（字节）',
        },
        totalChunks: {
          type: 'number',
          description: '文件总块数',
        },
        fileHash: {
          type: 'string',
          description: '文件MD5哈希值，用于秒传功能',
        },
      },
      required: [
        'file',
        'fileId',
        'totalSize',
        'fileName',
        'mimeType',
        'chunkNumber',
        'chunkSize',
        'totalChunks',
      ],
    },
  })
  async uploadChunk(
    @UploadedFile() file: MulterFile,
    @Body() chunkDto: ChunkUploadDto,
  ): Promise<ChunkUploadResponseDto> {
    return this.uploadService.uploadChunk(
      file,
      chunkDto.fileId,
      chunkDto.chunkNumber,
      chunkDto.totalChunks,
      chunkDto.fileName,
      chunkDto.totalSize,
      chunkDto.mimeType,
      chunkDto.fileHash,
    );
  }

  @Post('complete-file')
  @ApiOperation({ summary: '完成文件上传（合并所有文件块）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: '文件唯一标识符',
        },
        fileName: {
          type: 'string',
          description: '文件原始名称',
        },
        totalChunks: {
          type: 'number',
          description: '文件总块数',
        },
        fileHash: {
          type: 'string',
          description: '文件MD5哈希值，用于验证',
        },
        totalSize: {
          type: 'number',
          description: '文件总大小（字节）',
        },
        mimeType: {
          type: 'string',
          description: '文件类型',
        },
      },
      required: ['fileId', 'fileName', 'totalChunks', 'totalSize', 'mimeType'],
    },
  })
  async completeFileUpload(@Body() completeFileDto: CompleteFileDto) {
    try {
      // 如果提供了文件哈希，先检查是否可以秒传
      if (completeFileDto.fileHash) {
        const existingFile = await this.uploadService.checkFileExists(completeFileDto.fileHash);

        if (existingFile.exists && existingFile.fileInfo) {
          return {
            success: true,
            fileUrl: existingFile.fileInfo.url,
            message: '文件已存在，使用秒传功能',
          };
        }
      }

      // 先检查文件块是否已上传
      const chunkInfo = await this.uploadService.getUploadedChunkInfo(completeFileDto.fileId);

      if (chunkInfo.uploadedChunks.length === 0) {
        throw new HttpException(
          `没有找到文件ID为${completeFileDto.fileId}的上传块。请先上传文件块再合并。`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (chunkInfo.uploadedChunks.length !== completeFileDto.totalChunks) {
        throw new HttpException(
          `文件块数量不匹配: 已上传 ${chunkInfo.uploadedChunks.length}，需要 ${completeFileDto.totalChunks}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const fileUrl = await this.uploadService.mergeChunks(
        completeFileDto.fileId,
        completeFileDto.fileName,
        completeFileDto.totalChunks,
        completeFileDto.mimeType,
        completeFileDto.fileHash,
        completeFileDto.totalSize,
      );

      return { success: true, fileUrl };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(error.message || '合并文件失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('chunk-info/:fileId')
  @ApiOperation({ summary: '获取已上传块信息（用于断点续传）' })
  @ApiParam({ name: 'fileId', description: '文件ID' })
  async getChunkInfo(@Param('fileId') fileId: string) {
    return this.uploadService.getUploadedChunkInfo(fileId);
  }

  @Get('check-file')
  @ApiOperation({ summary: '检查文件是否已存在（用于秒传功能）' })
  @ApiQuery({ name: 'fileHash', description: '文件哈希值' })
  async checkFileExists(@Query('fileHash') fileHash: string): Promise<CheckFileExistsResponseDto> {
    return this.uploadService.checkFileExists(fileHash);
  }

  @Get('file/*')
  @ApiOperation({ summary: '获取已上传文件' })
  async getFile(@Param('*') filePath: string, @Res() res: FastifyReply) {
    try {
      const { buffer, mimeType } = await this.uploadService.getFile(filePath);

      res.header('Content-Type', mimeType);
      res.status(HttpStatus.OK).send(buffer);
    } catch {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }
  }
}
