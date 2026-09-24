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

const FILE_POPULATE = {
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

// Formato { id, attributes } igual ao resto da API, para o frontend não mudar.
const toResponse = (entity) => {
  if (!entity) return null;
  const { id, fileLink, ...rest } = entity;
  delete rest.owner;
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

// Devolve a inscrição só se for do utilizador; caso contrário, null
// (o controller responde 404, sem revelar se o url existe).
const findMine = async (ctx, populate) => {
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
      fields: ['url', 'nome_projeto', 'categoria', 'publishedAt', 'createdAt', 'updatedAt'],
      publicationState: 'preview',
      sort: { createdAt: 'desc' },
    });
    ctx.body = { data: entities };
  },

  async mineCreate(ctx) {
    const { user } = ctx.state;
    if (!user.confirmed) return ctx.forbidden('Confirme o seu email antes de criar uma candidatura.');

    const entity = await strapi.entityService.create(UID, {
      data: {
        url: crypto.randomUUID(),
        owner: user.id,
        email: user.email,
        nome_completo: user.nome || null,
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
    if (entity.publishedAt) return ctx.forbidden('A candidatura já foi aceite e não pode ser alterada.');

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
    if (entity.publishedAt) return ctx.forbidden('A candidatura já foi aceite e não pode ser alterada.');

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
    if (entity.publishedAt) return ctx.forbidden('A candidatura já foi aceite e não pode ser alterada.');

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
}));
