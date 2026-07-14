import { CloudUpload } from '@strapi/icons';

const config = {
  locales: [],
};

const bootstrap = (app) => {
  app.addMenuLink({
    to: '/plugins/chunked-upload',
    icon: CloudUpload,
    intlLabel: {
      id: 'chunked-upload.plugin.name',
      defaultMessage: 'Upload de Ficheiros Grandes',
    },
    permissions: [],
    Component: async () => {
      const component = await import('./pages/ChunkedUpload');

      return component;
    },
  });
};

export default {
  config,
  bootstrap,
};
