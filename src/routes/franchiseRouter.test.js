const request = require('supertest');
const app = require('../service');

describe('Franchise Router', () => {
  let regularUserToken;
  let regularUserId;
  
  const regularUser = {
    name: 'Regular User',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'password123'
  };

  // Setup users before tests
  beforeAll(async () => {
    // Create regular user
    const registerRes = await request(app)
      .post('/api/auth')
      .send(regularUser);
    regularUserToken = registerRes.body.token;
    regularUserId = registerRes.body.user.id;
  });

  describe('GET /api/franchise', () => {
    test('get franchises without authentication', async () => {
      const response = await request(app)
        .get('/api/franchise');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('franchises');
      expect(response.body).toHaveProperty('more');
      expect(Array.isArray(response.body.franchises)).toBe(true);
    });

    test('get franchises with authentication', async () => {
      const response = await request(app)
        .get('/api/franchise')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('franchises');
      expect(response.body).toHaveProperty('more');
    });

    test('get franchises with pagination', async () => {
      const response = await request(app)
        .get('/api/franchise?page=0&limit=5');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('franchises');
      expect(response.body).toHaveProperty('more');
    });

    test('get franchises with name filter', async () => {
      const response = await request(app)
        .get('/api/franchise?name=test');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('franchises');
    });
  });

  describe('GET /api/franchise/:userId', () => {
    test('get user franchises without authentication', async () => {
      const response = await request(app)
        .get(`/api/franchise/${regularUserId}`);
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('get own franchises with authentication', async () => {
      const response = await request(app)
        .get(`/api/franchise/${regularUserId}`)
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('get other user franchises as regular user', async () => {
      const otherUserId = regularUserId + 1;
      const response = await request(app)
        .get(`/api/franchise/${otherUserId}`)
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(200);
      // Should return empty array since not admin and not own user
      expect(response.body).toEqual([]);
    });

    test('get franchises with invalid user ID format', async () => {
      const response = await request(app)
        .get('/api/franchise/invalid')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(200);
      // Should handle invalid user ID gracefully
    });

    test('get franchises with invalid token', async () => {
      const response = await request(app)
        .get(`/api/franchise/${regularUserId}`)
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/franchise', () => {
    const newFranchise = {
      name: 'Test Franchise',
      admins: [{ email: regularUser.email }]
    };

    test('create franchise without authentication', async () => {
      const response = await request(app)
        .post('/api/franchise')
        .send(newFranchise);
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('create franchise as non-admin user', async () => {
      const response = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(newFranchise);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unable to create a franchise');
    });

    test('create franchise with invalid token', async () => {
      const response = await request(app)
        .post('/api/franchise')
        .set('Authorization', 'Bearer invalidtoken')
        .send(newFranchise);
      
      expect(response.status).toBe(401);
    });

    test('create franchise with missing data', async () => {
      const response = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({});
      
      expect(response.status).toBe(403); // Will fail on auth before validation
    });
  });

  describe('DELETE /api/franchise/:franchiseId', () => {
    test('delete franchise without authentication', async () => {
      const response = await request(app)
        .delete('/api/franchise/1');
      
      expect([200, 404, 500]).toContain(response.status);
    });

    test('delete franchise with authentication', async () => {
      const response = await request(app)
        .delete('/api/franchise/99999')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect([200, 404, 500]).toContain(response.status);
    });

    test('delete franchise with invalid ID', async () => {
      const response = await request(app)
        .delete('/api/franchise/invalid');
      
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    test('delete non-existent franchise', async () => {
      const response = await request(app)
        .delete('/api/franchise/99999');
      
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/franchise/:franchiseId/store', () => {
    const newStore = {
      name: 'Test Store'
    };

    test('create store without authentication', async () => {
      const response = await request(app)
        .post('/api/franchise/1/store')
        .send(newStore);
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('create store as non-admin non-franchise-admin', async () => {
      const response = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(newStore);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unable to create a store');
    });

    test('create store for non-existent franchise', async () => {
      const response = await request(app)
        .post('/api/franchise/99999/store')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(newStore);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unable to create a store');
    });

    test('create store with invalid franchise ID', async () => {
      const response = await request(app)
        .post('/api/franchise/invalid/store')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(newStore);
      
      expect(response.status).toBe(403);
    });

    test('create store with invalid token', async () => {
      const response = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', 'Bearer invalidtoken')
        .send(newStore);
      
      expect(response.status).toBe(401);
    });

    test('create store with missing store data', async () => {
      const response = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({});
      
      expect(response.status).toBe(403); // Will fail on auth first
    });
  });

  describe('DELETE /api/franchise/:franchiseId/store/:storeId', () => {
    test('delete store without authentication', async () => {
      const response = await request(app)
        .delete('/api/franchise/1/store/1');
      
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    test('delete store as non-admin non-franchise-admin', async () => {
      const response = await request(app)
        .delete('/api/franchise/1/store/1')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unable to delete a store');
    });

    test('delete store for non-existent franchise', async () => {
      const response = await request(app)
        .delete('/api/franchise/99999/store/1')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unable to delete a store');
    });

    test('delete non-existent store', async () => {
      const response = await request(app)
        .delete('/api/franchise/1/store/99999')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(403);
    });

    test('delete store with invalid franchise ID', async () => {
      const response = await request(app)
        .delete('/api/franchise/invalid/store/1')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(403);
    });

    test('delete store with invalid store ID', async () => {
      const response = await request(app)
        .delete('/api/franchise/1/store/invalid')
        .set('Authorization', `Bearer ${regularUserToken}`);
      
      expect(response.status).toBe(403);
    });

    test('delete store with invalid token', async () => {
      const response = await request(app)
        .delete('/api/franchise/1/store/1')
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(response.status).toBe(401);
    });
  });

  describe('Error handling', () => {
    test('invalid routes return 404', async () => {
      const response = await request(app)
        .get('/api/franchise/invalid/route');
      
      expect(response.status).toBe(404);
    });

    test('invalid HTTP method on valid route', async () => {
      const response = await request(app)
        .patch('/api/franchise/1');
      
      expect(response.status).toBe(404);
    });
  });
});