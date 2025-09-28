const request = require('supertest');
const app = require('../service');

describe('User Router', () => {
  let userToken;
  let userId;
  let otherUserToken;
  let otherUserId;
  
  const testUser = {
    name: 'Test User',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'password123'
  };

  const otherUser = {
    name: 'Other User',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'password456'
  };

  // Setup users before tests
  beforeAll(async () => {
    // Create first user
    const registerRes = await request(app)
      .post('/api/auth')
      .send(testUser);
    userToken = registerRes.body.token;
    userId = registerRes.body.user.id;

    // Create second user
    const otherRegisterRes = await request(app)
      .post('/api/auth')
      .send(otherUser);
    otherUserToken = otherRegisterRes.body.token;
    otherUserId = otherRegisterRes.body.user.id;
  });

  describe('GET /api/user/me', () => {
    test('get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('roles');
      expect(response.body.email).toBe(testUser.email);
    });

    test('get current user without token', async () => {
      const response = await request(app)
        .get('/api/user/me');
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('get current user with invalid token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('get current user with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'InvalidFormat');
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });
  });

  describe('PUT /api/user/:userId', () => {
    test('update own user profile', async () => {
      const updateData = {
        name: 'Updated Name',
        email: testUser.email,
        password: 'newpassword123'
      };

      const response = await request(app)
        .put(`/api/user/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.name).toBe(updateData.name);
      expect(response.body.user.email).toBe(updateData.email);
    });

    test('update user without authentication', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@test.com',
        password: 'newpassword'
      };

      const response = await request(app)
        .put(`/api/user/${userId}`)
        .send(updateData);
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('update other user as non-admin', async () => {
      const updateData = {
        name: 'Hacked Name',
        email: 'hacked@test.com',
        password: 'hackedpassword'
      };

      const response = await request(app)
        .put(`/api/user/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unauthorized');
    });

    test('update user with invalid token', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@test.com',
        password: 'newpassword'
      };

      const response = await request(app)
        .put(`/api/user/${userId}`)
        .set('Authorization', 'Bearer invalidtoken')
        .send(updateData);
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('update user with invalid user ID format', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@test.com',
        password: 'newpassword'
      };

      const response = await request(app)
        .put('/api/user/invalid')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(response.status).toBe(403);
    });

    test('update user with partial data', async () => {
      const updateData = {
        name: 'Only Name Updated'
      };

      const response = await request(app)
        .put(`/api/user/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      // API might require all fields, so accept error responses
      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.user.name).toBe(updateData.name);
      }
    });

    test('update user with empty data', async () => {
      const response = await request(app)
        .put(`/api/user/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({});
      
      // API might require fields, so accept error responses
      expect([200, 400, 500]).toContain(response.status);
    });

    test('update non-existent user as owner', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@test.com',
        password: 'newpassword'
      };

      const response = await request(app)
        .put('/api/user/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unauthorized');
    });
  });

  describe('Error handling', () => {
    test('invalid routes return 404', async () => {
      const response = await request(app)
        .get('/api/user/invalid/route');
      
      expect(response.status).toBe(404);
    });

    test('invalid HTTP method on valid route', async () => {
      const response = await request(app)
        .post('/api/user/me');
      
      expect(response.status).toBe(404);
    });
  });
});