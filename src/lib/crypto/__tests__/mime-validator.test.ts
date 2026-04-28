/**
 * mime-validator.test.ts — Tests de validación MIME por magic numbers
 *
 * Verifica:
 * - Detección correcta de tipos por magic bytes (JPEG, PNG, WebP, PDF, ZIP)
 * - Detección de ejecutables (ELF, PE/EXE, Shebang)
 * - Extensiones bloqueadas rechazadas
 * - Sanitización de nombres de archivo
 * - MIME fake detectado (ejecutable disfrazado)
 * - Validación completa con validateFile()
 */

import {
  detectMimeType,
  isAllowedMimeType,
  detectExecutable,
  isBlockedExtension,
  sanitizeFilename,
  validateFile,
  getAttachmentType,
} from '../mime-validator';

describe('mime-validator', () => {

  // ── Detección de MIME por magic bytes ──────────────────────────

  describe('detectMimeType', () => {
    it('should detect JPEG by magic bytes (FF D8 FF)', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(detectMimeType(jpegBytes)).toBe('image/jpeg');
    });

    it('should detect PNG by magic bytes (89 50 4E 47)', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
      expect(detectMimeType(pngBytes)).toBe('image/png');
    });

    it('should detect WebP by magic bytes (RIFF...WEBP)', () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46,  // RIFF
        0x00, 0x00, 0x00, 0x00,  // size (filler)
        0x57, 0x45, 0x42, 0x50,  // WEBP
      ]);
      expect(detectMimeType(webpBytes)).toBe('image/webp');
    });

    it('should detect PDF by magic bytes (%PDF)', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);
      expect(detectMimeType(pdfBytes)).toBe('application/pdf');
    });

    it('should detect ZIP (DOCX/XLSX) by magic bytes (PK)', () => {
      const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);
      expect(detectMimeType(zipBytes)).toBe('application/zip');
    });

    it('should detect WebM/Matroska by magic bytes', () => {
      const webmBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00]);
      expect(detectMimeType(webmBytes)).toBe('audio/webm');
    });

    it('should return null for unknown bytes', () => {
      const randomBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      expect(detectMimeType(randomBytes)).toBeNull();
    });

    it('should return null for too few bytes', () => {
      const tooFew = new Uint8Array([0xFF, 0xD8]);
      expect(detectMimeType(tooFew)).toBeNull();
    });
  });

  // ── Detección de ejecutables ──────────────────────────────────

  describe('detectExecutable', () => {
    it('should detect Windows EXE (MZ header)', () => {
      const exeBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03]);
      expect(detectExecutable(exeBytes)).toBe('PE/EXE (Windows)');
    });

    it('should detect Linux ELF binary', () => {
      const elfBytes = new Uint8Array([0x7F, 0x45, 0x4C, 0x46, 0x02]);
      expect(detectExecutable(elfBytes)).toBe('ELF (Linux executable)');
    });

    it('should detect shebang scripts (#!)', () => {
      // #!/bin/bash
      const shebangBytes = new Uint8Array([0x23, 0x21, 0x2F, 0x62, 0x69]);
      expect(detectExecutable(shebangBytes)).toBe('Shebang script (#!)');
    });

    it('should detect Java class files', () => {
      const javaBytes = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE, 0x00]);
      expect(detectExecutable(javaBytes)).toBe('Java class');
    });

    it('should return null for non-executable (JPEG)', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
      expect(detectExecutable(jpegBytes)).toBeNull();
    });
  });

  // ── MIME whitelist ────────────────────────────────────────────

  describe('isAllowedMimeType', () => {
    it('should allow image types', () => {
      expect(isAllowedMimeType('image/jpeg')).toBe(true);
      expect(isAllowedMimeType('image/png')).toBe(true);
      expect(isAllowedMimeType('image/webp')).toBe(true);
    });

    it('should allow document types', () => {
      expect(isAllowedMimeType('application/pdf')).toBe(true);
      expect(isAllowedMimeType('application/zip')).toBe(true);
    });

    it('should allow audio types for voice messages', () => {
      expect(isAllowedMimeType('audio/webm')).toBe(true);
      expect(isAllowedMimeType('audio/ogg')).toBe(true);
    });

    it('should reject non-whitelisted types', () => {
      expect(isAllowedMimeType('text/html')).toBe(false);
      expect(isAllowedMimeType('application/javascript')).toBe(false);
      expect(isAllowedMimeType('application/x-executable')).toBe(false);
      expect(isAllowedMimeType('text/plain')).toBe(false);
    });
  });

  // ── Extensiones bloqueadas ────────────────────────────────────

  describe('isBlockedExtension', () => {
    it('should block common executable extensions', () => {
      expect(isBlockedExtension('malware.exe')).toBe(true);
      expect(isBlockedExtension('script.bat')).toBe(true);
      expect(isBlockedExtension('hack.sh')).toBe(true);
      expect(isBlockedExtension('payload.js')).toBe(true);
      expect(isBlockedExtension('trojan.py')).toBe(true);
      expect(isBlockedExtension('virus.dll')).toBe(true);
    });

    it('should allow safe extensions', () => {
      expect(isBlockedExtension('photo.jpg')).toBe(false);
      expect(isBlockedExtension('document.pdf')).toBe(false);
      expect(isBlockedExtension('file.png')).toBe(false);
      expect(isBlockedExtension('report.docx')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isBlockedExtension('MALWARE.EXE')).toBe(true);
      expect(isBlockedExtension('Script.BAT')).toBe(true);
    });
  });

  // ── Sanitización de nombres ───────────────────────────────────

  describe('sanitizeFilename', () => {
    it('should remove path traversal attempts', () => {
      // La implementación extrae solo el nombre final (basename)
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\system32\\cmd.exe')).toBe('cmd.exe');
    });

    it('should remove special characters', () => {
      expect(sanitizeFilename('file<>:"|?*.txt')).toBe('file_.txt');
    });

    it('should remove leading dots (hidden files)', () => {
      expect(sanitizeFilename('.htaccess')).toBe('htaccess');
      expect(sanitizeFilename('...hidden')).toBe('hidden');
    });

    it('should limit filename length to 200 characters', () => {
      const longName = 'a'.repeat(250) + '.pdf';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('should provide fallback for empty filenames', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
      expect(sanitizeFilename('...')).toBe('unnamed_file');
    });

    it('should preserve normal filenames', () => {
      expect(sanitizeFilename('my-photo_2024.jpg')).toBe('my-photo_2024.jpg');
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
    });
  });

  // ── Validación completa ───────────────────────────────────────

  describe('validateFile', () => {
    it('should accept a valid JPEG file', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, ...new Array(100).fill(0)]);
      expect(validateFile(jpegBytes, 'photo.jpg', 'image/jpeg')).toBeNull();
    });

    it('should accept a valid PNG file', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]);
      expect(validateFile(pngBytes, 'image.png', 'image/png')).toBeNull();
    });

    it('should reject a file exceeding 25 MB', () => {
      const oversized = new Uint8Array(25 * 1024 * 1024 + 1);
      const result = validateFile(oversized, 'big.jpg', 'image/jpeg');
      expect(result).toContain('25 MB');
    });

    it('should reject blocked file extension', () => {
      const data = new Uint8Array(100);
      const result = validateFile(data, 'hack.exe', 'application/octet-stream');
      expect(result).toContain('not allowed');
    });

    it('should detect an EXE disguised as JPG (MIME fake)', () => {
      // EXE magic bytes (MZ) but claiming to be JPEG
      const fakeJpeg = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, ...new Array(100).fill(0)]);
      const result = validateFile(fakeJpeg, 'totally-safe.jpg', 'image/jpeg');
      expect(result).toContain('Executable');
    });

    it('should detect an ELF binary disguised as PNG', () => {
      const fakeImg = new Uint8Array([0x7F, 0x45, 0x4C, 0x46, ...new Array(100).fill(0)]);
      const result = validateFile(fakeImg, 'photo.png', 'image/png');
      expect(result).toContain('Executable');
    });

    it('should reject non-whitelisted MIME type', () => {
      const data = new Uint8Array(100);
      const result = validateFile(data, 'page.html', 'text/html');
      expect(result).toContain('not allowed');
    });
  });

  // ── getAttachmentType ─────────────────────────────────────────

  describe('getAttachmentType', () => {
    it('should classify image MIMEs', () => {
      expect(getAttachmentType('image/jpeg')).toBe('image');
      expect(getAttachmentType('image/png')).toBe('image');
      expect(getAttachmentType('image/webp')).toBe('image');
    });

    it('should classify audio MIMEs as voice', () => {
      expect(getAttachmentType('audio/webm')).toBe('voice');
      expect(getAttachmentType('audio/ogg')).toBe('voice');
    });

    it('should classify everything else as file', () => {
      expect(getAttachmentType('application/pdf')).toBe('file');
      expect(getAttachmentType('application/zip')).toBe('file');
    });
  });
});
