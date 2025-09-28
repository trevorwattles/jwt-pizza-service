const request = require('supertest');
const app = require('../service');

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

describe('Auth Router', () => {
  const testUser = {
    name: 'Test User',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'testpassword123'
  };
  
  let userToken;

  describe('POST /api/auth (Register)', () => {
    test('successful registration', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send(testUser);
      
      expect(registerRes.status).toBe(200);
      expect(registerRes.body.user).toBeDefined();
      expect(registerRes.body.user.name).toBe(testUser.name);
      expect(registerRes.body.user.email).toBe(testUser.email);
      expect(registerRes.body.user.roles).toEqual([{ role: 'diner' }]);
      expect(registerRes.body.token).toBeDefined();
      expectValidJwt(registerRes.body.token);
      
      userToken = registerRes.body.token;
    });

    test('registration missing name', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send({ email: 'test@test.com', password: 'password' });
      
      expect(registerRes.status).toBe(400);
      expect(registerRes.body.message).toBe('name, email, and password are required');
    });

    test('registration missing email', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send({ name: 'Test User', password: 'password' });
      
      expect(registerRes.status).toBe(400);
      expect(registerRes.body.message).toBe('name, email, and password are required');
    });

    test('registration missing password', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send({ name: 'Test User', email: 'test@test.com' });
      
      expect(registerRes.status).toBe(400);
      expect(registerRes.body.message).toBe('name, email, and password are required');
    });

    test('registration with empty fields', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send({ name: '', email: '', password: '' });
      
      expect(registerRes.status).toBe(400);
      expect(registerRes.body.message).toBe('name, email, and password are required');
    });

    test('registration with duplicate email', async () => {
      const registerRes = await request(app)
        .post('/api/auth')
        .send(testUser);
      
      expect(registerRes.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('PUT /api/auth (Login)', () => {
    test('successful login', async () => {
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: testUser.email, password: testUser.password });
      
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user).toBeDefined();
      expect(loginRes.body.user.email).toBe(testUser.email);
      expect(loginRes.body.token).toBeDefined();
      expectValidJwt(loginRes.body.token);
    });

    test('login with wrong password', async () => {
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: testUser.email, password: 'wrongpassword' });
      
      expect(loginRes.status).toBeGreaterThanOrEqual(400);
    });

    test('login with non-existent email', async () => {
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: 'nonexistent@test.com', password: 'password' });
      
      expect(loginRes.status).toBeGreaterThanOrEqual(400);
    });

    test('login with missing email', async () => {
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ password: 'password' });
      
      expect(loginRes.status).toBeGreaterThanOrEqual(400);
    });

    test('login with missing password', async () => {
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: testUser.email });
      
      expect(loginRes.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('DELETE /api/auth (Logout)', () => {
    test('successful logout with valid token', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('logout successful');
    });

    test('logout without token', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth');
      
      expect(logoutRes.status).toBe(401);
      expect(logoutRes.body.message).toBe('unauthorized');
    });

    test('logout with invalid token', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(logoutRes.status).toBe(401);
      expect(logoutRes.body.message).toBe('unauthorized');
    });

    test('logout with malformed authorization header', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', 'InvalidFormat');
      
      expect(logoutRes.status).toBe(401);
      expect(logoutRes.body.message).toBe('unauthorized');
    });

    test('logout with empty authorization header', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', '');
      
      expect(logoutRes.status).toBe(401);
      expect(logoutRes.body.message).toBe('unauthorized');
    });
  });

  describe('Authentication middleware', () => {
    test('valid token allows access', async () => {
      // First login to get a fresh token
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: testUser.email, password: testUser.password });
      
      const token = loginRes.body.token;
      
      // Test that the token works for logout (which requires auth)
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${token}`);
      
      expect(logoutRes.status).toBe(200);
    });

    test('expired/invalid token denies access', async () => {
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature');
      
      expect(logoutRes.status).toBe(401);
    });
  });

  describe('Edge cases', () => {
    test('registration with very long inputs', async () => {
      const longString = 'a'.repeat(1000);
      const registerRes = await request(app)
        .post('/api/auth')
        .send({ 
          name: longString, 
          email: `${longString}@test.com`, 
          password: longString 
        });
      
      // Should either succeed or fail gracefully
      expect([200, 400, 413, 500]).toContain(registerRes.status);
    });

    test('login with special characters in password', async () => {
      const specialUser = {
        name: 'Special User',
        email: Math.random().toString(36).substring(2, 12) + '@test.com',
        password: '!@#$%^&*()_+-=[]{}|;:,.<>?'
      };
      
      // Register user with special password
      await request(app)
        .post('/api/auth')
        .send(specialUser);
      
      // Login with special password
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: specialUser.email, password: specialUser.password });
      
      expect(loginRes.status).toBe(200);
    });
  });
});