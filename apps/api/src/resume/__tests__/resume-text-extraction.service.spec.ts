import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Express } from 'express';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { ResumeTextExtractionService } from '../resume-text-extraction.service';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(),
}));
jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn(),
  },
}));

describe('ResumeTextExtractionService', () => {
  const service = new ResumeTextExtractionService();
  const mockedPDFParse = PDFParse as unknown as jest.Mock;
  const mockedMammoth = mammoth as unknown as {
    extractRawText: jest.Mock;
  };

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'resume.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 12,
    destination: '',
    filename: 'resume.txt',
    path: '',
    stream: null as any,
    buffer: Buffer.from('Hello\n\n\nworld  '),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts and normalizes text from txt', async () => {
    const file = makeFile();

    const result = await service.extractFromUpload(file);

    expect(result.format).toBe('txt');
    expect(result.text).toBe('Hello\n\nworld');
    expect(result.characterCount).toBe(result.text.length);
  });

  it('extracts text from pdf', async () => {
    const getText = jest.fn().mockResolvedValue({ text: 'PDF content' });
    const destroy = jest.fn().mockResolvedValue(undefined);
    mockedPDFParse.mockImplementationOnce(() => ({
      getText,
      destroy,
    }));
    const file = makeFile({
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-sample'),
    });

    const result = await service.extractFromUpload(file);

    expect(mockedPDFParse).toHaveBeenCalledWith({ data: file.buffer });
    expect(getText).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(result.format).toBe('pdf');
    expect(result.text).toBe('PDF content');
  });

  it('extracts text from docx', async () => {
    mockedMammoth.extractRawText.mockResolvedValue({ value: 'DOCX text' });
    const file = makeFile({
      originalname: 'resume.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx-bytes'),
    });

    const result = await service.extractFromUpload(file);

    expect(mockedMammoth.extractRawText).toHaveBeenCalledWith({
      buffer: file.buffer,
    });
    expect(result.format).toBe('docx');
    expect(result.text).toBe('DOCX text');
  });

  it('throws unsupported media type for invalid extension/mime', async () => {
    const file = makeFile({
      originalname: 'resume.rtf',
      mimetype: 'application/rtf',
      buffer: Buffer.from('{\\rtf}'),
    });

    await expect(service.extractFromUpload(file)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('returns controlled error for unreadable file', async () => {
    const getText = jest.fn().mockRejectedValue(new Error('bad pdf'));
    mockedPDFParse.mockImplementationOnce(() => ({
      getText,
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const file = makeFile({
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-corrupt'),
    });

    await expect(service.extractFromUpload(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns controlled error when no readable text is found', async () => {
    mockedPDFParse.mockImplementationOnce(() => ({
      getText: jest.fn().mockResolvedValue({ text: '   \n\t  ' }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const file = makeFile({
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-empty'),
    });

    await expect(service.extractFromUpload(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
