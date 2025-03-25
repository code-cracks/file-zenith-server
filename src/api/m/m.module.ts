import { Module } from '@nestjs/common';

import { MService } from './m.service';
import { MController } from './m.controller';

@Module({
  controllers: [MController],
  providers: [MService],
})
export class MModule {}
