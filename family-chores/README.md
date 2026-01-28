# Family Household Manager

A self-hosted household management add-on for Home Assistant.

## Features

- Manage household chores and tasks
- Track family member responsibilities
- Schedule recurring tasks
- Web-based interface accessible from Home Assistant

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "Family Household Manager" add-on
3. Configure the PostgreSQL connection settings
4. Start the add-on

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `postgres_host` | PostgreSQL server hostname | (required) |
| `postgres_port` | PostgreSQL server port | 5432 |
| `postgres_db` | Database name | family_chores |
| `postgres_user` | Database username | (required) |
| `postgres_password` | Database password | (required) |

## Usage

After starting the add-on, access the web interface through the Home Assistant sidebar or navigate directly to `http://your-ha-instance:3000`.

## Support

For issues and feature requests, please open an issue on the project repository.
