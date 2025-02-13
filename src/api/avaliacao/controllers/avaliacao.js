'use strict';

/**
 * avaliacao controller
 */

// const { createCoreController } = require('@strapi/strapi').factories;

// module.exports = createCoreController('api::avaliacao.avaliacao');


// src/api/avaliacao/controllers/avaliacao.js

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::avaliacao.avaliacao', ({ strapi }) => ({
  // Sobrescreve a função de criação
  async create(ctx) {
    const { user_id, inscricoe } = ctx.request.body.data;

    // Verificar se já existe uma avaliação com esse user_id e inscricoe
    const existingAvaliacao = await strapi.db.query('api::avaliacao.avaliacao').findOne({
      where: {
        user_id: user_id,
        inscricoe: inscricoe,
      },
    });

    if (existingAvaliacao) {
      return ctx.badRequest('Esse usuário ou inscrição já tem uma avaliação.');
    }

    // Caso não exista, continue com a criação padrão
    const avaliacao = await strapi.db.query('api::avaliacao.avaliacao').create({
      data: {
        ...ctx.request.body.data,
      },
    });

    return avaliacao;
  },
}));
