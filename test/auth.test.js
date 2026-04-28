const auth = require('../backend/auth');
const db = require('../backend/db');
const fs = require('fs');
const path = require('path');

describe('Task 1.2: User Authentication (JWT + Password Hashing)', () => {
  let testDbPath;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../data/test-auth.sqlite3');
    
    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.DATABASE = testDbPath;
    await db.initialize();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Password Hashing', () => {
    test('1. Hash password correctly', async () => {
      const password = 'password123';
      const hash = await auth.hashPassword(password);
      expect(hash).not.toEqual(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    test('2. Verify correct password', async () => {
      const password = 'password123';
      const hash = await auth.hashPassword(password);
      const match = await auth.verifyPassword(password, hash);
      expect(match).toBe(true);
    });

    test('3. Reject incorrect password', async () => {
      const password = 'password123';
      const hash = await auth.hashPassword(password);
      const match = await auth.verifyPassword('wrongpassword', hash);
      expect(match).toBe(false);
    });
  });

  describe('User Creation with Password Hash', () => {
    test('4. Create user with hashed password', async () => {
      const password = 'testpass123';
      const passwordHash = await auth.hashPassword(password);
      
      const result = await db.query(
        `INSERT INTO users (username, password_hash, role) 
         VALUES (?, ?, ?)`,
        ['testuser1', passwordHash, 'user']
      );
      
      expect(result).toBeDefined();
      
      // Verify user was created
      const user = await db.query(
        'SELECT * FROM users WHERE username = ?',
        ['testuser1']
      );
      expect(user.length).toBe(1);
    });
  });

  describe('JWT Token Generation', () => {
    test('5. Generate JWT token', () => {
      const payload = { id: 1, username: 'testuser', role: 'user' };
      const token = auth.generateToken(payload);
      
      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    test('6. Verify JWT token', () => {
      const payload = { id: 1, username: 'testuser', role: 'user' };
      const token = auth.generateToken(payload);
      const decoded = auth.verifyToken(token);
      
      expect(decoded.id).toBe(payload.id);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
    });

    test('7. Reject invalid token', () => {
      expect(() => {
        auth.verifyToken('invalid.token.here');
      }).toThrow();
    });

    test('8. Reject expired token', () => {
      // Create a token with very short expiry for testing
      const jwt = require('jsonwebtoken');
      const shortLivedToken = jwt.sign(
        { id: 1 },
        process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
        { expiresIn: '0s' }
      );
      
      // Wait a moment to ensure expiry
      setTimeout(() => {
        expect(() => {
          auth.verifyToken(shortLivedToken);
        }).toThrow();
      }, 100);
    });
  });

  describe('Token Extraction', () => {
    test('9. Extract token from Authorization header', () => {
      const payload = { id: 1 };
      const token = auth.generateToken(payload);
      const header = `Bearer ${token}`;
      
      const extracted = auth.extractTokenFromHeader(header);
      expect(extracted).toBe(token);
    });

    test('10. Reject invalid Authorization header format', () => {
      expect(auth.extractTokenFromHeader('InvalidFormat token')).toBeNull();
      expect(auth.extractTokenFromHeader('Bearer')).toBeNull();
      expect(auth.extractTokenFromHeader(null)).toBeNull();
    });
  });

  describe('User Authentication Flow', () => {
    test('11. Complete user registration and login flow', async () => {
      const username = 'newuser';
      const password = 'securepass123';
      
      // Register: hash password and store
      const passwordHash = await auth.hashPassword(password);
      await db.query(
        `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        [username, passwordHash, 'user']
      );
      
      // Login: retrieve user and verify password
      const user = await db.query(
        'SELECT id, username, password_hash, role FROM users WHERE username = ?',
        [username]
      );
      expect(user.length).toBe(1);
      
      const passwordMatch = await auth.verifyPassword(password, user[0].password_hash);
      expect(passwordMatch).toBe(true);
      
      // Generate token
      const token = auth.generateToken({
        id: user[0].id,
        username: user[0].username,
        role: user[0].role
      });
      expect(token).not.toBeNull();
    });
  });
});
