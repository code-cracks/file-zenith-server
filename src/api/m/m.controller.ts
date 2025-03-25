import { Controller, Get } from '@nestjs/common';

import { MService } from './m.service';

@Controller('m')
export class MController {
  constructor(private readonly mService: MService) {}

  @Get()
  async getHello(): Promise<string> {
    return 'hello';
  }
}
