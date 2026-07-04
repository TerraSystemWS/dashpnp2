module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  // 'strapi::body',
  {
    name: "strapi::body",
    config: {
      formLimit: "512mb",
      jsonLimit: "512mb",
      textLimit: "512mb",
      formidable: {
        maxFileSize: 1024 * 1024 * 1024, // 1 GB
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
