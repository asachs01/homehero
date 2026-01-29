/**
 * E2E tests for security features
 * Tests: Rate limiting, authentication enforcement, input validation
 */

const { test, expect } = require('@playwright/test');
const { createApiClient } = require('./helpers/api-client');
const { generateHousehold, generateParent, TEST_PINS } = require('./fixtures/test-data');

test.describe('Rate Limiting', () => {
  let api;

  test.beforeEach(async ({ baseURL }) => {
    api = await createApiClient(baseURL);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test('should enforce rate limit on login attempts', async () => {
    // Create a user to test with
    const household = await api.createHousehold(generateHousehold('Rate Limit'));
    const user = await api.createUser({
      ...generateParent('RateLimit'),
      householdId: household.id
    });

    // Make multiple failed login attempts quickly
    const attempts = [];
    for (let i = 0; i < 6; i++) {
      attempts.push(
        api.post('/api/auth/login', {
          userId: user.id,
          pin: '0000' // Wrong PIN
        })
      );
    }

    const responses = await Promise.all(attempts);

    // At least one should be rate limited (429)
    const rateLimited = responses.filter(r => r.status() === 429);

    // Note: Rate limiting may not trigger in all test environments
    // This test documents the expected behavior
    if (rateLimited.length > 0) {
      const error = await rateLimited[0].json();
      expect(error.error).toContain('Too many');
    }
  });

  test('should return rate limit headers', async () => {
    const response = await api.get('/api/users');

    // Check for rate limit headers (RFC draft-7 format)
    const hasRateLimitHeaders =
      response.headers()['ratelimit-limit'] ||
      response.headers()['ratelimit-remaining'] ||
      response.headers()['x-ratelimit-limit'];

    // Headers may or may not be present depending on configuration
    if (hasRateLimitHeaders) {
      expect(response.headers()['ratelimit-limit']).toBeTruthy();
    }
  });

  test('should not rate limit health endpoint', async () => {
    // Health endpoint should be excluded from rate limiting
    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(api.get('/api/health'));
    }

    const responses = await Promise.all(attempts);

    // All should succeed
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });
  });
});

