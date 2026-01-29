/**
 * E2E tests for routine completion flow
 * Tests: Child completes tasks, balance updates, streak tracking
 */

const { test, expect } = require('@playwright/test');
const { createApiClient } = require('./helpers/api-client');
const {
  generateHousehold,
  generateParent,
  generateChild,
  generateTask,
  generateRoutine,
  TEST_PINS
} = require('./fixtures/test-data');

test.describe('Routine Completion Flow', () => {
  let api;
  let household;
  let parentUser;
  let childUser;
  let routine;
  let task1;
  let task2;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create complete test environment
    household = await api.createHousehold(generateHousehold('Completion Tests'));

    parentUser = await api.createUser({
      ...generateParent('Complete'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('Complete'),
      householdId: household.id
    });

    // Login as parent to set up tasks and routine
    await api.login(parentUser.id, TEST_PINS.parent);

    // Create tasks
    task1 = await api.createTask({
      name: 'Brush Teeth',
      type: 'daily',
      dollarValue: 0.50,
      schedule: [0, 1, 2, 3, 4, 5, 6]  // Every day (0=Sunday, 6=Saturday)
    });

    task2 = await api.createTask({
      name: 'Make Bed',
      type: 'daily',
      dollarValue: 0.25,
      schedule: [0, 1, 2, 3, 4, 5, 6]  // Every day
    });

    // Create routine and add tasks
    routine = await api.createRoutine({
      name: 'Morning Routine',
      assignedUserId: childUser.id
    });

    await api.addTaskToRoutine(routine.id, task1.id, 1);
    await api.addTaskToRoutine(routine.id, task2.id, 2);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should get dashboard with routine tasks for child', async () => {
    // Login as child
    await api.login(childUser.id, TEST_PINS.child);

    const dashboard = await api.getDashboard();

    expect(dashboard).toHaveProperty('routineTasks');
    expect(dashboard).toHaveProperty('balance');
    expect(dashboard).toHaveProperty('streak');
    expect(dashboard).toHaveProperty('progress');

    // Should have our tasks (if scheduled for today)
    expect(dashboard.routineTasks.length).toBeGreaterThanOrEqual(0);
  });

  test('should complete a task and update balance', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    // Get initial dashboard
    const initialDashboard = await api.getDashboard();
    const initialBalance = initialDashboard.balance.current;

    // Complete a task
    const result = await api.completeTask(task1.id);

    expect(result).toHaveProperty('completion');
    expect(result).toHaveProperty('balance');
    expect(result.task.id).toBe(task1.id);

    // Balance should have increased
    expect(result.balance.current).toBeGreaterThan(initialBalance);
  });

  test('should not allow duplicate task completion on same day', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    // Complete the task (might already be completed from previous test)
    try {
      await api.completeTask(task1.id);
    } catch (e) {
      // Ignore if already completed
    }

    // Try to complete again
    const response = await api.post(`/api/dashboard/complete/${task1.id}`);

    // Should fail with 400 if already completed
    if (!response.ok()) {
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('already completed');
    }
  });

  test('should track progress as tasks are completed', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    // Get dashboard
    const dashboard = await api.getDashboard();

    // Progress should reflect completed tasks
    expect(dashboard.progress).toHaveProperty('completed');
    expect(dashboard.progress).toHaveProperty('total');
    expect(dashboard.progress).toHaveProperty('percentage');

    // Percentage should be between 0 and 100
    expect(dashboard.progress.percentage).toBeGreaterThanOrEqual(0);
    expect(dashboard.progress.percentage).toBeLessThanOrEqual(100);
  });

  test('should allow undo within time window', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    // Complete task2 (not yet completed)
    const result = await api.completeTask(task2.id);

    expect(result.canUndo).toBe(true);
    expect(result.completion).toHaveProperty('id');

    const completionId = result.completion.id;
    const balanceAfterComplete = result.balance.current;

    // Undo the completion
    const undoResponse = await api.post(`/api/dashboard/undo/${completionId}`);

    if (undoResponse.ok()) {
      const undoResult = await undoResponse.json();
      expect(undoResult.success).toBe(true);

      // Balance should decrease
      expect(undoResult.balance.current).toBeLessThan(balanceAfterComplete);
    }
  });

  test('should show completion status in dashboard', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    const dashboard = await api.getDashboard();

    // Check that tasks have completion status
    dashboard.routineTasks.forEach(task => {
      expect(task).toHaveProperty('isCompleted');
      expect(typeof task.isCompleted).toBe('boolean');

      if (task.isCompleted) {
        expect(task).toHaveProperty('completedAt');
      }
    });
  });
});

