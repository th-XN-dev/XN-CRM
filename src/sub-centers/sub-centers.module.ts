import { Module } from '@nestjs/common';
import { SubCentersController } from './sub-centers.controller';
import { SubCentersService } from './sub-centers.service';

@Module({
  controllers: [SubCentersController],
  providers: [SubCentersService],
  exports: [SubCentersService],
})
export class SubCentersModule {}
