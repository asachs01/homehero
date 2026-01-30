/**
 * Test data fixtures for E2E tests
 */

// Generate unique identifiers for test isolation
const testId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

/**
 * Generate test household data
 */
function generateHousehold(suffix = '') {
  return {
    name: `Test Household ${suffix || testId()}`
  };
}

/**
 * Generate test parent user data
 */
function generateParent(suffix = '') {
  return {
    name: `Test Parent ${suffix || testId()}`,
    role: 'parent',
    pin: '1234',
    avatar: 'lion'  // Using lion from avatars.json
  };
}

/**
 * Generate test child user data
 */
function generateChild(suffix = '') {
  return {
    name: `Test Child ${suffix || testId()}`,
    role: 'child',
    pin: '5678',
    avatar: 'unicorn'
  };
}

/**
 * Generate test task data
 */
function generateTask(suffix = '') {
  return {
    name: `Test Task ${suffix || testId()}`,
    description: 'Test task description',
    icon: 'star',
    valueCents: 150,
    category: 'chores'
  };
}

/**
 * Generate test routine data
 * Valid scheduleTypes: 'daily', 'weekly'
 * scheduleDays: array of integers 0-6 (0=Sunday, 6=Saturday) - required for weekly
 */
function generateRoutine(suffix = '', scheduleType = 'daily') {
  return {
    name: `Morning Routine ${suffix || testId()}`,
    scheduleType,
    scheduleDays: scheduleType === 'weekly' ? [1, 2, 3, 4, 5] : null  // Mon-Fri for weekly
  };
}

/**
 * Common test PIN values
 */
const TEST_PINS = {
  parent: '1234',
  child: '5678',
  invalid: '0000'
};

/**
 * Avatar IDs that should exist in the system
 * Must match the IDs in src/data/avatars.json
 */
const AVATARS = {
  cat: 'cat',
  dog: 'dog',
  bear: 'bear',
  rabbit: 'rabbit',
  fox: 'fox',
  owl: 'owl',
  penguin: 'penguin',
  lion: 'lion',
  elephant: 'elephant',
  unicorn: 'unicorn'
};

module.exports = {
  testId,
  generateHousehold,
  generateParent,
  generateChild,
  generateTask,
  generateRoutine,
  TEST_PINS,
  AVATARS
};
