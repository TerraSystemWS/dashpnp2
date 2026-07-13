'use strict';

/**
 * chunked-upload controller
 */

const fs = require('fs');

module.exports = {
  async init(ctx) {
    const svc = strapi.service('api::chunked-upload.chunked-upload');
    const { filename, mimetype, size, totalChunks } = ctx.request.body || {};

    if (
      typeof filename !== 'string' ||
      !filename.trim() ||
      typeof mimetype !== 'string' ||
      !mimetype.trim() ||
      !Number.isFinite(size) ||
      size <= 0 ||
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      totalChunks > svc.MAX_TOTAL_CHUNKS
    ) {
      return ctx.badRequest('Parâmetros inválidos.');
    }

    const uploadId = await svc.createUpload({ filename, mimetype, size, totalChunks });

    ctx.body = { uploadId };
  },

  async uploadChunk(ctx) {
    const svc = strapi.service('api::chunked-upload.chunked-upload');
    const { uploadId, chunkIndex } = ctx.params;

    if (!svc.isValidUploadId(uploadId)) {
      return ctx.badRequest('uploadId inválido.');
    }
    if (!/^\d+$/.test(chunkIndex)) {
      return ctx.badRequest('chunkIndex inválido.');
    }
    const index = Number(chunkIndex);

    let meta;
    try {
      meta = await svc.readMeta(uploadId);
    } catch {
      return ctx.notFound('Upload não encontrado ou expirado.');
    }

    if (index < 0 || index >= meta.totalChunks) {
      return ctx.badRequest('chunkIndex fora do intervalo esperado.');
    }

    const file = ctx.request.files?.chunk;
    if (!file) {
      return ctx.badRequest('Chunk em falta.');
    }

    await svc.saveChunk(uploadId, index, file.path);

    ctx.body = { received: index };
  },

  async status(ctx) {
    const svc = strapi.service('api::chunked-upload.chunked-upload');
    const { uploadId } = ctx.params;

    if (!svc.isValidUploadId(uploadId)) {
      return ctx.badRequest('uploadId inválido.');
    }

    try {
      await svc.readMeta(uploadId);
    } catch {
      return ctx.notFound('Upload não encontrado ou expirado.');
    }

    const receivedChunks = await svc.listReceivedChunks(uploadId);

    ctx.body = { receivedChunks };
  },

  async complete(ctx) {
    const svc = strapi.service('api::chunked-upload.chunked-upload');
    const { uploadId } = ctx.params;

    if (!svc.isValidUploadId(uploadId)) {
      return ctx.badRequest('uploadId inválido.');
    }

    let meta;
    try {
      meta = await svc.readMeta(uploadId);
    } catch {
      return ctx.notFound('Upload não encontrado ou expirado.');
    }

    const missing = await svc.findMissingChunks(uploadId, meta.totalChunks);
    if (missing.length > 0) {
      ctx.status = 400;
      ctx.body = { error: 'Faltam chunks.', missing };
      return;
    }

    try {
      const assembled = await svc.assembleChunks(uploadId, meta.totalChunks);
      const stats = await fs.promises.stat(assembled);

      const uploadedFiles = await strapi
        .plugin('upload')
        .service('upload')
        .upload({
          data: { fileInfo: { name: meta.filename } },
          files: {
            path: assembled,
            name: meta.filename,
            type: meta.mimetype,
            size: stats.size,
          },
        });

      ctx.body = uploadedFiles;
    } catch (error) {
      strapi.log.error('Erro ao concluir upload em chunks:', error);
      return ctx.internalServerError('Erro ao processar o ficheiro.');
    } finally {
      await svc.cleanupUpload(uploadId);
    }
  },
};
