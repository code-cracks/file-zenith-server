import { Test, TestingModule } from '@nestjs/testing';

import { MService } from './m.service';

describe('MService', () => {
  let service: MService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MService],
    }).compile();

    service = module.get<MService>(MService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
