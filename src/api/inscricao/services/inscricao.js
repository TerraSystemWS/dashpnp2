'use strict';

/**
 * inscricao service
 *
 * Além do serviço core: email de confirmação da candidatura (enviado ao
 * submeter) e limpeza das candidaturas não confirmadas dentro do prazo.
 */

const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::inscricao.inscricao';

// Prazo para submeter e confirmar, contado a partir da criação.
const PRAZO_DIAS = 7;

// Só o hash fica na base de dados — quem lê a BD não consegue confirmar.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatDate = (value) =>
  new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Atlantic/Cape_Verde' });

module.exports = createCoreService(UID, ({ strapi }) => ({
  PRAZO_DIAS,
  hashToken,

  // Gera um token novo (o anterior deixa de valer) e devolve-o em claro
  // para ir no link do email.
  newConfirmationToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, hash: hashToken(token) };
  },

  async sendConfirmationEmail(entity, email, token) {
    const clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
    const link = `${clientUrl}/inscricao/confirmar?token=${token}`;
    const prazo = entity.expira_em ? formatDate(entity.expira_em) : null;

    const html = `<p>Olá${entity.nome_completo ? ` ${escapeHtml(entity.nome_completo)}` : ''},</p>
<p>Recebemos a submissão da sua candidatura ao Prémio Nacional de Publicidade:</p>
<ul>
  <li><strong>Projeto:</strong> ${escapeHtml(entity.nome_projeto)}</li>
  <li><strong>Categoria:</strong> ${escapeHtml(entity.categoria)}</li>
</ul>
<p>Para concluir, confirme que atesta a veracidade das informações submetidas e que deseja participar no concurso:</p>
<p><a href="${link}">Confirmar candidatura</a></p>
${prazo ? `<p>A candidatura tem de ser confirmada até <strong>${prazo}</strong>; caso contrário será eliminada.</p>` : ''}
<p>Se não submeteu esta candidatura, ignore este email.</p>
<p>Prémio Nacional de Publicidade</p>`;

    await strapi.plugin('email').service('email').send({
      to: email,
      from: process.env.SMTP_FROM ? `Prémio Nacional de Publicidade <${process.env.SMTP_FROM}>` : undefined,
      replyTo: process.env.SMTP_REPLYTO || undefined,
      subject: 'Confirme a sua candidatura — Prémio Nacional de Publicidade',
      html,
    });
  },

  // Apaga as candidaturas não confirmadas cujo prazo passou, com os
  // ficheiros que carregaram. As antigas (sem expira_em) nunca são tocadas.
  async cleanupExpired() {
    const expired = await strapi.entityService.findMany(UID, {
      filters: { expira_em: { $notNull: true, $lt: new Date().toISOString() }, confirmada_em: { $null: true } },
      publicationState: 'preview',
      fields: ['id'],
      populate: { fileLink: { populate: { ficheiro: { fields: ['id'] } } } },
    });

    for (const inscricao of expired) {
      const fileIds = (inscricao.fileLink ?? []).map((f) => f.ficheiro?.id).filter(Boolean);
      await strapi.entityService.delete(UID, inscricao.id);
      for (const fileId of fileIds) {
        const file = await strapi.entityService.findOne('plugin::upload.file', fileId);
        if (file) await strapi.plugin('upload').service('upload').remove(file);
      }
    }
    if (expired.length) strapi.log.info(`Eliminadas ${expired.length} candidatura(s) não confirmada(s) dentro do prazo.`);
  },
}));
