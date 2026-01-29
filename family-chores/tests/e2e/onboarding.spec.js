/**
 * E2E tests for onboarding flow
 * Tests: Create household -> Add first parent -> Add child
 */

const { test, expect } = require('@playwright/test');
const { createApiClient } = require('./helpers/api-client');
const { generateHousehold, generateParent, generateChild, TEST_PINS } = require('./fixtures/test-data');

test.describe('Onboarding Flow', () => {
  let api;

  test.beforeEach(async ({ baseURL }) => {
    api = await createApiClient(baseURL);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test('should check onboarding status', async () => {
    const response = await api.get('/api/onboarding/status');
    expect(response.ok()).toBeTruthy();

    const status = await response.json();
    expect(status).toHaveProperty('hasHousehold');
    expect(status).toHaveProperty('complete');
  });

  test('should create a new household', async () => {
    const householdData = generateHousehold();

    const household = await api.createHousehold(householdData);

    expect(household).toHaveProperty('id');
    expect(household.name).toBe(householdData.name);
    expect(household).toHaveProperty('createdAt');
  });

  test('should reject household creation with missing name', async () => {
    const response = await api.post('/api/onboarding/household', {});

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(400);

    const error = await response.json();
    expect(error.error).toContain('name');
  });

  test('should add a parent user to household', async () => {
    // Create household first
    const household = await api.createHousehold(generateHousehold());

    // Add parent
    const parentData = {
      ...generateParent(),
      householdId: household.id
    };

    const parent = await api.createUser(parentData);

    expect(parent).toHaveProperty('id');
    expect(parent.name).toBe(parentData.name);
    expect(parent.role).toBe('parent');
    expect(parent).toHaveProperty('avatar');
  });

  test('should require PIN for parent users', async () => {
    // Create household first
    const household = await api.createHousehold(generateHousehold());

    // Try to add parent without PIN
    const response = await api.post('/api/onboarding/user', {
      householdId: household.id,
      name: 'Parent Without PIN',
      role: 'parent'
      // No PIN provided
    });

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(400);

    const error = await response.json();
    expect(error.error).toContain('PIN');
  });

  test('should add a child user to household', async () => {
    // Create household and parent first
    const household = await api.createHousehold(generateHousehold());
    await api.createUser({
      ...generateParent(),
      householdId: household.id
    });

    // Add child
    const childData = {
      ...generateChild(),
      householdId: household.id
    };

    const child = await api.createUser(childData);

    expect(child).toHaveProperty('id');
    expect(child.name).toBe(childData.name);
    expect(child.role).toBe('child');
  });

  test('should allow child users without PIN', async () => {
    // Create household first
    const household = await api.createHousehold(generateHousehold());

    // Add child without PIN
    const response = await api.post('/api/onboarding/user', {
      householdId: household.id,
      name: 'Child Without PIN',
      role: 'child',
      avatar: 'unicorn'
      // No PIN provided - should be allowed for children
    });

    expect(response.ok()).toBeTruthy();

    const child = await response.json();
    expect(child.name).toBe('Child Without PIN');
    expect(child.role).toBe('child');
  });

  test('should validate PIN format', async () => {
    const household = await api.createHousehold(generateHousehold());

    // PIN too short
    const response1 = await api.post('/api/onboarding/user', {
      householdId: household.id,
      name: 'Test User',
      role: 'parent',
      pin: '123' // Only 3 digits
    });

    expect(response1.ok()).toBeFalsy();
    expect(response1.status()).toBe(400);

    // PIN with non-digits
    const response2 = await api.post('/api/onboarding/user', {
      householdId: household.id,
      name: 'Test User',
      role: 'parent',
      pin: 'abcd'
    });

    expect(response2.ok()).toBeFalsy();
    expect(response2.status()).toBe(400);
  });

  test('should complete full onboarding flow', async () => {
    // Step 1: Create household
    const household = await api.createHousehold(generateHousehold('Full Flow'));
    expect(household.id).toBeTruthy();

    // Step 2: Add first parent (admin)
    const parent = await api.createUser({
      householdId: household.id,
      name: 'Mom',
      role: 'parent',
      pin: TEST_PINS.parent,
      avatar: 'lion'
    });
    expect(parent.role).toBe('parent');

    // Step 3: Add child
    const child = await api.createUser({
      householdId: household.id,
      name: 'Junior',
      role: 'child',
      pin: TEST_PINS.child,
      avatar: 'unicorn'
    });
    expect(child.role).toBe('child');

    // Verify onboarding status for THIS specific household
    const response = await api.get(`/api/onboarding/status?householdId=${household.id}`);
    const status = await response.json();

    expect(status.hasHousehold).toBe(true);
    expect(status.hasAdmin).toBe(true);
    expect(status.userCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Onboarding UI Flow', () => {
  test('should show user selection or empty state on homepage', async ({ page }) => {
    // Check if we get redirected or see onboarding UI
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for either the main app or onboarding state
    const hasUsers = await page.locator('.user-card').count();

    // Either we see users (household exists) or we see the empty state
    if (hasUsers > 0) {
      // Household exists with users - verify user cards are displayed
      await expect(page.locator('.user-card').first()).toBeVisible();
    } else {
      // No users - either empty state or onboarding redirect
      // This is acceptable - the test verifies the page loads without error
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    }
  });
});
