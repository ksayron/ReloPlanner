export type ResumeTextFormat = 'pdf' | 'txt' | 'docx';

export interface ResumeTextExtractionResult {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  format: ResumeTextFormat;
  text: string;
  characterCount: number;
}
