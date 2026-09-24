'use strict';

/**
 * avaliacao controller
 *
 * Só júri avalia, sempre em nome da própria sessão (nunca do user_id que
 * vem no pedido), uma vez por inscrição, e só inscrições publicadas da
 * edição atual — as edições anteriores estão encerradas.
 */

const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::avaliacao.avaliacao';
const INSCRICAO_UID = 'api::inscricao.inscricao';
const JURY_ROLES = ['jurado', 'responsavel'];
// Valores do enum do schema; 'insuficiente' (minúscula) é a nota 1 e
// 'Insuficiente' a nota 2 — é assim que a página do júri as distingue.
const NOTAS = ['insuficiente', 'Insuficiente', 'Suficiente', 'Bom', 'Excelente'];

const isJury = async (user) => {
  if (!user) return false;
  let type = user.role?.type;
  if (!type) {
    const full = await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
      populate: { role: { fields: ['type'] } },
    });
    type = full?.role?.type;
  }
  return !!type && JURY_ROLES.includes(type.toLowerCase());
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const { user } = ctx.state;
    if (!(await isJury(user))) return ctx.forbidden('Só o júri pode avaliar.');

    const data = ctx.request.body?.data ?? {};
    const inscricaoId = Number(data.inscricoe);
    if (!Number.isInteger(inscricaoId) || inscricaoId <= 0) return ctx.badRequest('inscricoe inválido.');
    if (!NOTAS.includes(data.notas)) return ctx.badRequest('Nota inválida.');

    const inscricao = await strapi.entityService.findOne(INSCRICAO_UID, inscricaoId, {
      fields: ['publishedAt'],
      populate: { edicoes: { fields: ['id'] } },
    });
    if (!inscricao || !inscricao.publishedAt) return ctx.notFound('Projeto não encontrado.');

    const edicao = await strapi.service(INSCRICAO_UID).edicaoAtual();
    if (!edicao || inscricao.edicoes?.id !== edicao.id) {
      return ctx.forbidden('A avaliação desta edição está encerrada.');
    }

    const existing = await strapi.db.query(UID).findOne({
      where: { user_id: user.id, inscricoe: inscricaoId },
    });
    if (existing) return ctx.badRequest('Já avaliou este projeto.');

    const avaliacao = await strapi.entityService.create(UID, {
      data: {
        notas: data.notas,
        comentario: typeof data.comentario === 'string' ? data.comentario.slice(0, 2000) : null,
        user_id: user.id,
        inscricoe: inscricaoId,
      },
    });
    ctx.body = { data: { id: avaliacao.id, attributes: { notas: avaliacao.notas, comentario: avaliacao.comentario } } };
  },

  // Uma avaliação gravada não é alterada nem apagada pela API — só no painel.
  async update(ctx) {
    return ctx.forbidden('As avaliações não podem ser alteradas.');
  },

  async delete(ctx) {
    return ctx.forbidden('As avaliações não podem ser apagadas.');
  },
}));
