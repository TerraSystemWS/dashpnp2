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
          provider: 'nodemailer', // Use the nodemailer provider (SMTP)
          providerOptions: {
            host: process.env.SMTP_HOST,  // SMTP server for Gmail
            port: process.env.SMTP_PORT,  // SMTP port (587 for TLS, 465 for SSL)
            secure: true,  // Use TLS (true for port 465, false for 587)
            auth: {
              user: process.env.SMTP_USER, // Your email address (e.g., info@pnp.cv)
              pass: process.env.SMTP_PASSWORD, // Your email password or app password
            },
          },
          settings: {
            defaultFrom: process.env.SMTP_FROM,  // Your email sender
            defaultReplyTo: process.env.SMTP_REPLYTO, // Default reply-to address
            testAddress: process.env.SMTP_REPLYTO, // Test address for email sending
          },
        },
      },
});
