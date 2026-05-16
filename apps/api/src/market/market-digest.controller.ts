import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MarketDigestService } from './market-digest.service.js';

@Controller('market')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Market')
@ApiBearerAuth()
export class MarketDigestController {
  constructor(private readonly marketDigestService: MarketDigestService) {}

  @Get('digest')
  @ApiQuery({
    name: 'country',
    required: true,
    example: 'DE',
  })
  getDigest(@Query('country') country: string) {
    return this.marketDigestService.getCountryDigest(country);
  }

  @Get('postings')
  @ApiQuery({
    name: 'country',
    required: true,
    example: 'DE',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: '1',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    example: '6',
  })
  getCountryPostings(
    @Query('country') country: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.marketDigestService.getCountryPostings(country, page, pageSize);
  }
}
