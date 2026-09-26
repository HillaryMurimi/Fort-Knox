import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { integrationConfig } from '../../core/integrations/config.js';
import { env } from '../../config/env.js';

export interface StoredObject {
  storageKey: string;
  url?: string;
  expiresAt?: Date;
}

export interface StorageProvider {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject>;
  getSignedUrl(input: { key: string; expiresInSeconds: number }): Promise<StoredObject>;
  delete(input: { key: string }): Promise<void>;
}

export class UnconfiguredStorageProvider implements StorageProvider {
  async put(_input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject> {
    throw new Error('Storage provider is not configured');
  }

  async getSignedUrl(_input: { key: string; expiresInSeconds: number }): Promise<StoredObject> {
    throw new Error('Storage provider is not configured');
  }

  async delete(_input: { key: string }): Promise<void> {
    throw new Error('Storage provider is not configured');
  }
}

export class LocalDevelopmentStorageProvider implements StorageProvider {
  private readonly root = resolve(process.cwd(), 'var', 'uploads');

  private pathFor(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}\\`) && !target.startsWith(`${this.root}/`)) {
      throw new Error('Invalid local storage key');
    }
    return target;
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject> {
    if (env.NODE_ENV === 'production') throw new Error('Local storage is disabled in production');
    const target = this.pathFor(input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body, { flag: 'wx' });
    return { storageKey: input.key };
  }

  async getSignedUrl(_input: { key: string; expiresInSeconds: number }): Promise<StoredObject> {
    throw new Error('Local development evidence is not publicly downloadable');
  }

  async delete(input: { key: string }): Promise<void> {
    if (env.NODE_ENV === 'production') throw new Error('Local storage is disabled in production');
    await unlink(this.pathFor(input.key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly config = integrationConfig.s3;

  private requireConfig() {
    if (!this.config.bucket || !this.config.accessKeyId || !this.config.secretAccessKey) throw new Error('S3 storage provider is not configured');
    return { bucket: this.config.bucket, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, region: this.config.region };
  }

  private target(key: string) {
    const config = this.requireConfig();
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    if (this.config.endpoint) {
      const endpoint = new URL(this.config.endpoint);
      const basePath = endpoint.pathname.replace(/\/$/, '');
      const uri = `${basePath}/${encodeURIComponent(config.bucket)}/${encodedKey}`.replace(/\/+/g, '/');
      return { ...config, host: endpoint.host, uri, url: `${endpoint.protocol}//${endpoint.host}${uri}` };
    }
    const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
    const uri = `/${encodedKey}`;
    return { ...config, host, uri, url: `https://${host}${uri}` };
  }

  private signingKey(secret: string, date: string, region: string): Buffer {
    const dateKey = hmac(`AWS4${secret}`, date);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, 's3');
    return hmac(serviceKey, 'aws4_request');
  }

  private signedHeaders(method: 'PUT' | 'DELETE', key: string, body: Buffer, contentType?: string) {
    const target = this.target(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = sha256(body);
    const canonicalHeaders = `host:${target.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `${method}\n${target.uri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${date}/${target.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
    const signature = hmac(this.signingKey(target.secretAccessKey, date, target.region), stringToSign).toString('hex');
    return { target, headers: { ...(contentType ? { 'content-type': contentType } : {}), 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` } };
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredObject> {
    const signed = this.signedHeaders('PUT', input.key, input.body, input.contentType);
    const response = await fetch(signed.target.url, { method: 'PUT', headers: signed.headers, body: new Uint8Array(input.body) });
    if (!response.ok) throw new Error(`S3 upload failed (${response.status})`);
    return { storageKey: input.key };
  }

  async getSignedUrl(input: { key: string; expiresInSeconds: number }): Promise<StoredObject> {
    const target = this.target(input.key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${target.region}/s3/aws4_request`;
    const params: Record<string, string> = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${target.accessKeyId}/${scope}`, 'X-Amz-Date': amzDate, 'X-Amz-Expires': String(input.expiresInSeconds), 'X-Amz-SignedHeaders': 'host' };
    const query = canonicalQuery(params);
    const canonicalRequest = `GET\n${target.uri}\n${query}\nhost:${target.host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
    const signature = hmac(this.signingKey(target.secretAccessKey, date, target.region), stringToSign).toString('hex');
    return { storageKey: input.key, url: `${target.url}?${query}&X-Amz-Signature=${signature}`, expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000) };
  }

  async delete(input: { key: string }): Promise<void> {
    const signed = this.signedHeaders('DELETE', input.key, Buffer.alloc(0));
    const response = await fetch(signed.target.url, { method: 'DELETE', headers: signed.headers });
    if (!response.ok && response.status !== 404) throw new Error(`S3 delete failed (${response.status})`);
  }
}

export function getStorageProvider(provider: 'CLOUDINARY' | 'S3' | 'OTHER' | 'LOCAL'): StorageProvider {
  if (provider === 'LOCAL') return new LocalDevelopmentStorageProvider();
  if (provider === 'S3') return new S3StorageProvider();
  return new UnconfiguredStorageProvider();
}

function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function hmac(key: string | Buffer, value: string): Buffer { return createHmac('sha256', key).update(value).digest(); }
function awsEncode(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function canonicalQuery(params: Record<string, string>): string { return Object.keys(params).sort().map((key) => `${awsEncode(key)}=${awsEncode(params[key]!)}`).join('&'); }
