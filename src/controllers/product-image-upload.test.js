jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn()
  },
  product: {
    create: jest.fn()
  }
}));

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const db = require('../db.js');

let app;
let server;
let baseUrl;
let uploadDirectory;
let token;

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

const upload = async (fileName, bytes, contentType = 'image/jpeg') => {
  const form = new FormData();
  form.set('name', 'Produit de test');
  form.set('price', '12.5');
  form.set('image', new Blob([bytes], { type: contentType }), fileName);

  return fetch(`${baseUrl}/produits/ajouter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
};

describe('product image upload', () => {
  beforeAll(async () => {
    uploadDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'api-product-images-'));
    process.env.UPLOAD_DIR = uploadDirectory;
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';

    app = require('../app.js');
    token = jwt.sign(
      { id: 5, role: 'vendeur' },
      process.env.JWT_SECRET,
      { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE }
    );

    db.user.findUnique.mockResolvedValue({ id: 5, banned: false });
    db.product.create.mockImplementation(({ data }) => Promise.resolve({ id: 42, ...data }));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fs.rm(uploadDirectory, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: 5, banned: false });
    db.product.create.mockImplementation(({ data }) => Promise.resolve({ id: 42, ...data }));
  });

  it('rejects PHP, SVG, and a script renamed to .jpg', async () => {
    const uploads = [
      ['script.php', Buffer.from('<?php echo "no"; ?>'), 'application/octet-stream'],
      ['vector.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
      ['script.jpg', Buffer.from('<?php echo "no"; ?>'), 'image/jpeg']
    ];

    for (const [fileName, bytes, contentType] of uploads) {
      const response = await upload(fileName, bytes, contentType);
      expect(response.status).toBe(400);
      expect((await response.json()).erreur).toContain('Type de fichier refusé');
    }

    expect(db.product.create).not.toHaveBeenCalled();
    expect(await fs.readdir(uploadDirectory)).toEqual([]);
  });

  it('rejects an upload larger than 5 MB', async () => {
    const response = await upload('large.jpg', Buffer.alloc(5 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ erreur: 'L’image dépasse la taille maximale de 5 Mo.' });
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it('renames a valid image and serves it as an attachment with nosniff', async () => {
    const response = await upload('photo.jpg', jpegBytes);
    expect(response.status).toBe(201);
    const { produit } = await response.json();

    expect(produit.imageUrl).toMatch(/^\/produits\/images\/[0-9a-f-]+\.jpg$/);
    expect(produit.imageUrl).not.toContain('photo.jpg');

    const imageResponse = await fetch(`${baseUrl}${produit.imageUrl}`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get('content-type')).toBe('image/jpeg');
    expect(imageResponse.headers.get('content-disposition')).toContain('attachment');
    expect(imageResponse.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(jpegBytes);
  });
});
