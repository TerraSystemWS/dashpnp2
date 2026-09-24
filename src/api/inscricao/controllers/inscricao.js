'use strict';

/**
 * inscricao controller
 *
 * As rotas "core" (find/findOne) ficam só para leitura pública das
 * inscrições publicadas (páginas /projetos). Tudo o que é do candidato
 * passa pelas rotas /inscricoes/mine/*, que exigem sessão e só tocam em
 * inscrições cujo `owner` é o utilizador autenticado.
 */

const crypto = require('crypto');
const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::inscricao.inscricao';
const JURY_ROLES = ['jurado', 'responsavel'];

// Campos que o candidato pode editar (os três passos do formulário).
// email/owner/url/code/publishedAt nunca vêm do cliente.
const EDITABLE_FIELDS = [
  'nome_completo', 'NIF', 'sede', 'telefone',
  'categoria', 'nome_projeto', 'con_criativo',
  'coord_prod', 'dir_foto', 'dir_art', 'realizador', 'autor_jingle',
  'designer', 'editor', 'outras_consideracoes',
  'data_producao', 'data_divulgacao', 'data_apresentacao_publica',
];

const EDICAO_POPULATE = { edicoes: { fields: ['data_fim'] } };

const FILE_POPULATE = {
  ...EDICAO_POPULATE,
  fileLink: { populate: { ficheiro: { fields: ['id', 'name', 'hash', 'ext', 'mime', 'url'] } } },
};

const isJury = (user) => !!user?.role?.type && JURY_ROLES.includes(user.role.type.toLowerCase());

// O `role` não vem sempre populado em ctx.state.user — vai buscá-lo se faltar.
const loadRole = async (user) => {
  if (!user || user.role?.type) return user;
  const full = await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    populate: { role: { fields: ['type'] } },
  });
  return { ...user, role: full?.role };
};

// O prazo não é guardado — vem da data_fim da edição (ver service.prazo).
const withPrazo = (entity) => {
  const { edicoes, requer_confirmacao, confirmacao_token, owner, ...rest } = entity;
  return { ...rest, expira_em: service().prazo(entity)?.toISOString() ?? null };
};

// Formato { id, attributes } igual ao resto da API, para o frontend não mudar.
const toResponse = (entity) => {
  if (!entity) return null;
  const { id, fileLink, ...rest } = withPrazo(entity);
  return {
    id,
    attributes: {
      ...rest,
      fileLink: (fileLink ?? []).map((f) => ({
        id: f.id,
        titulo: f.titulo,
        publico: f.publico,
        ficheiro: { data: f.ficheiro ? { id: f.ficheiro.id, attributes: f.ficheiro } : null },
      })),
    },
  };
};

// Documentos marcados como não públicos (BI, NIF, comprovativos…) só
// aparecem ao júri — tira-os da resposta para o público.
const stripPrivateFiles = (item) => {
  const files = item?.attributes?.fileLink;
  if (Array.isArray(files)) {
    item.attributes.fileLink = files.filter((f) => f.publico === true);
  }
  return item;
};

// Depois de submetida (à espera de confirmação ou confirmada) ou aceite
// pela organização, a candidatura deixa de poder ser alterada.
const lockedReason = (entity) => {
  if (entity.publishedAt) return 'A candidatura já foi aceite e não pode ser alterada.';
  if (entity.submetida_em) return 'A candidatura já foi submetida e não pode ser alterada.';
  return null;
};

// Campos obrigatórios para submeter — os mesmos que o formulário marca
// como passo concluído.
const missingFields = (entity) => {
  const missing = [];
  if (!entity.nome_completo) missing.push('Nome completo');
  if (!entity.categoria) missing.push('Categoria');
  if (!entity.nome_projeto) missing.push('Nome do projeto');
  if (!entity.coord_prod) missing.push('Coordenação de produção');
  if (!(entity.fileLink ?? []).length) missing.push('Documentos');
  return missing;
};

const service = () => strapi.service(UID);

// Devolve a inscrição só se for do utilizador; caso contrário, null
// (o controller responde 404, sem revelar se o url existe).
const findMine = async (ctx, populate = EDICAO_POPULATE) => {
  const [entity] = await strapi.entityService.findMany(UID, {
    filters: { url: ctx.params.url, owner: { id: ctx.state.user.id } },
    publicationState: 'preview',
    populate,
    limit: 1,
  });
  return entity ?? null;
};

