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

export interface LiveJobPosting {
  countryCode: string;
  roleName: string;
  title: string;
  company: string;
  location: string;
  source: string;
  sourceUrl?: string;
  sourceExternalId?: string;
  salaryMinUsd?: number | null;
  salaryMaxUsd?: number | null;
  salaryCurrency?: string | null;
  description?: string;
}

export interface ILiveMarketAdapter {
  fetchMarketData(countryIso: string): Promise<LiveMarketResult>;
  fetchJobPostings?(
    countryIso: string,
    roleNames: string[],
    options?: { maxPerRole?: number },
  ): Promise<LiveJobPosting[]>;
}
