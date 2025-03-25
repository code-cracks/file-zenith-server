import { Test, TestingModule } from '@nestjs/testing';

import { MController } from './m.controller';
import { MService } from './m.service';

describe('MController', () => {
  let controller: MController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MController],
      providers: [MService],
    }).compile();

    controller = module.get<MController>(MController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