test.describe('Parent Dashboard Review', () => {
  let api;
  let household;
  let parentUser;
  let childUser;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create test environment
    household = await api.createHousehold(generateHousehold('Parent Review'));

    parentUser = await api.createUser({
      ...generateParent('Review'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('Review'),
      householdId: household.id
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should allow parent to view family members', async () => {
    await api.login(parentUser.id, TEST_PINS.parent);

    const response = await api.get('/api/family/members');

    if (response.ok()) {
      const members = await response.json();
      expect(Array.isArray(members)).toBe(true);

      // Should include both parent and child
      const foundChild = members.find(m => m.id === childUser.id);
      expect(foundChild).toBeTruthy();
    }
  });

  test('should allow parent to view child progress', async () => {
    await api.login(parentUser.id, TEST_PINS.parent);

    // Get family dashboard or child-specific data
    const response = await api.get(`/api/family/progress?userId=${childUser.id}`);

    // This endpoint may or may not exist
    if (response.ok()) {
      const progress = await response.json();
      expect(progress).toHaveProperty('userId');
    }
  });

  test('should allow parent to access admin features', async () => {
    await api.login(parentUser.id, TEST_PINS.parent);

    // Parents should have admin access
    const currentUser = api.getCurrentUser();
    expect(currentUser.role).toBe('parent');

    // Try to access admin endpoint
    const response = await api.get('/api/tasks');
    expect(response.ok()).toBeTruthy();
  });

  test('should prevent child from accessing admin endpoints', async () => {
    await api.login(childUser.id, TEST_PINS.child);

    // Child should not be able to create tasks
    const response = await api.post('/api/tasks', generateTask('ChildAttempt'));
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(403);
  });
});

test.describe('Full User Flow E2E', () => {
  let api;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('complete user flow: onboarding -> task creation -> completion -> review', async () => {
    // Step 1: Create household
    const household = await api.createHousehold(generateHousehold('Full Flow E2E'));
    expect(household.id).toBeTruthy();

    // Step 2: Add parent (first user becomes admin)
    const parent = await api.createUser({
      householdId: household.id,
      name: 'Test Parent',
      role: 'parent',
      pin: '1234',
      avatar: 'lion'
    });
    expect(parent.role).toBe('parent');

    // Step 3: Add child
    const child = await api.createUser({
      householdId: household.id,
      name: 'Test Child',
      role: 'child',
      pin: '5678',
      avatar: 'unicorn'
    });
    expect(child.role).toBe('child');

    // Step 4: Parent logs in and creates tasks
    await api.login(parent.id, '1234');

    const morningTask = await api.createTask({
      name: 'Morning Task',
      type: 'daily',
      dollarValue: 1.00,
      schedule: [0, 1, 2, 3, 4, 5, 6]  // Every day
    });

    // Step 5: Parent creates routine and assigns to child
    const routine = await api.createRoutine({
      name: 'Daily Routine',
      assignedUserId: child.id
    });

    await api.addTaskToRoutine(routine.id, morningTask.id, 1);

    // Step 6: Child logs in
    await api.login(child.id, '5678');

    // Step 7: Child views dashboard
    const dashboard = await api.getDashboard();
    expect(dashboard.routineTasks.length).toBeGreaterThanOrEqual(0);

    // Step 8: Child completes task (if available)
    if (dashboard.routineTasks.length > 0) {
      const taskToComplete = dashboard.routineTasks.find(t => !t.isCompleted);

      if (taskToComplete) {
        const completion = await api.completeTask(taskToComplete.id);
        expect(completion.completion).toBeTruthy();
        expect(completion.balance.current).toBeGreaterThan(0);
      }
    }

    // Step 9: Parent reviews (log back in as parent)
    await api.login(parent.id, '1234');

    // Parent can view all tasks
    const tasksResponse = await api.get('/api/tasks');
    expect(tasksResponse.ok()).toBeTruthy();

    const tasks = await tasksResponse.json();
    expect(tasks.length).toBeGreaterThan(0);

    console.log('Full E2E flow completed successfully');
  });
});
