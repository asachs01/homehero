/**
 * Screenshot Generator for HomeHero
 *
 * This script uses Playwright to capture screenshots of the application's UI.
 * Run with: npm run screenshots
 *
 * Note: For authenticated pages, this script creates mock versions with sample data
 * since actual authentication would require a running database.
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  outputDir: path.join(__dirname, '..', 'docs', 'screenshots'),
  viewport: { width: 1024, height: 768 }, // Tablet viewport
  timeout: 30000
};

// Sample data for mock pages
const MOCK_DATA = {
  users: [
    { id: '1', name: 'Mom', role: 'parent', avatarEmoji: '\u{1F469}', avatarColor: '#FFE0B2' },
    { id: '2', name: 'Dad', role: 'parent', avatarEmoji: '\u{1F468}', avatarColor: '#C8E6C9' },
    { id: '3', name: 'Emma', role: 'child', avatarEmoji: '\u{1F467}', avatarColor: '#F8BBD9' },
    { id: '4', name: 'Jake', role: 'child', avatarEmoji: '\u{1F466}', avatarColor: '#BBDEFB' }
  ],
  avatars: [
    { id: '1', emoji: '\u{1F466}', color: '#BBDEFB' },
    { id: '2', emoji: '\u{1F467}', color: '#F8BBD9' },
    { id: '3', emoji: '\u{1F468}', color: '#C8E6C9' },
    { id: '4', emoji: '\u{1F469}', color: '#FFE0B2' },
    { id: '5', emoji: '\u{1F476}', color: '#E1BEE7' },
    { id: '6', emoji: '\u{1F431}', color: '#FFCCBC' },
    { id: '7', emoji: '\u{1F436}', color: '#D7CCC8' },
    { id: '8', emoji: '\u{1F98A}', color: '#FFE082' },
    { id: '9', emoji: '\u{1F430}', color: '#F8BBD9' },
    { id: '10', emoji: '\u{1F981}', color: '#FFCC80' }
  ],
  tasks: [
    { id: '1', name: 'Make Bed', icon: '\u{1F6CF}\uFE0F', description: 'Make your bed neatly', dollarValue: 0.25, isCompleted: true },
    { id: '2', name: 'Brush Teeth', icon: '\u{1FAA5}', description: 'Morning and night', dollarValue: 0.10, isCompleted: true },
    { id: '3', name: 'Clean Room', icon: '\u{1F9F9}', description: 'Tidy up toys and clothes', dollarValue: 0.50, isCompleted: false },
    { id: '4', name: 'Feed Pet', icon: '\u{1F436}', description: 'Give food and water', dollarValue: 0.25, isCompleted: false },
    { id: '5', name: 'Homework', icon: '\u{1F4DA}', description: 'Complete all assignments', dollarValue: 0.50, isCompleted: false }
  ],
  bonusTasks: [
    { id: '6', name: 'Wash Car', icon: '\u{1F697}', description: 'Help wash the family car', dollarValue: 2.00, isCompleted: false },
    { id: '7', name: 'Yard Work', icon: '\u{1F33F}', description: 'Help with gardening', dollarValue: 1.50, isCompleted: false }
  ]
};

/**
 * Ensure the output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
}

/**
 * Take a screenshot of a page
 */
