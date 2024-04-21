module.exports = () => ({
    "strapi-plugin-populate-deep": {
        config: {
          defaultDepth: 3, // Default is 5
        },
      },
      // ckeditor: true,
      ckeditor5: {
        enabled: true,
        // resolve: "./src/plugins/strapi-plugin-ckeditor"
      },
      menus: {
        config: {
          maxDepth: 3,
        },
    },
    upload: {
        config: {
          providerOptions: {
            localServer: {
              maxage: 300000
            },
          },
        },
      },
});
