import type { Schema, Attribute } from '@strapi/strapi';

export interface CategoriaCategoria extends Schema.Component {
  collectionName: 'components_categoria_categorias';
  info: {
    displayName: 'Categoria';
  };
  attributes: {
    titulo: Attribute.String;
    descricao: Attribute.Blocks;
    capa: Attribute.Media;
  };
}

export interface DocsDocumentos extends Schema.Component {
  collectionName: 'components_docs_documentos';
  info: {
    displayName: 'documentos';
    description: '';
  };
  attributes: {
    titulo: Attribute.String & Attribute.Required;
    ficheiro: Attribute.Media;
    publico: Attribute.Boolean &
      Attribute.Required &
      Attribute.DefaultTo<false>;
  };
}

export interface GaleriaGaleria extends Schema.Component {
  collectionName: 'components_galeria_galerias';
  info: {
    displayName: 'Galeria';
  };
  attributes: {
    titulo: Attribute.String;
    imagens: Attribute.Media;
  };
}

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

export interface JuriJuri extends Schema.Component {
  collectionName: 'components_juri_juris';
  info: {
    displayName: 'juri';
  };
  attributes: {
    foto: Attribute.Media;
    nome: Attribute.String & Attribute.Required;
    descricao: Attribute.Blocks;
    titulo: Attribute.String;
  };
}

export interface OrganizacaoOrganizacao extends Schema.Component {
  collectionName: 'components_organizacao_organizacaos';
  info: {
    displayName: 'Organiza\u00E7\u00E3o';
  };
  attributes: {
    logo: Attribute.Media;
    link: Attribute.String;
    tipo: Attribute.Enumeration<['Ouro', 'Prata', 'Bronze', 'Diamante']> &
      Attribute.DefaultTo<'Bronze'>;
    titulo: Attribute.String & Attribute.Required;
  };
}

export interface RegulamentosRegulamentos extends Schema.Component {
  collectionName: 'components_regulamentos_regulamentos';
  info: {
    displayName: 'Regulamentos';
  };
  attributes: {
    titulo: Attribute.String;
    descricao: Attribute.Blocks;
  };
}

export interface RsociaisLinks extends Schema.Component {
  collectionName: 'components_rsociais_links';
  info: {
    displayName: 'Links';
  };
  attributes: {
    canal: Attribute.Enumeration<
      [
        '<IoLogoFacebook/>',
        '<IoLogoInstagram/>',
        '<IoLogoYoutube/>',
        '<IoLogoTwitter/>'
      ]
    >;
    link: Attribute.String & Attribute.Required;
    Titulo: Attribute.String;
  };
}

export interface VideosVideos extends Schema.Component {
  collectionName: 'components_videos_videos';
  info: {
    displayName: 'Videos';
  };
  attributes: {
    video: Attribute.Media;
    titulo: Attribute.String;
    subtitulo: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'categoria.categoria': CategoriaCategoria;
      'docs.documentos': DocsDocumentos;
      'galeria.galeria': GaleriaGaleria;
      'image-box.image-box': ImageBoxImageBox;
      'juri.juri': JuriJuri;
      'organizacao.organizacao': OrganizacaoOrganizacao;
      'regulamentos.regulamentos': RegulamentosRegulamentos;
      'rsociais.links': RsociaisLinks;
      'videos.videos': VideosVideos;
    }
  }
}
