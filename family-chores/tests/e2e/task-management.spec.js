/**
 * E2E tests for task management
 * Tests: Create tasks, assign to users, manage routines
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

test.describe('Task Management API', () => {
  let api;
  let household;
  let parentUser;
  let childUser;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create test household and users
    household = await api.createHousehold(generateHousehold('Task Tests'));

    parentUser = await api.createUser({
      ...generateParent('Task'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('Task'),
      householdId: household.id
    });

    // Login as parent for task operations
    await api.login(parentUser.id, TEST_PINS.parent);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should create a daily task', async () => {
    const taskData = generateTask('Daily');

    const task = await api.createTask(taskData);

    expect(task).toHaveProperty('id');
    expect(task.name).toBe(taskData.name);
    expect(task.type).toBe('daily');
    expect(task.dollarValue).toBe(taskData.dollarValue);
  });

  test('should create a one-time task', async () => {
    const taskData = generateTask('OneTime', 'one-time');

    const task = await api.createTask(taskData);

    expect(task.type).toBe('one-time');
  });

  test('should list tasks for household', async () => {
    const response = await api.get('/api/tasks');
    expect(response.ok()).toBeTruthy();

    const tasks = await response.json();
    expect(Array.isArray(tasks)).toBe(true);
  });

  test('should get a specific task by ID', async () => {
    // Create a task first
    const createdTask = await api.createTask(generateTask('GetById'));

    const response = await api.get(`/api/tasks/${createdTask.id}`);
    expect(response.ok()).toBeTruthy();

    const task = await response.json();
    expect(task.id).toBe(createdTask.id);
    expect(task.name).toBe(createdTask.name);
  });

  test('should update a task', async () => {
    // Create a task first
    const createdTask = await api.createTask(generateTask('Update'));

    // Update the task
    const response = await api.put(`/api/tasks/${createdTask.id}`, {
      name: 'Updated Task Name',
      dollarValue: 2.50
    });

    expect(response.ok()).toBeTruthy();

    const updatedTask = await response.json();
    expect(updatedTask.name).toBe('Updated Task Name');
    expect(updatedTask.dollarValue).toBe(2.50);
  });

  test('should delete a task', async () => {
    // Create a task first
    const createdTask = await api.createTask(generateTask('Delete'));

    // Delete the task
    const response = await api.delete(`/api/tasks/${createdTask.id}`);
    expect(response.status()).toBe(204);

    // Verify it's deleted
    const getResponse = await api.get(`/api/tasks/${createdTask.id}`);
    expect(getResponse.status()).toBe(404);
  });

  test('should reject task creation without auth', async () => {
    api.clearAuth();

    const response = await api.post('/api/tasks', generateTask('NoAuth'));
    expect(response.status()).toBe(401);

    // Re-authenticate for remaining tests
    await api.login(parentUser.id, TEST_PINS.parent);
  });

  test('should reject task creation by child user', async () => {
    // Login as child
    await api.login(childUser.id, TEST_PINS.child);

    const response = await api.post('/api/tasks', generateTask('ChildCreate'));
    expect(response.status()).toBe(403);

    // Re-authenticate as parent
    await api.login(parentUser.id, TEST_PINS.parent);
  });

  test('should validate task data', async () => {
    // Missing name
    const response1 = await api.post('/api/tasks', {
      type: 'daily'
    });
    expect(response1.status()).toBe(400);

    // Invalid type
    const response2 = await api.post('/api/tasks', {
      name: 'Test Task',
      type: 'invalid-type'
    });
    expect(response2.status()).toBe(400);
  });
});

test.describe('Routine Management API', () => {
  let api;
  let household;
  let parentUser;
  let childUser;
  let testTask;

  test.beforeAll(async ({ baseURL }) => {
    api = await createApiClient(baseURL);

    // Create test data
    household = await api.createHousehold(generateHousehold('Routine Tests'));

    parentUser = await api.createUser({
      ...generateParent('Routine'),
      householdId: household.id
    });

    childUser = await api.createUser({
      ...generateChild('Routine'),
      householdId: household.id
    });

    // Login and create a task for routine tests
    await api.login(parentUser.id, TEST_PINS.parent);
    testTask = await api.createTask(generateTask('ForRoutine'));
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('should create a routine', async () => {
    const routineData = {
      ...generateRoutine(),
      assignedUserId: childUser.id
    };

    const routine = await api.createRoutine(routineData);

    expect(routine).toHaveProperty('id');
    expect(routine.name).toBe(routineData.name);
    expect(routine.assignedUserId).toBe(childUser.id);
  });

  test('should list routines for household', async () => {
    const response = await api.get('/api/routines');
    expect(response.ok()).toBeTruthy();

    const routines = await response.json();
    expect(Array.isArray(routines)).toBe(true);
  });

  test('should filter routines by user', async () => {
    // Create a routine assigned to child
    await api.createRoutine({
      ...generateRoutine('ForChild'),
      assignedUserId: childUser.id
    });

    const response = await api.get(`/api/routines?userId=${childUser.id}`);
    expect(response.ok()).toBeTruthy();

    const routines = await response.json();
    expect(routines.length).toBeGreaterThan(0);

    // All returned routines should be assigned to child
    routines.forEach(routine => {
      expect(routine.assignedUserId).toBe(childUser.id);
    });
  });

  test('should add task to routine', async () => {
    // Create a routine
    const routine = await api.createRoutine({
      ...generateRoutine('WithTask'),
      assignedUserId: childUser.id
    });

    // Add task to routine
    const updatedRoutine = await api.addTaskToRoutine(routine.id, testTask.id, 1);

    expect(updatedRoutine.tasks).toBeDefined();
    expect(updatedRoutine.tasks.length).toBeGreaterThan(0);

    const addedTask = updatedRoutine.tasks.find(t => t.id === testTask.id);
    expect(addedTask).toBeTruthy();
  });

  test('should remove task from routine', async () => {
    // Create a routine with a task
    const routine = await api.createRoutine({
      ...generateRoutine('RemoveTask'),
      assignedUserId: childUser.id
    });

    await api.addTaskToRoutine(routine.id, testTask.id, 1);

    // Remove the task
    const response = await api.delete(`/api/routines/${routine.id}/tasks/${testTask.id}`);
    expect(response.status()).toBe(204);
  });

  test('should reorder tasks in routine', async () => {
    // Create a routine
    const routine = await api.createRoutine({
      ...generateRoutine('Reorder'),
      assignedUserId: childUser.id
    });

    // Create and add multiple tasks
    const task1 = await api.createTask(generateTask('Reorder1'));
    const task2 = await api.createTask(generateTask('Reorder2'));

    await api.addTaskToRoutine(routine.id, task1.id, 1);
    await api.addTaskToRoutine(routine.id, task2.id, 2);

    // Reorder tasks
    const response = await api.put(`/api/routines/${routine.id}/tasks/reorder`, {
      taskOrder: [task2.id, task1.id]
    });

    expect(response.ok()).toBeTruthy();

    const updatedRoutine = await response.json();
    expect(updatedRoutine.tasks[0].id).toBe(task2.id);
    expect(updatedRoutine.tasks[1].id).toBe(task1.id);
  });

  test('should update routine', async () => {
    const routine = await api.createRoutine({
      ...generateRoutine('Update'),
      assignedUserId: childUser.id
    });

    const response = await api.put(`/api/routines/${routine.id}`, {
      name: 'Updated Routine Name'
    });

    expect(response.ok()).toBeTruthy();

    const updatedRoutine = await response.json();
    expect(updatedRoutine.name).toBe('Updated Routine Name');
  });

  test('should delete routine', async () => {
    const routine = await api.createRoutine({
      ...generateRoutine('Delete'),
      assignedUserId: childUser.id
    });

    const response = await api.delete(`/api/routines/${routine.id}`);
    expect(response.status()).toBe(204);
  });
});
