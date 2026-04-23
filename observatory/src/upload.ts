#!/usr/bin/env bun
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import mime from 'mime';
import fg from 'fast-glob';

interface Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  manifestKey: string;
}

function readEnv(): Env {
  const e = process.env;
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET', 'R2_MANIFEST_KEY'] as const;
  for (const k of required) {
    if (!e[k]) throw new Error(`${k} must be set`);
  }
  return {
    accountId: e['R2_ACCOUNT_ID'] ?? '',
    accessKeyId: e['R2_ACCESS_KEY'] ?? '',
    secretAccessKey: e['R2_SECRET_KEY'] ?? '',
    bucket: e['R2_BUCKET'] ?? '',
    manifestKey: e['R2_MANIFEST_KEY'] ?? '',
  };
}

async function sha256File(p: string): Promise<string> {
  const h = crypto.createHash('sha256');
  h.update(await fs.readFile(p));
  return h.digest('hex');
}

async function main(): Promise<void> {
  const env = readEnv();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  });

  const distDir = 'site/dist';
  const files = await fg(['**/*'], { cwd: distDir, dot: false, onlyFiles: true });
  const manifest: Record<string, string> = {};

  for (const rel of files) {
    const abs = path.join(distDir, rel);
    const hash = await sha256File(abs);
    const ext = path.extname(rel);
    const blobKey = `blobs/${hash}${ext}`;
    manifest[`/${rel.replace(/index\.html$/, '')}`] = blobKey;

    try {
      const existing = await s3.send(new ListObjectsV2Command({ Bucket: env.bucket, Prefix: blobKey, MaxKeys: 1 }));
      if (existing.Contents && existing.Contents.length > 0) continue;
    } catch {
      // continue with upload
    }

    const body = await fs.readFile(abs);
    const contentType = mime.getType(rel) ?? 'application/octet-stream';
    await new Upload({
      client: s3,
      params: {
        Bucket: env.bucket,
        Key: blobKey,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      },
    }).done();
    process.stdout.write(`+ ${blobKey}\n`);
  }

  await s3.send(new PutObjectCommand({
    Bucket: env.bucket,
    Key: env.manifestKey,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=0, must-revalidate',
  }));
  process.stdout.write(`manifest: ${env.manifestKey}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
