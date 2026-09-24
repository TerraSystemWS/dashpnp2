'use strict';

/**
 * votacao-publica controller
 *
 * Votar exige conta com email confirmado: 1 voto por conta. Nome e email
 * do voto vêm da conta, nunca do corpo do pedido.
 */

const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::votacao-publica.votacao-publica';
const INSCRICAO_UID = 'api::inscricao.inscricao';

const findUserVote = async (user) => {
  const [vote] = await strapi.entityService.findMany(UID, {
    filters: { $or: [{ user: { id: user.id } }, { email: user.email }] },
    populate: { inscricoe: { fields: ['id'] } },
    limit: 1,
  });
  return vote ?? null;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async me(ctx) {
    const vote = await findUserVote(ctx.state.user);
    ctx.body = { data: { voted: !!vote, inscricaoId: vote?.inscricoe?.id ?? null } };
  },

  async votar(ctx) {
    const { user } = ctx.state;
    if (!user.confirmed) return ctx.forbidden('Confirme o seu email antes de votar.');

    const inscricaoId = Number(ctx.request.body?.inscricaoId);
    if (!Number.isInteger(inscricaoId) || inscricaoId <= 0) return ctx.badRequest('inscricaoId inválido.');

    const inscricao = await strapi.entityService.findOne(INSCRICAO_UID, inscricaoId, { fields: ['publishedAt'] });
    if (!inscricao || !inscricao.publishedAt) return ctx.notFound('Projeto não encontrado.');

    if (await findUserVote(user)) {
      ctx.status = 409;
      ctx.body = { data: null, error: { status: 409, name: 'ConflictError', message: 'Só pode votar uma única vez.' } };
      return;
    }

    const vote = await strapi.entityService.create(UID, {
      data: {
        nome_completo: user.nome || user.username,
        email: user.email,
        user: user.id,
        inscricoe: inscricaoId,
      },
    });
    ctx.body = { data: { id: vote.id, inscricaoId } };
  },
}));
