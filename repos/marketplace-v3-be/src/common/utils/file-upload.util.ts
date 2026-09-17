import { getSetting } from '../../modules/system-settings/settings.reader';
import crypto from 'crypto';
import { config } from '../../config';
import { uploadBufferToAzureBlob } from './azure-blob-storage.util';

export interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export interface ProcessedFile {
  storedName: string;
  mimetype: string;
  sizeBytes: number;
  url: string;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function processUpload(
  file: UploadedFile,
  opts?: {
    allowedMimeTypes?: string[];
    maxFileSizeMb?: number;
    pathPrefix?: string;
  },
): Promise<ProcessedFile> {
  const image = file.mimetype.startsWith('image/');
  const [allowed, limit] = await Promise.all([
    getSetting<string[]>(image ? 'allowedImageTypes' : 'allowedDocumentTypes'),
    getSetting<number>(image ? 'maxImageSizeMb' : 'maxDocumentSizeMb'),
  ]);
  const processed = validateAndProcessUpload(file, {
    ...opts,
    allowedMimeTypes: allowed.filter((type) => (opts?.allowedMimeTypes ?? allowed).includes(type)),
    maxFileSizeMb: Math.min(limit, opts?.maxFileSizeMb ?? limit),
  });
  const upload = await uploadBufferToAzureBlob({
    blobName: processed.storedName,
    buffer: file.buffer,
    contentType: file.mimetype,
  });

  return {
    ...processed,
    url: upload.url,
  };
}

export function validateAndProcessUpload(
  file: UploadedFile,
  opts?: {
    allowedMimeTypes?: string[];
    maxFileSizeMb?: number;
    pathPrefix?: string;
  },
): ProcessedFile {
  const allowedMimeTypes = opts?.allowedMimeTypes ?? config.upload.allowedMimeTypes;
  const maxBytes = (opts?.maxFileSizeMb ?? config.upload.maxFileSizeMb) * 1024 * 1024;

  // 1. Validate MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new UploadValidationError(
      `File type "${file.mimetype}" is not allowed. Accepted: ${allowedMimeTypes.join(', ')}`,
    );
  }

  if (!contentMatchesMimeType(file.buffer, file.mimetype)) {
    throw new UploadValidationError(
      `File contents do not match the declared type "${file.mimetype}"`,
    );
  }

  // 2. Validate size
  if (file.buffer.length === 0 || file.buffer.length > maxBytes) {
    throw new UploadValidationError(
      `File must be between 1 byte and ${opts?.maxFileSizeMb ?? config.upload.maxFileSizeMb}MB`,
    );
  }

  // 3. Generate safe filename (never trust original filename)
  const ext = mimeToExt(file.mimetype);
  const prefix = normalizePrefix(opts?.pathPrefix);
  const storedName = `${prefix}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  return {
    storedName,
    mimetype: file.mimetype,
    sizeBytes: file.buffer.length,
    url: `/api/uploads/${storedName}`,
  };
}

function normalizePrefix(prefix?: string): string {
  const clean = (prefix || 'general')
    .split('/')
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._-]/g, '-'))
    .filter(Boolean)
    .join('/');

  return clean ? `${clean}/` : '';
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/csv': '.csv',
    'application/csv': '.csv',
    'text/plain': '.txt',
  };
  return map[mime] || '';
}

function contentMatchesMimeType(buffer: Buffer, mimeType: string): boolean {
  const startsWith = (...bytes: number[]) =>
    buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(0x50, 0x4b, 0x03, 0x04);
    case 'text/csv':
    case 'application/csv':
    case 'text/plain':
      return !buffer.includes(0x00);
    default:
      return false;
  }
}