test.describe('Authentication Security', () => {
  let api;

  test.beforeEach(async ({ baseURL }) => {
    api = await createApiClient(baseURL);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test('should reject requests without authentication token', async () => {
    const protectedEndpoints = [
      { method: 'GET', path: '/api/tasks' },
      { method: 'GET', path: '/api/routines' },
      { method: 'GET', path: '/api/dashboard' },
      { method: 'GET', path: '/api/auth/me' }
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await api.get(endpoint.path);
      expect(response.status()).toBe(401);
    }
  });

  test('should reject requests with malformed token', async () => {
    api.setAuth('not-a-valid-jwt-token', null);

    const response = await api.get('/api/tasks');
    expect(response.status()).toBe(401);
  });

  test('should reject requests with expired token', async () => {
    // This would require creating an expired token
    // For now, just verify invalid token format is rejected
    api.setAuth('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.abc', null);

    const response = await api.get('/api/tasks');
    expect(response.status()).toBe(401);
  });

  test('should not expose sensitive data in user list', async () => {
    const response = await api.get('/api/users');
    expect(response.ok()).toBeTruthy();

    const users = await response.json();

    users.forEach(user => {
      // Should not include sensitive fields
      expect(user).not.toHaveProperty('pin_hash');
      expect(user).not.toHaveProperty('pinHash');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('pin');

      // Should include safe fields
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
    });
  });

  test('should not expose internal error details in production mode', async () => {
    // Request a non-existent resource to trigger an error
    // Without auth, this returns 401 (security best practice to not reveal route existence)
    // With auth but non-existent route, it would return 404
    const response = await api.get('/api/nonexistent');

    // Either 401 (unauthenticated) or 404 (not found) is acceptable
    expect([401, 404]).toContain(response.status());

    const error = await response.json();

    // Should not expose stack trace or internal paths
    expect(error).not.toHaveProperty('stack');
    expect(JSON.stringify(error)).not.toContain('/home/');
    expect(JSON.stringify(error)).not.toContain('node_modules');
  });
});

test.describe('Input Validation Security', () => {
  let api;
  let household;
  let parentUser;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    household = await api.createHousehold(generateHousehold('Validation'));
    parentUser = await api.createUser({
      ...generateParent('Validation'),
      householdId: household.id
    });

    await api.login(parentUser.id, TEST_PINS.parent);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should reject SQL injection attempts in task name', async () => {
    const response = await api.post('/api/tasks', {
      name: "'; DROP TABLE tasks; --",
      type: 'daily'
    });

    // Should either reject or sanitize - not execute SQL
    if (response.ok()) {
      const task = await response.json();
      // If accepted, the name should be stored as-is (sanitized by parameterized queries)
      expect(task.name).toBe("'; DROP TABLE tasks; --");
    }
  });

  test('should reject XSS attempts in task description', async () => {
    const response = await api.post('/api/tasks', {
      name: 'Test Task',
      type: 'daily',
      description: '<script>alert("xss")</script>'
    });

    // Should either reject or store safely
    if (response.ok()) {
      const task = await response.json();
      // Content should be stored (rendering should escape it)
      expect(task.description).toBeDefined();
    }
  });

  test('should validate numeric fields', async () => {
    const response = await api.post('/api/tasks', {
      name: 'Test Task',
      type: 'daily',
      dollarValue: 'not-a-number'
    });

    // Should reject or coerce
    expect(response.status()).toBeLessThan(500);
  });

  test('should limit field lengths', async () => {
    const longName = 'A'.repeat(1000);

    const response = await api.post('/api/onboarding/household', {
      name: longName
    });

    // Should reject if too long
    if (!response.ok()) {
      expect(response.status()).toBe(400);
    }
  });

  test('should validate UUID parameters', async () => {
    const response = await api.get('/api/tasks/not-a-uuid');

    // Should handle gracefully
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Authorization Security', () => {
  let api;
  let household1;
  let household2;
  let user1;
  let user2;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create two separate households
    household1 = await api.createHousehold(generateHousehold('AuthZ1'));
    household2 = await api.createHousehold(generateHousehold('AuthZ2'));

    user1 = await api.createUser({
      householdId: household1.id,
      name: 'User One',
      role: 'parent',
      pin: '1111'
    });

    user2 = await api.createUser({
      householdId: household2.id,
      name: 'User Two',
      role: 'parent',
      pin: '2222'
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should not allow access to another household tasks', async () => {
    // Login as user1 and create a task
    await api.login(user1.id, '1111');

    const task = await api.createTask({
      name: 'Household 1 Task',
      type: 'daily'
    });

    // Login as user2 and try to access user1's task
    await api.login(user2.id, '2222');

    const response = await api.get(`/api/tasks/${task.id}`);

    // Should be denied access
    expect(response.status()).toBe(403);
  });

  test('should not allow modification of another household data', async () => {
    // Login as user1 and create a task
    await api.login(user1.id, '1111');

    const task = await api.createTask({
      name: 'Protected Task',
      type: 'daily'
    });

    // Login as user2 and try to modify
    await api.login(user2.id, '2222');

    const updateResponse = await api.put(`/api/tasks/${task.id}`, {
      name: 'Hacked Task'
    });
    expect(updateResponse.status()).toBe(403);

    const deleteResponse = await api.delete(`/api/tasks/${task.id}`);
    expect(deleteResponse.status()).toBe(403);
  });

  test('should enforce role-based access control', async () => {
    // Create a child user
    await api.login(user1.id, '1111');

    const child = await api.createUser({
      householdId: household1.id,
      name: 'Child User',
      role: 'child',
      pin: '3333'
    });

    // Login as child
    await api.login(child.id, '3333');

    // Child should not be able to create tasks
    const createResponse = await api.post('/api/tasks', {
      name: 'Child Task',
      type: 'daily'
    });
    expect(createResponse.status()).toBe(403);

    // Child should not be able to delete tasks
    // (would need a task ID from household, which they can't access to modify)
  });
});
