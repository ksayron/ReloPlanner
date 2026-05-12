import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import {
  TaxonomyController,
  SkillsController,
  CompetenciesController,
} from './taxonomy.controller';

@Module({
  providers: [TaxonomyService],
  controllers: [TaxonomyController, SkillsController, CompetenciesController],
})
export class TaxonomyModule {}
