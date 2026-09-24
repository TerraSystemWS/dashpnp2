'use strict';

/**
 * Votação pública com conta. Carrega antes do router core ("01-").
 */

module.exports = {
  routes: [
    { method: 'GET', path: '/votacao-publicas/me', handler: 'votacao-publica.me' },
    { method: 'POST', path: '/votacao-publicas/votar', handler: 'votacao-publica.votar' },
  ],
};
