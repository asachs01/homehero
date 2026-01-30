/**
 * E2E tests for authentication flow
 * Tests: User login with PIN, JWT token handling, auth protection
 */

const { test, expect } = require('@playwright/test');
const { createApiClient } = require('./helpers/api-client');
const { generateHousehold, generateParent, generateChild, TEST_PINS } = require('./fixtures/test-data');

test.describe('Authentication API', () => {
  let api;
  let household;
  let parentUser;
  let childUser;

  test.beforeAll(async ({ baseURL }) => {
    // Set up test data
    api = await createApiClient(baseURL);

    // Create household and users
    household = await api.createHousehold(generateHousehold('Auth Tests'));

    parentUser = await api.createUser({
      ...generateParent('Auth'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('Auth'),
      householdId: household.id
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should list available users for login', async () => {
    const response = await api.get('/api/users');
    expect(response.ok()).toBeTruthy();

    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);

    // Find our test users
    const foundParent = users.find(u => u.id === parentUser.id);
    const foundChild = users.find(u => u.id === childUser.id);

    expect(foundParent).toBeTruthy();
    expect(foundChild).toBeTruthy();

    // Users should only include safe fields
    expect(foundParent).not.toHaveProperty('pin_hash');
    expect(foundParent).toHaveProperty('name');
    expect(foundParent).toHaveProperty('avatar');
  });

  test('should login parent with correct PIN', async () => {
    const response = await api.post('/api/auth/login', {
      userId: parentUser.id,
      pin: TEST_PINS.parent
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('token');
    expect(data).toHaveProperty('user');
    expect(data.user.id).toBe(parentUser.id);
    expect(data.user.role).toBe('parent');
  });

  test('should login child with correct PIN', async () => {
    const response = await api.post('/api/auth/login', {
      userId: childUser.id,
      pin: TEST_PINS.child
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('token');
    expect(data.user.id).toBe(childUser.id);
    expect(data.user.role).toBe('child');
  });

  test('should reject login with incorrect PIN', async () => {
    const response = await api.post('/api/auth/login', {
      userId: parentUser.id,
      pin: TEST_PINS.invalid
    });

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);

    const error = await response.json();
    expect(error.error).toContain('Invalid');
  });

  test('should reject login with missing credentials', async () => {
    // Missing PIN
    const response1 = await api.post('/api/auth/login', {
      userId: parentUser.id
    });
    expect(response1.status()).toBe(400);

    // Missing userId
    const response2 = await api.post('/api/auth/login', {
      pin: TEST_PINS.parent
    });
    expect(response2.status()).toBe(400);
  });

  test('should reject login for non-existent user', async () => {
    const response = await api.post('/api/auth/login', {
      userId: '00000000-0000-0000-0000-000000000000',
      pin: TEST_PINS.parent
    });

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);
  });

  test('should access protected endpoint with valid token', async () => {
    // Login first
    const loginData = await api.login(parentUser.id, TEST_PINS.parent);
    expect(loginData.token).toBeTruthy();

    // Access protected endpoint
    const response = await api.get('/api/auth/me');
    expect(response.ok()).toBeTruthy();

    const me = await response.json();
    expect(me.id).toBe(parentUser.id);
    expect(me.name).toBe(parentUser.name);
  });

  test('should reject protected endpoint without token', async () => {
    api.clearAuth();

    const response = await api.get('/api/auth/me');
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);
  });

  test('should reject protected endpoint with invalid token', async () => {
    api.setAuth('invalid-token', null);

    const response = await api.get('/api/auth/me');
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);

    api.clearAuth();
  });
});

test.describe('Authentication UI', () => {
  let api;
  let household;
  let childUser;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create test household and users
    household = await api.createHousehold(generateHousehold('UI Auth Tests'));

    await api.createUser({
      ...generateParent('UI'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('UI'),
      householdId: household.id
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should display user selection on login page', async ({ page }) => {
    await page.goto('/login.html');

    // Wait for users to load
    await page.waitForSelector('.user-card', { timeout: 10000 });

    // Verify user cards are displayed
    const userCards = await page.locator('.user-card').count();
    expect(userCards).toBeGreaterThan(0);
  });

  test('should show PIN entry when user is selected', async ({ page }) => {
    await page.goto('/login.html');

    // Wait for users and click on a user card
    await page.waitForSelector('.user-card');
    await page.locator('.user-card').first().click();

    // PIN entry should be visible
    await expect(page.locator('#pin-entry')).toBeVisible();
    await expect(page.locator('.numpad')).toBeVisible();
    await expect(page.locator('.pin-dots')).toBeVisible();
  });

  test('should go back to user selection', async ({ page }) => {
    await page.goto('/login.html');

    // Select a user
    await page.waitForSelector('.user-card');
    await page.locator('.user-card').first().click();

    // Click back button
    await page.locator('.back-button').click();

    // User selection should be visible again
    await expect(page.locator('#user-selection')).toBeVisible();
    await expect(page.locator('#pin-entry')).not.toBeVisible();
  });

  test('should enter PIN using numpad', async ({ page }) => {
    await page.goto('/login.html');

    // Select our test child user
    await page.waitForSelector('.user-card');

    // Find and click the user card for our child
    const userCards = page.locator('.user-card');
    const count = await userCards.count();

    let found = false;
    for (let i = 0; i < count; i++) {
      const nameText = await userCards.nth(i).locator('.user-name').textContent();
      if (nameText.includes('UI')) {
        await userCards.nth(i).click();
        found = true;
        break;
      }
    }

    if (!found) {
      // Click first user if test user not found
      await userCards.first().click();
    }

    // Enter PIN digits using numpad
    await page.locator('.numpad-btn:has-text("5")').click();
    await page.locator('.numpad-btn:has-text("6")').click();
    await page.locator('.numpad-btn:has-text("7")').click();
    await page.locator('.numpad-btn:has-text("8")').click();

    // Check that dots are filled
    const filledDots = await page.locator('.pin-dot.filled').count();
    expect(filledDots).toBe(4);
  });

  test('should support keyboard input for PIN', async ({ page }) => {
    await page.goto('/login.html');

    // Select a user
    await page.waitForSelector('.user-card');
    await page.locator('.user-card').first().click();

    // Type PIN using keyboard
    await page.keyboard.type('1234');

    // Check that dots are filled
    const filledDots = await page.locator('.pin-dot.filled').count();
    expect(filledDots).toBe(4);
  });

  test('should clear PIN with C button', async ({ page }) => {
    await page.goto('/login.html');

    await page.waitForSelector('.user-card');
    await page.locator('.user-card').first().click();

    // Enter some digits
    await page.locator('.numpad-btn:has-text("1")').click();
    await page.locator('.numpad-btn:has-text("2")').click();

    // Clear
    await page.locator('.numpad-btn:has-text("C")').click();

    // All dots should be empty
    const filledDots = await page.locator('.pin-dot.filled').count();
    expect(filledDots).toBe(0);
  });

  test('should show error for incorrect PIN', async ({ page }) => {
    await page.goto('/login.html');

    await page.waitForSelector('.user-card');
    await page.locator('.user-card').first().click();

    // Enter incorrect PIN (4 digits triggers auto-submit)
    await page.keyboard.type('0000');

    // Wait for error message (could be "Invalid PIN", "Error", or "PIN not set")
    await expect(page.locator('#error-message')).toContainText(/Invalid|Error|PIN not set/i, { timeout: 5000 });
  });
});
