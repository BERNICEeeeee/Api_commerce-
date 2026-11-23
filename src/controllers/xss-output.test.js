jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn()
  },
  product: {
    findUnique: jest.fn()
  }
}));

jest.mock('../models/Comment', () => ({
  create: jest.fn()
}));

const db = require('../db.js');
const Comment = require('../models/Comment');
const { addComment } = require('./comments.controller.js');

describe('user text output', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps an HTML-looking comment as plain text data', async () => {
    const content = '<img src=x onerror=alert(1)>';
    const savedComment = { content };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    db.user.findUnique.mockResolvedValue({
      id: 5,
      role: 'client',
      banned: false,
      name: 'Client'
    });
    db.product.findUnique.mockResolvedValue({ id: 7 });
    Comment.create.mockResolvedValue(savedComment);

    await addComment()(
      {
        params: { productId: '7' },
        body: { content, rating: 4 },
        user: { id: 5 }
      },
      res
    );

    expect(Comment.create).toHaveBeenCalledWith({
      productId: 7,
      userId: 5,
      userName: 'Client',
      content,
      rating: 4
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Commentaire ajouté.',
      comment: savedComment
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
