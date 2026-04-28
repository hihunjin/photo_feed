const request = require('supertest');
const db = require('../backend/db');
const auth = require('../backend/auth');
const app = require('../backend/index');
const fs = require('fs');
const path = require('path');

describe('Task 2.1: Band CRUD Operations', () => {
  let testDbPath;
  let userToken;
  let userId;
  let adminToken;
  let adminId;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../data/test-band.sqlite3');
    
    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.DATABASE = testDbPath;
    process.env.NODE_ENV = 'test';
    
    await db.initialize();

    // Create test user (regular user)
    const userPasswordHash = await auth.hashPassword('userpass123');
    await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      ['testuser', userPasswordHash, 'user']
    );
    
    const users = await db.query('SELECT id FROM users WHERE username = ?', ['testuser']);
    if (users.length > 0) {
      userId = users[0].id;
      userToken = auth.generateToken({
        id: userId,
        username: 'testuser',
        role: 'user'
      });
    }

    // Create test admin
    const adminPasswordHash = await auth.hashPassword('adminpass123');
    await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      ['admin', adminPasswordHash, 'admin']
    );
    
    const admins = await db.query('SELECT id FROM users WHERE username = ?', ['admin']);
    if (admins.length > 0) {
      adminId = admins[0].id;
      adminToken = auth.generateToken({
        id: adminId,
        username: 'admin',
        role: 'admin'
      });
    }
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('POST /api/bands - Create Band', () => {
    test('1. Create band successfully', async () => {
      const response = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'TestBand',
          description: 'A test band'
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('TestBand');
      expect(response.body.description).toBe('A test band');
      expect(response.body.created_by).toBe(userId);
    });

    test('2. Create band fails without authentication', async () => {
      const response = await request(app)
        .post('/api/bands')
        .send({
          name: 'NoAuthBand'
        });

      expect(response.status).toBe(401);
    });

    test('3. Create band fails with missing name', async () => {
      const response = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          description: 'No name provided'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/bands - List Bands', () => {
    beforeAll(async () => {
      // Create a few bands for listing
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/bands')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: `Band${i}`,
            description: `Band ${i} description`
          });
      }
    });

    test('4. Get all bands (public access)', async () => {
      const response = await request(app)
        .get('/api/bands');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.hasMore).toBeDefined();
    });

    test('5. Get bands with pagination', async () => {
      const response1 = await request(app)
        .get('/api/bands?limit=2');

      expect(response1.status).toBe(200);
      expect(response1.body.items.length).toBeLessThanOrEqual(2);
      
      if (response1.body.hasMore && response1.body.cursor) {
        const response2 = await request(app)
          .get(`/api/bands?limit=2&cursor=${response1.body.cursor}`);

        expect(response2.status).toBe(200);
        expect(response2.body.items.length).toBeGreaterThan(0);
      }
    });

    test('6. Bands visible without authentication', async () => {
      const response = await request(app)
        .get('/api/bands');

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/bands/:bandId - Get Band Details', () => {
    let bandId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'DetailTestBand',
          description: 'For detail testing'
        });
      
      bandId = response.body.id;
    });

    test('7. Get band details successfully', async () => {
      const response = await request(app)
        .get(`/api/bands/${bandId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(bandId);
      expect(response.body.name).toBe('DetailTestBand');
    });

    test('8. Get non-existent band returns 404', async () => {
      const response = await request(app)
        .get('/api/bands/99999');

      expect(response.status).toBe(404);
    });

    test('9. Band details accessible without authentication', async () => {
      const response = await request(app)
        .get(`/api/bands/${bandId}`);

      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /api/bands/:bandId - Update Band', () => {
    let bandId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'UpdateTestBand',
          description: 'Original description'
        });
      
      bandId = response.body.id;
    });

    test('10. Creator can update band', async () => {
      const response = await request(app)
        .patch(`/api/bands/${bandId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'UpdatedBand',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('UpdatedBand');
      expect(response.body.description).toBe('Updated description');
    });

    test('11. Other user cannot update band', async () => {
      // Create another user
      const otherPasswordHash = await auth.hashPassword('otherpass');
      await db.query(
        `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        ['otheruser', otherPasswordHash, 'user']
      );
      
      const others = await db.query('SELECT id FROM users WHERE username = ?', ['otheruser']);
      const otherToken = auth.generateToken({
        id: others[0].id,
        username: 'otheruser',
        role: 'user'
      });

      const response = await request(app)
        .patch(`/api/bands/${bandId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          name: 'HackedBand'
        });

      expect(response.status).toBe(403);
    });

    test('12. Admin can update any band', async () => {
      const response = await request(app)
        .patch(`/api/bands/${bandId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'AdminUpdatedBand'
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('AdminUpdatedBand');
    });

    test('13. Update fails without authentication', async () => {
      const response = await request(app)
        .patch(`/api/bands/${bandId}`)
        .send({
          name: 'NoAuthUpdate'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/bands/:bandId - Delete Band', () => {
    let bandId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'DeleteTestBand'
        });
      
      bandId = response.body.id;
    });

    test('14. Non-admin cannot delete band', async () => {
      const response = await request(app)
        .delete(`/api/bands/${bandId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    test('15. Admin can delete band', async () => {
      const response = await request(app)
        .delete(`/api/bands/${bandId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    test('16. Deleted band returns 404', async () => {
      const response = await request(app)
        .get(`/api/bands/${bandId}`);

      expect(response.status).toBe(404);
    });

    test('17. Delete non-existent band returns 404', async () => {
      const response = await request(app)
        .delete('/api/bands/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    test('18. Delete fails without authentication', async () => {
      const createResponse = await request(app)
        .post('/api/bands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'TempBand' });

      const response = await request(app)
        .delete(`/api/bands/${createResponse.body.id}`);

      expect(response.status).toBe(401);
    });
  });
});
