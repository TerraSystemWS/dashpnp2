'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  // bootstrap(/*{ strapi }*/) {},
  bootstrap({ strapi }) {
    // Set the requestTimeout to 1,800,000 milliseconds (30 minutes):
    strapi.server.httpServer.requestTimeout = 30 * 60 * 1000;

    // Periodically purge chunked-upload staging files left behind by
    // abandoned uploads (tab closed mid-upload, etc).
    const cleanupInterval = setInterval(() => {
      strapi
        .service('api::chunked-upload.chunked-upload')
        .cleanupStaleUploads()
        .catch((err) => strapi.log.error('Erro ao limpar uploads em chunks expirados:', err));
    }, 60 * 60 * 1000);
    cleanupInterval.unref();
  },
};
