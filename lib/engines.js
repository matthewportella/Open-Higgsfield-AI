// Catalog of generation engines ("motores"). To add a new provider, add an
// entry here, insert a row with the same id in the `engines` table, and wire
// its calls through a server route that reads the key with engineKey().

export const ENGINES = [
  {
    id: 'apimart',
    name: 'APIMart',
    description: 'Seedance 2.5 para vídeo: criar, estender e editar, de 4 a 30 s, até 1080p.',
    powers: ['Vídeo'],
    keyUrl: 'https://apimart.ai/keys',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'muapi',
    name: 'Muapi',
    description: 'Mais de 200 modelos para os estúdios de Imagem, Cinema e Lip Sync.',
    powers: ['Imagem', 'Cinema', 'Lip Sync'],
    keyUrl: 'https://muapi.ai',
    keyPlaceholder: 'Cole a chave da Muapi',
  },
];
