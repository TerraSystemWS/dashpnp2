'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::avaliacao.avaliacao', ({ strapi }) => ({
  async create(ctx) {
    const data = ctx.request.body?.data;

    if (!data) {
      return ctx.badRequest('Dados inválidos.');
    }

    const { user_id, inscricoe } = data;

    if (!user_id || !inscricoe) {
      return ctx.badRequest('user_id e inscricoe são obrigatórios.');
    }

    if (typeof user_id !== 'number' || typeof inscricoe !== 'number') {
      return ctx.badRequest('user_id e inscricoe devem ser números.');
    }

    try {
      const existingAvaliacao = await strapi.db
        .query('api::avaliacao.avaliacao')
        .findOne({ where: { user_id, inscricoe } });

      if (existingAvaliacao) {
        return ctx.badRequest('Esse usuário ou inscrição já tem uma avaliação.');
      }

      const avaliacao = await strapi.db
        .query('api::avaliacao.avaliacao')
        .create({ data });

      return avaliacao;
    } catch (error) {
      strapi.log.error('Erro ao criar avaliação:', error);
      return ctx.internalServerError('Erro ao processar a avaliação.');
    }
  },
}));
