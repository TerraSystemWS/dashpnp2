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
        maxFileSize: 512 * 1024 * 1024, // 512 MB
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
