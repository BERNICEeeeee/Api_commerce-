jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn()
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  }
}));

const db = require('../db.js');
const { login } = require('./auth.controller.js');
const { getOneProduit, rechercherProduits } = require('./produits.controller.js');

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
});

describe('SQL injection input handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats an injection-like login email as a literal Prisma value', async () => {
    const email = "' OR '1'='1";
    const res = createResponse();
    db.user.findUnique.mockResolvedValue(null);

    await login()({ body: { email, password: 'mot-de-passe-test' } }, res);

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ erreur: 'Identifiants invalides.' });
  });

  it('rejects an injection-like product identifier before querying Prisma', async () => {
    const res = createResponse();

    await getOneProduit()({ params: { id: "1 OR '1'='1" } }, res);

    expect(db.product.findUnique).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ erreur: 'Identifiant produit invalide.' });
  });

  it('queries a single product by its numeric identifier', async () => {
    const res = createResponse();
    db.product.findUnique.mockResolvedValue({ id: 42 });

    await getOneProduit()({ params: { id: '42' } }, res);

    expect(db.product.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      include: {
        vendeur: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('searches product fields with an injection-like value treated as literal text', async () => {
    const q = "' OR '1'='1";
    const res = createResponse();
    db.product.findMany.mockResolvedValue([]);

    await rechercherProduits()({ query: { q } }, res);

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } }
        ]
      },
      include: {
        vendeur: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ produits: [] });
  });

  it('requires a non-empty search query', async () => {
    const res = createResponse();

    await rechercherProduits()({ query: { q: '  ' } }, res);

    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ erreur: 'Le paramètre q est requis.' });
  });

  it('rejects repeated search query parameters', async () => {
    const res = createResponse();

    await rechercherProduits()({ query: { q: ['velo', 'test'] } }, res);

    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ erreur: 'Le paramètre q est requis.' });
  });
});
