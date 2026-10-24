import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider } from '@talkdrop/shared';

export class MockStorageProvider implements StorageProvider {
  private root: string;

  constructor(root = path.join(process.cwd(), '.evidence-store')) {
    this.root = root;
  }

  private filePath(key: string): string {
    return path.join(this.root, key.replace(/\.\./g, ''));
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    const fp = this.filePath(key);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, data);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.filePath(key));
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch {
      /* ignore */
    }
  }

  async signedUrl(key: string, _expiresSec: number): Promise<string> {
    return `memory://evidence/${encodeURIComponent(key)}`;
  }
}

export function createStorageProvider(mock: boolean): StorageProvider {
  // Real S3 wiring can replace this; mock is fine for MVP/dev.
  void mock;
  return new MockStorageProvider();
}
