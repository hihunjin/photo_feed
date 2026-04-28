const request = require('supertest');
const db = require('../backend/db');
const auth = require('../backend/auth');
const app = require('../backend/index');
const fs = require('fs');
const path = require('path');

describe('Task 1.3: User Login & Profile API Endpoints', () => {
  let testDbPath;
  let testToken;
  let testUserId;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../data/test-api-auth.sqlite3');
    
    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.DATABASE = testDbPath;
    process.env.NODE_ENV = 'test';
    
    await db.initialize();

    // Create test user
    const passwordHash = await auth.hashPassword('testpass123');
    await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      ['alice', passwordHash, 'user']
    );
    
    // Get the inserted user
    const users = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', ['alice']);
    if (users.length > 0) {
      testUserId = users[0].id;
      testToken = auth.generateToken({
        id: testUserId,
        username: 'alice',
        role: 'user'
      });
    }
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('POST /api/auth/login', () => {
    test('1. Successful login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'alice',
          password: 'testpass123'
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBeGreaterThan(0);
      expect(response.body.user.username).toBe('alice');
      expect(response.body.user.role).toBe('user');
    });

    test('2. Login fails with non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'anypassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    test('3. Login fails with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'alice',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    test('4. Login fails with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'alice'
          // password missing
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/auth/me', () => {
    test('5. Get current user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('alice');
      expect(response.body.role).toBe('user');
      expect(response.body.createdAt).toBeDefined();
    });

    test('6. Access denied without Authorization header', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    test('7. Access denied with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    test('8. Access denied with invalid Authorization header format', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `InvalidFormat ${testToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('JWT Token Validation', () => {
    test('9. Token contains correct user information', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'alice',
          password: 'testpass123'
        });

      const token = loginResponse.body.accessToken;
      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.username).toBe('alice');
      expect(meResponse.body.id).toBe(loginResponse.body.user.id);
    });
  });

  describe('Multiple Users', () => {
    test('10. Different users can login and receive different tokens', async () => {
      // Create second user
      const passwordHash = await auth.hashPassword('bob123');
      await db.query(
        `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        ['bob', passwordHash, 'admin']
      );

      // Login as alice
      const aliceLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'alice',
          password: 'testpass123'
        });

      // Login as bob
      const bobLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'bob',
          password: 'bob123'
        });

      expect(aliceLogin.body.accessToken).not.toBe(bobLogin.body.accessToken);
      expect(aliceLogin.body.user.username).toBe('alice');
      expect(bobLogin.body.user.username).toBe('bob');
      expect(bobLogin.body.user.role).toBe('admin');
    });
  });
});
