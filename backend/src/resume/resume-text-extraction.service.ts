import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import {
  ResumeTextExtractionResult,
  ResumeTextFormat,
} from './resume.types.js';

const PDF_MIME = 'application/pdf';
const TXT_MIME = 'text/plain';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class ResumeTextExtractionService {
  async extractFromUpload(
    file: Express.Multer.File | undefined,
  ): Promise<ResumeTextExtractionResult> {
    if (!file) {
      throw new BadRequestException('Resume file is required.');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    const format = this.resolveFormat(file);
    let extractedText = '';

    try {
      if (format === 'pdf') {
        const parser = new PDFParse({ data: file.buffer });
        try {
          const parsed = await parser.getText();
          extractedText = parsed.text ?? '';
        } finally {
          await parser.destroy().catch(() => undefined);
        }
      } else if (format === 'txt') {
        extractedText = file.buffer.toString('utf8');
      } else {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = parsed.value ?? '';
      }
    } catch {
      throw new BadRequestException(
        'Unable to read resume file. Please upload a valid document.',
      );
    }

    const normalized = this.normalizeText(extractedText);
    if (!normalized) {
      throw new BadRequestException(
        'Resume does not contain readable text content.',
      );
    }

    return {
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      format,
      text: normalized,
      characterCount: normalized.length,
    };
  }

  private resolveFormat(file: Express.Multer.File): ResumeTextFormat {
    const extension = this.extractExtension(file.originalname);
    const mime = (file.mimetype ?? '').toLowerCase();

    if (mime === PDF_MIME || extension === 'pdf') {
      return 'pdf';
    }
    if (mime === TXT_MIME || extension === 'txt') {
      return 'txt';
    }
    if (mime === DOCX_MIME || extension === 'docx') {
      return 'docx';
    }

    throw new UnsupportedMediaTypeException(
      'Unsupported resume format. Allowed formats: PDF, TXT, DOCX.',
    );
  }

  private extractExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex < 0) {
      return '';
    }
    return fileName.slice(dotIndex + 1).toLowerCase();
  }

  private normalizeText(raw: string): string {
    return raw
      .replace(/\u00A0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
