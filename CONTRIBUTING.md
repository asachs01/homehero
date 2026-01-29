# Contributing to HomeHero

Thank you for your interest in contributing to HomeHero! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building software for families, so let's keep the community family-friendly too.

## Getting Started

### Development Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/asachs01/homehero.git
   cd homehero
   ```

2. **Install Node.js dependencies**
   ```bash
   cd family-chores
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start with hot-reloading enabled at `http://localhost:3000`.

   SQLite database will be automatically created at `./data/homehero.db`.

4. **Optional: Configure environment variables**

   Create a `.env` file in the `family-chores` directory:
   ```env
   JWT_SECRET=your_dev_secret_key
   PORT=3000
   DATA_DIR=./data
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode (see the browser)
npm run test:headed

# Debug tests
npm run test:debug
```

## Code Style Guidelines

We value **simplicity, readability, and maintainability** above all else.

### General Principles

- Write clear, self-documenting code
- Prefer explicit over implicit
- Keep functions small and focused
- Follow existing patterns in the codebase

### JavaScript Style

- Use `const` by default, `let` when reassignment is needed
- Use meaningful variable and function names
- Add JSDoc comments to public functions
- Use synchronous better-sqlite3 API for database operations

### File Organization

- One route file per resource (e.g., `routes/tasks.js`)
- Models contain data access logic
- Validators handle input validation
- Middleware handles cross-cutting concerns

### Example

```javascript
/**
 * Get tasks for a specific user on a given date
 * @param {string} userId - The user's UUID
 * @param {string} date - The date in YYYY-MM-DD format
 * @returns {Array} Array of task objects
 */
function getTasksForUser(userId, date) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?'
  ).all(userId, date);

  return rows.map(formatTask);
}
```

## Submitting Issues

### Bug Reports

When reporting a bug, please include:

1. **Description** - Clear description of the problem
2. **Steps to Reproduce** - Numbered steps to trigger the bug
3. **Expected Behavior** - What should happen
4. **Actual Behavior** - What actually happens
5. **Environment** - Node.js version, browser, Home Assistant version
6. **Screenshots** - If applicable

### Feature Requests

For feature requests, please include:

1. **Description** - What you'd like to see
2. **Use Case** - Why this would be useful
3. **Proposed Solution** - If you have ideas on implementation
4. **Alternatives** - Other approaches you've considered

## Submitting Pull Requests

### Before You Start

1. Check existing issues and PRs to avoid duplicates
2. For significant changes, open an issue first to discuss
3. Fork the repository and create a feature branch

### PR Guidelines

1. **Branch naming**: Use descriptive names like `feature/add-streak-milestone` or `fix/login-timeout`

2. **Commits**: Write clear commit messages
   - Use present tense ("Add feature" not "Added feature")
   - Keep the first line under 72 characters
   - Reference issues when applicable (`Fixes #123`)

3. **Code quality**:
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation if needed
   - Ensure all tests pass

4. **PR description**:
   - Describe what changes you made
   - Explain why you made them
   - Link to related issues
   - Include screenshots for UI changes

### PR Process

1. Create your PR against the `main` branch
2. Fill out the PR template
3. Wait for review
4. Address any feedback
5. Once approved, your PR will be merged

## Testing Requirements

All contributions should include appropriate tests:

- **API endpoints**: Add Playwright tests for new endpoints
- **Bug fixes**: Add a test that would have caught the bug
- **New features**: Add tests covering the happy path and edge cases

## Questions?

If you have questions, feel free to:

- Open a GitHub issue with the "question" label
- Check existing documentation in the `docs/` folder

Thank you for contributing!
