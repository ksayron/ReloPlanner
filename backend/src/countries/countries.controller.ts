import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SOURCE_COUNTRIES, TARGET_COUNTRIES } from './countries.data.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('countries')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Countries')
@ApiBearerAuth()
export class CountriesController {
  @Get()
  getCatalog() {
    return {
      target: TARGET_COUNTRIES,
      source: SOURCE_COUNTRIES,
    };
  }
}