async function takeScreenshot(page, filename, description) {
  const filepath = path.join(CONFIG.outputDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  [OK] ${description}: ${filename}`);
  return filepath;
}

/**
 * Mock API responses for a page
 */
async function setupMockAPI(page) {
  // Mock the /api/users endpoint
  await page.route('**/api/users', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.users)
    });
  });

  // Mock the /api/avatars endpoint
  await page.route('**/api/avatars', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.avatars)
    });
  });

  // Mock the /api/onboarding/status endpoint
  await page.route('**/api/onboarding/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ complete: false, hasHousehold: false })
    });
  });

  // Mock the /api/dashboard endpoint
  await page.route('**/api/dashboard', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        streak: { count: 5, routineComplete: false },
        balance: { amount: 12.75, formatted: '$12.75' },
        progress: { completed: 2, total: 5, percentage: 40 },
        routineTasks: MOCK_DATA.tasks,
        bonusTasks: MOCK_DATA.bonusTasks
      })
    });
  });

  // Mock the /api/family/dashboard endpoint
  await page.route('**/api/family/dashboard', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        household: { name: 'The Smith Family', vacationMode: false },
        summary: { totalMembers: 4, membersComplete: 1, totalMissedTasks: 6 },
        members: MOCK_DATA.users.map(user => ({
          ...user,
          avatar: { emoji: user.avatarEmoji, color: user.avatarColor },
          streak: user.role === 'child' ? 5 : 12,
          balance: { amount: user.role === 'child' ? 15.50 : 0, formatted: user.role === 'child' ? '$15.50' : '$0.00' },
          progress: { completed: 2, total: 5, percentage: 40 },
          routineComplete: user.id === '3',
          missedTasks: user.id === '3' ? [] : [{ id: '1', name: 'Clean Room' }]
        }))
      })
    });
  });

  // Mock the /api/admin/* endpoints
  await page.route('**/api/admin/users', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.users.map(u => ({
        ...u,
        avatar: { emoji: u.avatarEmoji, color: u.avatarColor }
      })))
    });
  });

  await page.route('**/api/admin/tasks', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        ...MOCK_DATA.tasks.map(t => ({ ...t, type: 'routine', schedule: [1,2,3,4,5] })),
        ...MOCK_DATA.bonusTasks.map(t => ({ ...t, type: 'bonus', schedule: [0,6] }))
      ])
    });
  });

  await page.route('**/api/admin/routines', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', name: 'Morning Routine', assignedUserId: '3', tasks: MOCK_DATA.tasks.slice(0, 3) },
        { id: '2', name: 'Evening Routine', assignedUserId: '3', tasks: MOCK_DATA.tasks.slice(3) },
        { id: '3', name: 'Jake Morning', assignedUserId: '4', tasks: MOCK_DATA.tasks.slice(0, 2) }
      ])
    });
  });
}

/**
 * Set up mock authentication in localStorage
 */
async function setupMockAuth(page, user) {
  await page.evaluate((userData) => {
    localStorage.setItem('token', 'mock-jwt-token-for-screenshots');
    localStorage.setItem('user', JSON.stringify(userData));
  }, user);
}

/**
 * Generate screenshots for the login page
 */
async function screenshotLoginPage(page) {
  console.log('\nCapturing Login Page...');

  await setupMockAPI(page);
  await page.goto(`${CONFIG.baseURL}/login.html`, { waitUntil: 'networkidle' });

  // Wait for users to load
  await page.waitForSelector('.users-grid', { timeout: CONFIG.timeout });
  await page.waitForTimeout(500); // Allow animations to complete

  await takeScreenshot(page, 'login-user-selection.png', 'Login page - User selection');

  // Click on a user to show PIN entry
  const userCard = page.locator('.user-card').first();
  if (await userCard.isVisible()) {
    await userCard.click();
    await page.waitForSelector('#pin-entry:not([style*="display: none"])', { timeout: 5000 });
    await page.waitForTimeout(300);

    // Enter some PIN digits for visual effect
    await page.click('.numpad-btn:has-text("1")');
    await page.click('.numpad-btn:has-text("2")');
    await page.waitForTimeout(200);

    await takeScreenshot(page, 'login-pin-entry.png', 'Login page - PIN entry');
  }
}

/**
 * Generate screenshots for the onboarding page
 */
async function screenshotOnboardingPage(page) {
  console.log('\nCapturing Onboarding Page...');

  await setupMockAPI(page);
  await page.goto(`${CONFIG.baseURL}/onboarding.html`, { waitUntil: 'networkidle' });

  // Wait for avatars to load
  await page.waitForSelector('.avatar-option', { timeout: CONFIG.timeout });
  await page.waitForTimeout(500);

  // Step 1: Household Name
  await takeScreenshot(page, 'onboarding-step1-household.png', 'Onboarding - Step 1: Household name');

  // Fill in household name and advance
  await page.fill('#household-name', 'The Smith Family');
  await page.waitForTimeout(200);
  await takeScreenshot(page, 'onboarding-step1-filled.png', 'Onboarding - Step 1: Filled');
}

/**
 * Generate screenshots for the child dashboard
 */
async function screenshotChildDashboard(page) {
  console.log('\nCapturing Child Dashboard...');

  await setupMockAPI(page);

  // Set up authentication for a child user
  const childUser = {
    userId: '3',
    name: 'Emma',
    role: 'child',
    avatarEmoji: '\u{1F467}',
    avatarColor: '#F8BBD9'
  };

  await setupMockAuth(page, childUser);
  await page.goto(`${CONFIG.baseURL}/dashboard.html`, { waitUntil: 'networkidle' });

  // Wait for dashboard to load
  await page.waitForSelector('#dashboard-main', { timeout: CONFIG.timeout });
  await page.waitForTimeout(500);

  await takeScreenshot(page, 'dashboard-child.png', 'Child Dashboard - Overview');
}

/**
 * Generate screenshots for the family dashboard
 */
async function screenshotFamilyDashboard(page) {
  console.log('\nCapturing Family Dashboard...');

  await setupMockAPI(page);

  // Set up authentication for a parent user
  const parentUser = {
    userId: '1',
    name: 'Mom',
    role: 'parent',
    avatarEmoji: '\u{1F469}',
    avatarColor: '#FFE0B2'
  };

  await setupMockAuth(page, parentUser);
  await page.goto(`${CONFIG.baseURL}/family-dashboard.html`, { waitUntil: 'networkidle' });

  // Wait for dashboard to load
  await page.waitForSelector('#dashboard-main', { timeout: CONFIG.timeout });
  await page.waitForTimeout(500);

  await takeScreenshot(page, 'dashboard-family.png', 'Family Dashboard - Overview');
}

/**
 * Generate screenshots for the admin page
 */
async function screenshotAdminPage(page) {
  console.log('\nCapturing Admin Page...');

  await setupMockAPI(page);

  // Set up authentication for a parent user
  const parentUser = {
    userId: '1',
    name: 'Mom',
    role: 'parent',
    avatarEmoji: '\u{1F469}',
    avatarColor: '#FFE0B2'
  };

  await setupMockAuth(page, parentUser);
  await page.goto(`${CONFIG.baseURL}/admin.html`, { waitUntil: 'networkidle' });

  // Wait for admin panel to load
  await page.waitForSelector('#admin-panel', { timeout: CONFIG.timeout });
  await page.waitForTimeout(500);

  // Users tab (default)
  await takeScreenshot(page, 'admin-users.png', 'Admin - Users tab');

  // Tasks tab
  const tasksTab = page.locator('.tab-btn[data-tab="tasks"]');
  if (await tasksTab.isVisible()) {
    await tasksTab.click();
    await page.waitForTimeout(300);
    await takeScreenshot(page, 'admin-tasks.png', 'Admin - Tasks tab');
  }

  // Routines tab
  const routinesTab = page.locator('.tab-btn[data-tab="routines"]');
  if (await routinesTab.isVisible()) {
    await routinesTab.click();
    await page.waitForTimeout(300);
    await takeScreenshot(page, 'admin-routines.png', 'Admin - Routines tab');
  }
}

/**
 * Main function
 */
async function main() {
  console.log('===========================================');
  console.log('HomeHero Screenshot Generator');
  console.log('===========================================');
  console.log(`\nOutput directory: ${CONFIG.outputDir}`);
  console.log(`Viewport: ${CONFIG.viewport.width}x${CONFIG.viewport.height}`);
  console.log(`Base URL: ${CONFIG.baseURL}`);

  ensureOutputDir();

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: CONFIG.viewport,
    deviceScaleFactor: 2, // High DPI for crisp screenshots
    colorScheme: 'light'
  });

  const page = await context.newPage();

  try {
    // Check if server is running
    console.log('\nChecking server availability...');
    try {
      await page.goto(`${CONFIG.baseURL}/login.html`, { timeout: 10000 });
      console.log('  [OK] Server is running');
    } catch (error) {
      console.error('\n  [ERROR] Server is not available at', CONFIG.baseURL);
      console.error('  Please start the server with: npm run start');
      console.error('  Or specify a different URL with: BASE_URL=http://... npm run screenshots');
      process.exit(1);
    }

    // Generate screenshots for each page
    await screenshotLoginPage(page);
    await screenshotOnboardingPage(page);
    await screenshotChildDashboard(page);
    await screenshotFamilyDashboard(page);
    await screenshotAdminPage(page);

    console.log('\n===========================================');
    console.log('Screenshot generation complete!');
    console.log(`Screenshots saved to: ${CONFIG.outputDir}`);
    console.log('===========================================\n');

  } catch (error) {
    console.error('\n[ERROR] Screenshot generation failed:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run the script
main();
