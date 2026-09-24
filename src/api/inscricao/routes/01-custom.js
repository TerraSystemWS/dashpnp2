'use strict';

/**
 * Rotas do candidato (inscrições da própria conta) e ficha para o júri.
 * O prefixo "01-" faz este ficheiro carregar antes do router core, para
 * /inscricoes/mine não ser apanhado por /inscricoes/:id.
 */

module.exports = {
  routes: [
    { method: 'GET', path: '/inscricoes/mine', handler: 'inscricao.mineList' },
    { method: 'POST', path: '/inscricoes/mine', handler: 'inscricao.mineCreate' },
    { method: 'GET', path: '/inscricoes/mine/:url', handler: 'inscricao.mineFindOne' },
    { method: 'PUT', path: '/inscricoes/mine/:url', handler: 'inscricao.mineUpdate' },
    { method: 'POST', path: '/inscricoes/mine/:url/files', handler: 'inscricao.mineAttachFiles' },
    { method: 'DELETE', path: '/inscricoes/mine/:url/files/:fileId', handler: 'inscricao.mineDeleteFile' },
    { method: 'GET', path: '/inscricoes/:id/ficha', handler: 'inscricao.ficha' },
  ],
};
