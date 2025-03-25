import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CompleteFileDto {
  @ApiProperty({ description: '文件唯一标识符' })
  @IsString()
  @IsNotEmpty()
  fileId: string;

  @ApiProperty({ description: '文件原始名称' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: '文件总块数' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  totalChunks: number;

  @ApiProperty({ description: '文件总大小（字节）' })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  totalSize: number;

  @ApiProperty({ description: '文件类型' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ description: '文件MD5哈希值，用于验证', required: false })
  @IsString()
  @IsOptional()
  fileHash?: string;
}
