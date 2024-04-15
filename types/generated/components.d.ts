import type { Schema, Attribute } from '@strapi/strapi';

export interface ImageBoxImageBox extends Schema.Component {
  collectionName: 'components_image_box_image_boxes';
  info: {
    displayName: 'imageBox';
  };
  attributes: {
    image: Attribute.Media;
    titulo: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'image-box.image-box': ImageBoxImageBox;
    }
  }
}
