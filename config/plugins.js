module.exports = ({env}) => ({
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
              maxage: 300000,
              sizeLimit: 1024 * 1024 * 1024 // 256mb in bytes
            },
          },
        },
      },
      email: {
        config: {
          provider: 'sendmail', // For community providers pass the full package name (e.g. provider: 'strapi-provider-email-mandrill')
          providerOptions: {
           // apiKey: env('SENDGRID_API_KEY'),
          },
          settings: {
            defaultFrom: 'info@pnp.cv',
            defaultReplyTo: 'info@pnp.cv',
            testAddress: 'info@pnp.cv',
          },
        },
      },
});
