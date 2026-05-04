export interface MarketDataRow {
  skillName: string;
  frequency: number;
  avgRequiredLevel: number;
}

export interface IMarketDataAdapter {
  parse(raw: any): MarketDataRow[];
}

export interface LiveMarketResult {
  totalVacancies: number;
  skills: MarketDataRow[];
}

export interface ILiveMarketAdapter {
  fetchMarketData(countryIso: string): Promise<LiveMarketResult>;
}
