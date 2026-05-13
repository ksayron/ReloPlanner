import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller.js';

@Module({
  controllers: [CountriesController],
})
export class CountriesModule {}
