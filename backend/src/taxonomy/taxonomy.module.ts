import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { TaxonomyController, SkillsController } from './taxonomy.controller';

@Module({
  providers: [TaxonomyService],
  controllers: [TaxonomyController, SkillsController],
})
export class TaxonomyModule {}
