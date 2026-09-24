'use strict';

/**
 * Configuração das contas públicas, aplicada em cada arranque (idempotente):
 * - confirmação de email obrigatória + URLs de redirecionamento para o site;
 * - templates de email em português (só substitui os templates por omissão
 *   do Strapi, para não apagar edições feitas no painel);
 * - permissões dos papéis para as rotas de inscrição/votação com conta;
 * - jurados/responsáveis já existentes ficam confirmados, para não ficarem
 *   bloqueados quando a confirmação de email passa a ser obrigatória.
 */

const JURY_ROLES = ['jurado', 'responsavel'];

const ACCOUNT_ACTIONS = [
  'api::inscricao.inscricao.find',
  'api::inscricao.inscricao.findOne',
  'api::inscricao.inscricao.ficha',
  'api::inscricao.inscricao.mineList',
  'api::inscricao.inscricao.mineCreate',
  'api::inscricao.inscricao.mineFindOne',
  'api::inscricao.inscricao.mineUpdate',
  'api::inscricao.inscricao.mineAttachFiles',
  'api::inscricao.inscricao.mineDeleteFile',
  'api::inscricao.inscricao.mineSubmit',
  'api::inscricao.inscricao.mineResend',
  'api::votacao-publica.votacao-publica.me',
  'api::votacao-publica.votacao-publica.votar',
  'api::chunked-upload.chunked-upload.init',
  'api::chunked-upload.chunked-upload.uploadChunk',
  'api::chunked-upload.chunked-upload.status',
  'api::chunked-upload.chunked-upload.complete',
];

// Leitura dos votos (contagem na página de resultados) — só júri.
const JURY_ONLY_ACTIONS = ['api::votacao-publica.votacao-publica.find'];

// Escrita direta nas inscrições/votos deixa de ser possível sem passar
// pelas rotas com dono.
const REVOKED_ACTIONS = {
  public: [
    'api::inscricao.inscricao.create',
    'api::inscricao.inscricao.update',
    'api::inscricao.inscricao.delete',
    'api::votacao-publica.votacao-publica.create',
    'api::votacao-publica.votacao-publica.update',
    'api::votacao-publica.votacao-publica.delete',
  ],
  authenticated: [
    'api::inscricao.inscricao.create',
    'api::inscricao.inscricao.update',
    'api::inscricao.inscricao.delete',
    'api::votacao-publica.votacao-publica.create',
    'api::votacao-publica.votacao-publica.update',
    'api::votacao-publica.votacao-publica.delete',
  ],
};

const EMAIL_CONFIRMATION_MESSAGE = `<p>Olá,</p>
<p>Obrigado por criar conta no Prémio Nacional de Publicidade.</p>
<p>Para confirmar o seu email, clique no link abaixo:</p>
<p><a href="<%= URL %>?confirmation=<%= CODE %>">Confirmar a minha conta</a></p>
<p>Se não criou esta conta, ignore este email.</p>
<p>Prémio Nacional de Publicidade</p>`;

const RESET_PASSWORD_MESSAGE = `<p>Olá,</p>
<p>Recebemos um pedido para redefinir a password da sua conta no Prémio Nacional de Publicidade.</p>
<p><a href="<%= URL %>?code=<%= TOKEN %>">Definir nova password</a></p>
<p>Se não fez este pedido, ignore este email — a password atual continua válida.</p>
<p>Prémio Nacional de Publicidade</p>`;

const configureAdvancedSettings = async (strapi) => {
  const clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
  if (!clientUrl) {
    strapi.log.warn('CLIENT_URL não definido — confirmação de email das contas públicas não configurada.');
    return;
  }
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'advanced' });
  const current = (await store.get()) || {};
  await store.set({
    value: {
      ...current,
      unique_email: true,
      allow_register: true,
      email_confirmation: true,
      email_confirmation_redirection: `${clientUrl}/conta/confirmada`,
      email_reset_password: `${clientUrl}/conta/redefinir-password`,
    },
  });
};

const configureEmailTemplates = async (strapi) => {
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'email' });
  const current = await store.get();
  if (!current) return;

  const from = {
    name: 'Prémio Nacional de Publicidade',
    email: process.env.SMTP_FROM || current.email_confirmation?.options?.from?.email,
  };
  const replyTo = process.env.SMTP_REPLYTO || current.email_confirmation?.options?.response_email || '';
  const next = { ...current };
  let changed = false;

  if (current.email_confirmation?.options?.message?.includes('Thank you for registering')) {
    next.email_confirmation = {
      ...current.email_confirmation,
      options: {
        ...current.email_confirmation.options,
        from,
        response_email: replyTo,
        object: 'Confirme a sua conta — Prémio Nacional de Publicidade',
        message: EMAIL_CONFIRMATION_MESSAGE,
      },
    };
    changed = true;
  }
  if (current.reset_password?.options?.message?.includes('We heard that you lost your password')) {
    next.reset_password = {
      ...current.reset_password,
      options: {
        ...current.reset_password.options,
        from,
        response_email: replyTo,
        object: 'Redefinir password — Prémio Nacional de Publicidade',
        message: RESET_PASSWORD_MESSAGE,
      },
    };
    changed = true;
  }
  if (changed) await store.set({ value: next });
};

const configurePermissions = async (strapi) => {
  const roleQuery = strapi.query('plugin::users-permissions.role');
  const permQuery = strapi.query('plugin::users-permissions.permission');

  const roles = await roleQuery.findMany({ where: { type: { $in: ['public', 'authenticated', ...JURY_ROLES] } } });

  for (const role of roles) {
    const revoked = REVOKED_ACTIONS[role.type] ?? [];
    if (revoked.length) {
      // deleteMany não aceita filtros por relação — resolve os ids primeiro.
      const toRevoke = await permQuery.findMany({ where: { role: role.id, action: { $in: revoked } }, select: ['id'] });
      if (toRevoke.length) {
        await permQuery.deleteMany({ where: { id: { $in: toRevoke.map((p) => p.id) } } });
      }
    }

    if (role.type === 'public') continue;
    const wanted = JURY_ROLES.includes(role.type) ? [...ACCOUNT_ACTIONS, ...JURY_ONLY_ACTIONS] : ACCOUNT_ACTIONS;
    const existing = await permQuery.findMany({ where: { role: role.id, action: { $in: wanted } } });
    const have = new Set(existing.map((p) => p.action));
    for (const action of wanted) {
      if (!have.has(action)) await permQuery.create({ data: { action, role: role.id } });
    }
  }
};

const confirmJuryUsers = async (strapi) => {
  const userQuery = strapi.query('plugin::users-permissions.user');
  const pending = await userQuery.findMany({
    where: { confirmed: false, role: { type: { $in: JURY_ROLES } } },
    select: ['id'],
  });
  if (pending.length) {
    await userQuery.updateMany({ where: { id: { $in: pending.map((u) => u.id) } }, data: { confirmed: true } });
  }
};

module.exports = async (strapi) => {
  try {
    await configureAdvancedSettings(strapi);
    await configureEmailTemplates(strapi);
    await configurePermissions(strapi);
    await confirmJuryUsers(strapi);
  } catch (err) {
    strapi.log.error('Erro ao configurar contas públicas:', err);
  }
};
