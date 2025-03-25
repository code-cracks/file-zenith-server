import { ApiProperty } from '@nestjs/swagger';

export class ChunkUploadResponseDto {
  @ApiProperty({ description: '上传是否成功' })
  success: boolean;

  @ApiProperty({ description: '已上传的块序号' })
  chunkNumber: number;

  @ApiProperty({ description: '文件ID' })
  fileId: string;

  @ApiProperty({ description: '是否完成所有块上传', required: false })
  completed?: boolean;

  @ApiProperty({ description: '完整文件的访问URL', required: false })
  fileUrl?: string;
}

export class FileInfoDto {
  @ApiProperty({ description: '文件ID' })
  fileId: string;

  @ApiProperty({ description: '文件名' })
  fileName: string;

  @ApiProperty({ description: '文件大小（字节）' })
  size: number;

  @ApiProperty({ description: '文件类型' })
  mimeType: string;

  @ApiProperty({ description: '文件访问URL' })
  url: string;

  @ApiProperty({ description: '上传时间' })
  uploadedAt: Date;
}

export class CheckFileExistsResponseDto {
  @ApiProperty({ description: '文件是否已存在' })
  exists: boolean;

  @ApiProperty({ description: '如果文件已存在，提供文件信息', required: false })
  fileInfo?: FileInfoDto;
}
