'use strict';

/**
 * chunked-upload service
 *
 * Helpers for staging large-file uploads as small chunks on local disk
 * before handing the assembled file to the core upload plugin. Exists
 * because uploads from some regions never complete a single-request
 * POST /api/upload within ~60s (network path drops the connection),
 * so each chunk must be small enough to always finish in time.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOTAL_CHUNKS = 20000;
const STALE_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

const baseDir = () => path.join(os.tmpdir(), 'chunked-uploads');
const uploadDir = (uploadId) => path.join(baseDir(), uploadId);
const metaPath = (uploadId) => path.join(uploadDir(uploadId), 'meta.json');
const chunkPath = (uploadId, index) => path.join(uploadDir(uploadId), `chunk-${index}`);
const assembledPath = (uploadId) => path.join(baseDir(), `${uploadId}.assembled`);

const isValidUploadId = (uploadId) => typeof uploadId === 'string' && UUID_RE.test(uploadId);

const readMeta = async (uploadId) => {
  const raw = await fs.promises.readFile(metaPath(uploadId), 'utf8');
  return JSON.parse(raw);
};

const createUpload = async ({ filename, mimetype, size, totalChunks }) => {
  const uploadId = crypto.randomUUID();
  await fs.promises.mkdir(uploadDir(uploadId), { recursive: true });
  await fs.promises.writeFile(
    metaPath(uploadId),
    JSON.stringify({ filename, mimetype, size, totalChunks, createdAt: Date.now() })
  );
  return uploadId;
};

const saveChunk = async (uploadId, index, tmpFilePath) => {
  const dest = chunkPath(uploadId, index);
  try {
    await fs.promises.rename(tmpFilePath, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(tmpFilePath, dest);
    await fs.promises.unlink(tmpFilePath);
  }
};

const listReceivedChunks = async (uploadId) => {
  const entries = await fs.promises.readdir(uploadDir(uploadId));
  return entries
    .filter((name) => name.startsWith('chunk-'))
    .map((name) => Number(name.slice('chunk-'.length)))
    .sort((a, b) => a - b);
};

const findMissingChunks = async (uploadId, totalChunks) => {
  const received = new Set(await listReceivedChunks(uploadId));
  const missing = [];
  for (let i = 0; i < totalChunks; i += 1) {
    if (!received.has(i)) missing.push(i);
  }
  return missing;
};

const assembleChunks = async (uploadId, totalChunks) => {
  const target = assembledPath(uploadId);
  const writeStream = fs.createWriteStream(target);

  for (let i = 0; i < totalChunks; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const chunkBuffer = await fs.promises.readFile(chunkPath(uploadId, i));
    const canContinue = writeStream.write(chunkBuffer);
    if (!canContinue) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => writeStream.once('drain', resolve));
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end((err) => (err ? reject(err) : resolve()));
  });

  return target;
};

const cleanupUpload = async (uploadId) => {
  await fs.promises.rm(uploadDir(uploadId), { recursive: true, force: true }).catch(() => {});
  await fs.promises.rm(assembledPath(uploadId), { force: true }).catch(() => {});
};

const cleanupStaleUploads = async () => {
  let entries;
  try {
    entries = await fs.promises.readdir(baseDir(), { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const uploadId = entry.name;
        try {
          const meta = await readMeta(uploadId);
          if (now - meta.createdAt > STALE_UPLOAD_MAX_AGE_MS) {
            await cleanupUpload(uploadId);
          }
        } catch {
          // meta.json missing/corrupt: clean it up too
          await cleanupUpload(uploadId);
        }
      })
  );
};

module.exports = {
  MAX_TOTAL_CHUNKS,
  STALE_UPLOAD_MAX_AGE_MS,
  isValidUploadId,
  readMeta,
  createUpload,
  saveChunk,
  listReceivedChunks,
  findMissingChunks,
  assembleChunks,
  assembledPath,
  cleanupUpload,
  cleanupStaleUploads,
};
