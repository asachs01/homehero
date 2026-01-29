# API Documentation

HomeHero provides a RESTful API for all operations. All endpoints (except health checks and onboarding) require authentication via JWT tokens.

## Base URL

When running as a Home Assistant add-on, the API is available at:

```
http://[YOUR_HA_HOST]:3000/api
```

## Authentication

### Overview

The API uses JWT (JSON Web Token) authentication with PIN-based login. Users authenticate with their user ID and PIN, receiving a JWT token for subsequent requests.

### Login Flow

1. Fetch available users from `/api/users`
2. User selects their account and enters their PIN
3. POST to `/api/auth/login` with credentials
4. Store the returned JWT token
5. Include token in `Authorization` header for all subsequent requests

### Headers

```http
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

### Token Expiration

Tokens expire after 24 hours. When expired, users must re-authenticate.

---

## Endpoints

### Authentication

#### GET /api/users

List all users for the login screen. Does not require authentication.

**Response**
```json
[
  {
    "id": "uuid",
    "name": "Alice",
    "avatar": "cat",
    "avatarEmoji": "🐱",
    "avatarColor": "#FFB347"
  }
]
```

#### GET /api/avatars

List all available avatars. Does not require authentication.

**Response**
```json
[
  {
    "id": "cat",
    "emoji": "🐱",
    "color": "#FFB347"
  }
]
```

#### POST /api/auth/login

Authenticate a user with their PIN.

**Request Body**
```json
{
  "userId": "uuid",
  "pin": "1234"
}
```

**Response**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "name": "Alice",
    "role": "child",
    "householdId": "uuid",
    "avatar": "cat",
    "avatarEmoji": "🐱",
    "avatarColor": "#FFB347"
  }
}
```

#### GET /api/auth/me

Get the currently authenticated user's information.

**Response**
```json
{
  "id": "uuid",
  "name": "Alice",
  "role": "child",
  "householdId": "uuid",
  "avatar": "cat",
  "avatarEmoji": "🐱",
  "avatarColor": "#FFB347"
}
```

---

### Tasks

All task endpoints require authentication. Write operations (POST, PUT, DELETE) require admin role.

#### GET /api/tasks

List all tasks for the household.

**Query Parameters**
| Parameter | Type   | Description                       |
|-----------|--------|-----------------------------------|
| type      | string | Filter by task type (e.g., "one-time", "recurring") |
| userId    | string | Filter by assigned user           |

