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

const EDICAO_UID = 'api::edicao.edicao';
const TZ = 'Atlantic/Cape_Verde';

// Só o hash fica na base de dados — quem lê a BD não consegue confirmar.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatDate = (value) =>
  new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });

// Prazo = fim do dia (hora de Cabo Verde, UTC-1 sem horário de verão) da
// data_fim da edição, para "até dia X" incluir o dia X inteiro.
const endOfDay = (dataFim) => {
  if (!dataFim) return null;
  const [y, m, d] = new Date(dataFim).toLocaleDateString('en-CA', { timeZone: TZ }).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + 60 * 60 * 1000);
};

module.exports = createCoreService(UID, ({ strapi }) => ({
  hashToken,

  // Edição em que as novas candidaturas entram: a mais recente publicada.
  async edicaoAtual() {
    const [edicao] = await strapi.entityService.findMany(EDICAO_UID, {
      fields: ['id', 'N_Edicao', 'data_fim'],
      sort: { N_Edicao: 'desc' },
      publicationState: 'live',
      limit: 1,
    });
    return edicao ?? null;
  },

  // Prazo para submeter e confirmar. Só as candidaturas criadas com este
  // fluxo (requer_confirmacao) têm prazo; é lido sempre da edição, para
  // acompanhar alterações à data_fim feitas no painel.
  prazo(entity) {
    if (!entity?.requer_confirmacao) return null;
    return endOfDay(entity.edicoes?.data_fim);
  },

  expirada(entity) {
    const prazo = this.prazo(entity);
    return !!prazo && prazo < new Date();
  },

  // Gera um token novo (o anterior deixa de valer) e devolve-o em claro
  // para ir no link do email.
  newConfirmationToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, hash: hashToken(token) };
  },

  async sendConfirmationEmail(entity, email, token) {
    const clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
    const link = `${clientUrl}/inscricao/confirmar?token=${token}`;
    const prazoDate = this.prazo(entity);
    const prazo = prazoDate ? formatDate(prazoDate) : null;

    const html = `<p>Olá${entity.nome_completo ? ` ${escapeHtml(entity.nome_completo)}` : ''},</p>
<p>Recebemos a submissão da sua candidatura ao Prémio Nacional de Publicidade:</p>
<ul>
  <li><strong>Projeto:</strong> ${escapeHtml(entity.nome_projeto)}</li>
  <li><strong>Categoria:</strong> ${escapeHtml(entity.categoria)}</li>
</ul>
<p>Para concluir, confirme a candidatura e a seguinte declaração de responsabilidade:</p>
<blockquote>Declaro que o trabalho submetido respeita as normas legais e éticas vigentes em Cabo Verde e aceito integralmente o <a href="${clientUrl}/regulamentos">regulamento</a> do Prémio Nacional de Publicidade PALMEIRA.</blockquote>
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

  // Apaga as candidaturas não confirmadas depois do fim do período de
  // candidaturas da edição, com os ficheiros que carregaram. As antigas
  // (sem requer_confirmacao) nunca são tocadas.
  async cleanupExpired() {
    const pending = await strapi.entityService.findMany(UID, {
      filters: { requer_confirmacao: true, confirmada_em: { $null: true } },
      publicationState: 'preview',
      fields: ['id', 'requer_confirmacao'],
      populate: {
        edicoes: { fields: ['data_fim'] },
        fileLink: { populate: { ficheiro: { fields: ['id'] } } },
      },
    });
    const expired = pending.filter((i) => this.expirada(i));

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