module.exports = createCoreController(UID, ({ strapi }) => ({
  // Público só vê inscrições publicadas. Sem isto, `publicationState=preview`
  // na query expunha os rascunhos a qualquer pessoa.
  async find(ctx) {
    const user = await loadRole(ctx.state.user);
    if (isJury(user)) return super.find(ctx);

    ctx.query = { ...ctx.query, publicationState: 'live' };
    const res = await super.find(ctx);
    (res?.data ?? []).forEach(stripPrivateFiles);
    return res;
  },

  // O findOne core devolve rascunhos por ID — só júri pode ver não publicadas.
  async findOne(ctx) {
    const user = await loadRole(ctx.state.user);
    if (isJury(user)) return super.findOne(ctx);

    const entity = await strapi.entityService.findOne(UID, ctx.params.id, { fields: ['publishedAt'] });
    if (!entity || !entity.publishedAt) return ctx.notFound();
    const res = await super.findOne(ctx);
    stripPrivateFiles(res?.data);
    return res;
  },

  // Dados de contacto do candidato (campos privados) — só para o júri.
  async ficha(ctx) {
    const user = await loadRole(ctx.state.user);
    if (!isJury(user)) return ctx.forbidden();
    const entity = await strapi.entityService.findOne(UID, ctx.params.id, {
      fields: ['nome_completo', 'NIF', 'email', 'sede', 'telefone'],
    });
    if (!entity) return ctx.notFound();
    ctx.body = { data: entity };
  },

  async mineList(ctx) {
    const entities = await strapi.entityService.findMany(UID, {
      filters: { owner: { id: ctx.state.user.id } },
      fields: ['url', 'nome_projeto', 'categoria', 'publishedAt', 'createdAt', 'updatedAt', 'submetida_em', 'confirmada_em', 'requer_confirmacao'],
      populate: EDICAO_POPULATE,
      publicationState: 'preview',
      sort: { createdAt: 'desc' },
    });
    ctx.body = { data: entities.map(withPrazo) };
  },

  async mineCreate(ctx) {
    const { user } = ctx.state;
    if (!user.confirmed) return ctx.forbidden('Confirme o seu email antes de criar uma candidatura.');

    const edicao = await service().edicaoAtual();
    if (!edicao) return ctx.forbidden('Não há nenhuma edição com candidaturas abertas.');
    if (service().expirada({ requer_confirmacao: true, edicoes: edicao })) {
      return ctx.forbidden(`As candidaturas para a ${edicao.N_Edicao}ª edição já terminaram.`);
    }

    const entity = await strapi.entityService.create(UID, {
      data: {
        url: crypto.randomUUID(),
        owner: user.id,
        email: user.email,
        nome_completo: user.nome || null,
        edicoes: edicao.id,
        requer_confirmacao: true,
        publishedAt: null,
      },
      fields: ['url'],
    });
    ctx.body = { data: { id: entity.id, url: entity.url } };
  },

  async mineFindOne(ctx) {
    const entity = await findMine(ctx, FILE_POPULATE);
    if (!entity) return ctx.notFound();
    ctx.body = { data: toResponse(entity) };
  },

  async mineUpdate(ctx) {
    const entity = await findMine(ctx);
    if (!entity) return ctx.notFound();
    const locked = lockedReason(entity);
    if (locked) return ctx.forbidden(locked);

    const body = ctx.request.body?.data ?? {};
    const data = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) data[key] = body[key];
    }
    data.email = ctx.state.user.email;

    const updated = await strapi.entityService.update(UID, entity.id, { data, populate: FILE_POPULATE });
    ctx.body = { data: toResponse(updated) };
  },

  async mineAttachFiles(ctx) {
    const entity = await findMine(ctx, FILE_POPULATE);
    if (!entity) return ctx.notFound();
    const locked = lockedReason(entity);
    if (locked) return ctx.forbidden(locked);

    const fileIds = ctx.request.body?.fileIds;
    if (!Array.isArray(fileIds) || fileIds.length === 0 || !fileIds.every(Number.isInteger)) {
      return ctx.badRequest('fileIds inválido.');
    }
    const files = await strapi.entityService.findMany('plugin::upload.file', {
      filters: { id: { $in: fileIds } },
      fields: ['id', 'name'],
    });

    const fileLink = [
      ...(entity.fileLink ?? []).map((f) => ({ titulo: f.titulo, publico: f.publico, ficheiro: f.ficheiro?.id ?? null })),
      ...files.map((f) => ({ titulo: f.name, publico: false, ficheiro: f.id })),
    ];
    const updated = await strapi.entityService.update(UID, entity.id, { data: { fileLink }, populate: FILE_POPULATE });
    ctx.body = { data: toResponse(updated) };
  },

  async mineDeleteFile(ctx) {
    const entity = await findMine(ctx, FILE_POPULATE);
    if (!entity) return ctx.notFound();
    const locked = lockedReason(entity);
    if (locked) return ctx.forbidden(locked);

    const fileId = Number(ctx.params.fileId);
    const current = entity.fileLink ?? [];
    const target = current.find((f) => f.ficheiro?.id === fileId);
    if (!target) return ctx.notFound();

    const fileLink = current
      .filter((f) => f !== target)
      .map((f) => ({ titulo: f.titulo, publico: f.publico, ficheiro: f.ficheiro?.id ?? null }));
    const updated = await strapi.entityService.update(UID, entity.id, { data: { fileLink }, populate: FILE_POPULATE });

    // Só depois de desligar da inscrição é que o ficheiro é apagado do Media Library.
    const file = await strapi.entityService.findOne('plugin::upload.file', fileId);
    if (file) await strapi.plugin('upload').service('upload').remove(file);

    ctx.body = { data: toResponse(updated) };
  },

  // "Concluir inscrição": bloqueia a candidatura e envia ao dono o email
  // para atestar os dados e confirmar a participação.
  async mineSubmit(ctx) {
    const entity = await findMine(ctx, FILE_POPULATE);
    if (!entity) return ctx.notFound();
    const locked = lockedReason(entity);
    if (locked) return ctx.forbidden(locked);
    if (service().expirada(entity)) {
      return ctx.forbidden('O prazo de candidaturas desta edição terminou.');
    }

    const missing = missingFields(entity);
    if (missing.length) return ctx.badRequest('Faltam campos obrigatórios.', { missing });

    const { token, hash } = service().newConfirmationToken();
    const updated = await strapi.entityService.update(UID, entity.id, {
      data: { submetida_em: new Date(), confirmacao_token: hash },
      populate: FILE_POPULATE,
    });
    try {
      await service().sendConfirmationEmail(updated, ctx.state.user.email, token);
    } catch (err) {
      strapi.log.error('Erro ao enviar email de confirmação da candidatura:', err);
    }
    ctx.body = { data: toResponse(updated) };
  },

  async mineResend(ctx) {
    const entity = await findMine(ctx);
    if (!entity) return ctx.notFound();
    if (!entity.submetida_em || entity.confirmada_em) return ctx.badRequest('Não há confirmação pendente.');

    const { token, hash } = service().newConfirmationToken();
    const updated = await strapi.entityService.update(UID, entity.id, { data: { confirmacao_token: hash }, populate: EDICAO_POPULATE });
    try {
      await service().sendConfirmationEmail(updated, ctx.state.user.email, token);
    } catch (err) {
      strapi.log.error('Erro ao reenviar email de confirmação da candidatura:', err);
      return ctx.internalServerError('Não foi possível enviar o email.');
    }
    ctx.body = { data: { ok: true } };
  },

  // Link do email (via página do site). POST de propósito: os scanners de
  // links dos clientes de email fazem GET e confirmariam sozinhos.
  async confirmar(ctx) {
    const token = ctx.request.body?.token;
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return ctx.badRequest('Link inválido ou expirado.');

    const [entity] = await strapi.entityService.findMany(UID, {
      filters: { confirmacao_token: service().hashToken(token), confirmada_em: { $null: true } },
      publicationState: 'preview',
      fields: ['id', 'nome_projeto', 'requer_confirmacao'],
      populate: EDICAO_POPULATE,
      limit: 1,
    });
    if (!entity || service().expirada(entity)) {
      return ctx.badRequest('Link inválido ou expirado.');
    }

    await strapi.entityService.update(UID, entity.id, { data: { confirmada_em: new Date(), confirmacao_token: null } });
    ctx.body = { data: { nome_projeto: entity.nome_projeto } };
  },
}));