**Response**
```json
[
  {
    "id": "uuid",
    "householdId": "uuid",
    "name": "Make Bed",
    "description": "Make your bed neatly",
    "icon": "🛏️",
    "type": "recurring",
    "dollarValue": 0.50,
    "schedule": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "timeWindow": null,
    "assignedUsers": ["uuid"],
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

#### GET /api/tasks/:id

Get a single task by ID.

**Response**
```json
{
  "id": "uuid",
  "householdId": "uuid",
  "name": "Make Bed",
  "description": "Make your bed neatly",
  "icon": "🛏️",
  "type": "recurring",
  "dollarValue": 0.50,
  "schedule": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "timeWindow": null,
  "assignedUsers": ["uuid"],
  "createdAt": "2026-01-15T10:00:00Z"
}
```

#### POST /api/tasks

Create a new task. Requires admin role.

**Request Body**
```json
{
  "name": "Make Bed",
  "type": "recurring",
  "description": "Make your bed neatly",
  "icon": "🛏️",
  "dollarValue": 0.50,
  "schedule": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "assignedUsers": ["uuid"]
}
```

**Response**: `201 Created` with the created task object.

#### PUT /api/tasks/:id

Update a task. Requires admin role.

**Request Body** (all fields optional)
```json
{
  "name": "Make Bed Nicely",
  "dollarValue": 0.75
}
```

**Response**: Updated task object.

#### DELETE /api/tasks/:id

Delete a task. Requires admin role.

**Response**: `204 No Content`

#### GET /api/tasks/user/:userId

Get tasks assigned to a specific user for a date.

**Query Parameters**
| Parameter | Type   | Description                          |
|-----------|--------|--------------------------------------|
| date      | string | ISO date string (defaults to today)  |

---

### Routines

Routines are ordered collections of tasks assigned to a user.

#### GET /api/routines

List all routines for the household.

**Query Parameters**
| Parameter | Type   | Description          |
|-----------|--------|----------------------|
| userId    | string | Filter by assigned user |

**Response**
```json
[
  {
    "id": "uuid",
    "householdId": "uuid",
    "name": "Morning Routine",
    "assignedUserId": "uuid",
    "assignedUserName": "Alice",
    "tasks": [
      {
        "id": "uuid",
        "name": "Make Bed",
        "position": 1,
        "dollarValue": 0.50
      }
    ],
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

#### GET /api/routines/:id

Get a single routine with its tasks.

#### POST /api/routines

Create a new routine. Requires admin role.

**Request Body**
```json
{
  "name": "Morning Routine",
  "assignedUserId": "uuid",
  "tasks": [
    { "taskId": "uuid", "position": 1 },
    { "taskId": "uuid", "position": 2 }
  ]
}
```

#### PUT /api/routines/:id

Update a routine. Requires admin role.

**Request Body**
```json
{
  "name": "Updated Morning Routine",
  "assignedUserId": "uuid"
}
```

#### DELETE /api/routines/:id

Delete a routine. Requires admin role.

#### POST /api/routines/:id/tasks

Add a task to a routine. Requires admin role.

**Request Body**
```json
{
  "taskId": "uuid",
  "position": 3
}
```

#### DELETE /api/routines/:id/tasks/:taskId

Remove a task from a routine. Requires admin role.

#### PUT /api/routines/:id/tasks/reorder

Reorder tasks in a routine. Requires admin role.

**Request Body**
```json
{
  "taskOrder": ["taskId1", "taskId2", "taskId3"]
}
```

---

### Dashboard

The dashboard provides a user's daily view of tasks, streaks, and balance.

#### GET /api/dashboard

Get the current user's dashboard data for today. Results are cached for 30 seconds.

**Response**
```json
{
  "date": "2026-01-28",
  "user": {
    "id": "uuid",
    "householdId": "uuid"
  },
  "routineTasks": [
    {
      "id": "uuid",
      "name": "Make Bed",
      "description": "Make your bed neatly",
      "icon": "🛏️",
      "dollarValue": 0.50,
      "position": 1,
      "routineId": "uuid",
      "routineName": "Morning Routine",
      "isCompleted": false,
      "completionId": null,
      "completedAt": null,
      "canUndo": false
    }
  ],
  "bonusTasks": [
    {
      "id": "uuid",
      "name": "Vacuum Living Room",
      "dollarValue": 2.00,
      "isCompleted": false,
      "isClaimed": false,
      "claimedBy": null
    }
  ],
  "streak": {
    "count": 5,
    "routineComplete": false
  },
  "balance": {
    "current": 15.50,
    "formatted": "$15.50"
  },
  "progress": {
    "completed": 2,
    "total": 5,
    "percentage": 40
  }
}
```

#### POST /api/dashboard/complete/:taskId

Mark a task as complete.

**Response**
```json
{
  "completion": {
    "id": "uuid",
    "taskId": "uuid",
    "userId": "uuid",
    "completedAt": "2026-01-28T14:30:00Z"
  },
  "task": {
    "id": "uuid",
    "name": "Make Bed",
    "dollarValue": 0.50
  },
  "balance": {
    "current": 16.00,
    "formatted": "$16.00"
  },
  "canUndo": true
}
```

#### POST /api/dashboard/undo/:completionId

Undo a task completion. Only allowed within 5 minutes of completion.

**Response**
```json
{
  "success": true,
  "balance": {
    "current": 15.50,
    "formatted": "$15.50"
  }
}
```

---

### Family Dashboard

Family dashboard endpoints require admin (parent) role.

#### GET /api/family/dashboard

Get an overview of all family members' progress. Cached for 30 seconds.

**Response**
```json
{
  "date": "2026-01-28",
  "household": {
    "id": "uuid",
    "name": "The Smith Family",
    "vacationMode": false
  },
  "members": [
    {
      "id": "uuid",
      "name": "Alice",
      "role": "child",
      "avatar": "cat",
      "progress": {
        "completed": 3,
        "total": 5,
        "percentage": 60
      },
      "streak": 5,
      "balance": {
        "current": 15.50,
        "formatted": "$15.50"
      },
      "missedTasks": [
        {
          "id": "uuid",
          "name": "Clean Room",
          "icon": "🧹"
        }
      ],
      "routineComplete": false
    }
  ],
  "summary": {
    "totalMembers": 2,
    "membersComplete": 1,
    "totalMissedTasks": 3
  }
}
```

#### POST /api/family/vacation-mode

Toggle household vacation mode.

**Request Body**
```json
{
  "enabled": true
}
```

**Response**
```json
{
  "success": true,
  "vacationMode": true
}
```

#### POST /api/family/sick-day/:userId

Mark all of a user's tasks as complete for today (sick day pass).

**Response**
```json
{
  "success": true,
  "tasksCompleted": 5,
  "tasks": [
    { "id": "uuid", "name": "Make Bed", "icon": "🛏️" }
  ],
  "message": "Marked 5 task(s) complete for Alice's sick day"
}
```

#### GET /api/family/member/:userId

Get detailed view for a specific family member.

**Response**
```json
{
  "user": {
    "id": "uuid",
    "name": "Alice",
    "role": "child",
    "avatar": "cat"
  },
  "routines": [
    {
      "id": "uuid",
      "name": "Morning Routine",
      "tasks": [
        {
          "id": "uuid",
          "name": "Make Bed",
          "isCompleted": true,
          "completedAt": "2026-01-28T07:30:00Z"
        }
      ]
    }
  ],
  "streak": {
    "current": 5,
    "best": 14
  },
  "balance": {
    "current": 15.50,
    "formatted": "$15.50"
  },
  "recentTransactions": [
    {
      "id": "uuid",
      "amount": 0.50,
      "type": "earn",
      "description": "Completed: Make Bed",
      "createdAt": "2026-01-28T07:30:00Z"
    }
  ]
}
```

---

### Balance

#### GET /api/balance

Get current balance. Non-admins can only view their own balance.

**Query Parameters**
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| userId    | string | User ID (admin only)           |

**Response**
```json
{
  "userId": "uuid",
  "currentBalance": 15.50,
  "formatted": "$15.50"
}
```

#### GET /api/balance/transactions

Get transaction history.

**Query Parameters**
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| userId    | string | User ID (admin only)           |
| limit     | number | Max results (default: 50, max: 100) |
| offset    | number | Skip first N results           |
| type      | string | Filter by type (earn, spend, adjustment) |
| startDate | string | Start date (ISO format)        |
| endDate   | string | End date (ISO format)          |

**Response**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "amount": 0.50,
      "type": "earn",
      "description": "Completed: Make Bed",
      "createdAt": "2026-01-28T07:30:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### GET /api/balance/monthly

Get monthly earnings summary.

**Query Parameters**
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| userId    | string | User ID (admin only)           |
| month     | number | Month (1-12, defaults to current) |
| year      | number | Year (defaults to current)     |

**Response**
```json
{
  "userId": "uuid",
  "month": 1,
  "year": 2026,
  "earned": 45.00,
  "spent": 20.00,
  "adjustments": 0,
  "net": 25.00,
  "formatted": {
    "earned": "$45.00",
    "spent": "$20.00",
    "adjustments": "$0.00",
    "net": "$25.00"
  }
}
```

#### GET /api/balance/summary

Get earnings summary for a date range.

**Query Parameters**
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| userId    | string | User ID (admin only)           |
| startDate | string | Start date (ISO format)        |
| endDate   | string | End date (ISO format)          |

#### POST /api/balance/redeem

Mark funds as redeemed/paid out. Requires admin role.

**Request Body**
```json
{
  "userId": "uuid",
  "amount": 10.00,
  "description": "Weekly payout"
}
```

**Response**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "amount": -10.00,
    "type": "spend",
    "description": "Weekly payout",
    "createdAt": "2026-01-28T15:00:00Z"
  },
  "balance": {
    "current": 5.50,
    "formatted": "$5.50"
  }
}
```

---

### Notifications

#### GET /api/notifications

List user's notifications.

**Query Parameters**
| Parameter  | Type    | Description                    |
|------------|---------|--------------------------------|
| limit      | number  | Max results (default: 20, max: 100) |
| offset     | number  | Skip first N results           |
| unreadOnly | boolean | Only return unread notifications |

**Response**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "streak_milestone",
      "title": "7-Day Streak!",
      "message": "You've completed your routine for 7 days in a row!",
      "isRead": false,
      "createdAt": "2026-01-28T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### POST /api/notifications/:id/read

Mark a notification as read.

#### POST /api/notifications/read-all

Mark all notifications as read.

**Response**
```json
{
  "success": true,
  "markedAsRead": 5
}
```

#### GET /api/notifications/unread-count

Get count of unread notifications.

**Response**
```json
{
  "count": 3
}
```

---

### Admin

All admin endpoints require authentication and admin (parent) role.

#### Users

| Method | Endpoint              | Description           |
|--------|----------------------|------------------------|
| GET    | /api/admin/users     | List all household users |
| POST   | /api/admin/users     | Create a new user      |
| PUT    | /api/admin/users/:id | Update a user          |
| DELETE | /api/admin/users/:id | Delete a user          |

**POST /api/admin/users Request Body**
```json
{
  "name": "Bob",
  "role": "child",
  "pin": "1234",
  "avatar": "dog"
}
```

#### Tasks (Admin)

| Method | Endpoint              | Description           |
|--------|----------------------|------------------------|
| GET    | /api/admin/tasks     | List all tasks         |
| POST   | /api/admin/tasks     | Create a new task      |
| PUT    | /api/admin/tasks/:id | Update a task          |
| DELETE | /api/admin/tasks/:id | Delete a task          |

#### Routines (Admin)

| Method | Endpoint                              | Description              |
|--------|--------------------------------------|--------------------------|
| GET    | /api/admin/routines                  | List all routines        |
| POST   | /api/admin/routines                  | Create a new routine     |
| PUT    | /api/admin/routines/:id              | Update a routine         |
| DELETE | /api/admin/routines/:id              | Delete a routine         |
| POST   | /api/admin/routines/:id/tasks        | Add task to routine      |
| DELETE | /api/admin/routines/:id/tasks/:taskId| Remove task from routine |
| PUT    | /api/admin/routines/:id/tasks/reorder| Reorder routine tasks    |

---

### Onboarding

Onboarding endpoints do not require authentication.

#### POST /api/onboarding/household

Create a new household.

**Request Body**
```json
{
  "name": "The Smith Family"
}
```

#### POST /api/onboarding/user

Add a user during onboarding.

**Request Body**
```json
{
  "householdId": "uuid",
  "name": "Dad",
  "role": "parent",
  "pin": "1234",
  "avatar": "bear"
}
```

#### GET /api/onboarding/status

Check if onboarding is complete.

**Query Parameters**
| Parameter   | Type   | Description                    |
|-------------|--------|--------------------------------|
| householdId | string | Household ID (optional)        |

**Response**
```json
{
  "hasHousehold": true,
  "householdId": "uuid",
  "complete": true,
  "hasAdmin": true,
  "userCount": 4
}
```

#### GET /api/onboarding/household

Get the current household.

---

### Health & Status

These endpoints do not require authentication.

#### GET /api/health

Check if the service is running.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2026-01-28T15:00:00Z"
}
```

#### GET /api/db/status

Check database connection status.

**Response**
```json
{
  "connected": true,
  "pool": {
    "total": 10,
    "idle": 8,
    "waiting": 0
  },
  "timestamp": "2026-01-28T15:00:00Z"
}
```

#### GET /api/cache/status

Check cache status.

**Response**
```json
{
  "cache": {
    "hits": 150,
    "misses": 25,
    "size": 42
  },
  "timestamp": "2026-01-28T15:00:00Z"
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "details": ["Additional details if applicable"]
}
```

### HTTP Status Codes

| Code | Description                                    |
|------|------------------------------------------------|
| 200  | Success                                        |
| 201  | Created                                        |
| 204  | No Content (successful deletion)               |
| 400  | Bad Request (validation error)                 |
| 401  | Unauthorized (missing or invalid token)        |
| 403  | Forbidden (insufficient permissions)           |
| 404  | Not Found                                      |
| 429  | Too Many Requests (rate limited)               |
| 500  | Internal Server Error                          |

### Rate Limiting

The API implements rate limiting to prevent abuse:

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 login attempts per 15 minutes per IP
- **Onboarding**: 10 requests per 15 minutes per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when the limit resets (Unix timestamp)
