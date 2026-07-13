'use strict';

/**
 * chunked-upload router
 */

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/chunked-upload/init',
      handler: 'chunked-upload.init',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/chunked-upload/:uploadId/chunks/:chunkIndex',
      handler: 'chunked-upload.uploadChunk',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/chunked-upload/:uploadId/status',
      handler: 'chunked-upload.status',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/chunked-upload/:uploadId/complete',
      handler: 'chunked-upload.complete',
      config: { policies: [] },
    },
  ],
};
