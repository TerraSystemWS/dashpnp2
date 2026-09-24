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
    { method: 'POST', path: '/inscricoes/confirmar', handler: 'inscricao.confirmar', config: { auth: false } },
    { method: 'GET', path: '/inscricoes/mine/:url', handler: 'inscricao.mineFindOne' },
    { method: 'POST', path: '/inscricoes/mine/:url/submeter', handler: 'inscricao.mineSubmit' },
    { method: 'POST', path: '/inscricoes/mine/:url/reenviar', handler: 'inscricao.mineResend' },
    { method: 'PUT', path: '/inscricoes/mine/:url', handler: 'inscricao.mineUpdate' },
    { method: 'POST', path: '/inscricoes/mine/:url/files', handler: 'inscricao.mineAttachFiles' },
    { method: 'DELETE', path: '/inscricoes/mine/:url/files/:fileId', handler: 'inscricao.mineDeleteFile' },
    { method: 'GET', path: '/inscricoes/:id/ficha', handler: 'inscricao.ficha' },
  ],
};
