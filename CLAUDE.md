# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JY-Admin is a full-stack management system built with Gin (Go backend) + React (TypeScript frontend). It provides user management, role-based access control (RBAC), file management, customer management, and AI conversation features.

## Development Commands

### Backend Development
```bash
# Navigate to server directory
cd server

# Install Go dependencies
go mod download

# Run backend in development mode
go run main.go

# Build backend binary
go build -o jy-admin main.go

# Run with custom environment variables
export GIN_MODE=debug
export JWT_SIGNING_KEY=your-secret-key
go run main.go

# Backend runs on http://localhost:7777 by default
# API docs available at http://localhost:7777/swagger/index.html
```

### Frontend Development
```bash
# Navigate to web directory
cd web

# Install dependencies (using pnpm workspace)
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm type-check

# Lint and format
pnpm lint
pnpm format

# Frontend runs on http://localhost:5173 by default
```

### Docker Deployment
```bash
# Deploy using Docker Compose (from project root)
chmod +x deploy.sh
./deploy.sh

# Manual Docker Compose commands
docker-compose up -d --build
docker-compose logs -f
docker-compose down

# Access deployed services
# Frontend: http://localhost
# Health check: http://localhost/api/health
```

### Database Management
```bash
# Database backup (from deploy/mysql directory)
cd deploy/mysql
./backup.sh

# Database restore
./restore.sh backups/backup_20240101_120000.sql.gz
```

## Project Architecture

### Backend Structure
- **Framework**: Gin 1.11.0 with Go 1.23+
- **ORM**: GORM for database operations
- **Authentication**: JWT with token blacklist management
- **Authorization**: RBAC (Role-Based Access Control) middleware
- **Storage**: Support for local storage and Tencent Cloud COS
- **Logging**: Zap structured logging with file rotation
- **Configuration**: Viper for config management

#### Key Directories
- `server/api/` - API endpoint handlers organized by feature
- `server/core/` - Core initialization (DB, logging, OSS, server)
- `server/middleware/` - JWT auth, RBAC, and logging middleware
- `server/model/` - Database models and business entities
- `server/router/` - Route definitions and grouping

#### API Groups
- **Public routes**: Login, registration, captcha (no auth required)
- **Private routes**: All management APIs (require JWT authentication)
- **Health check**: `/api/health` for monitoring

### Frontend Structure
- **Framework**: React 18 with TypeScript
- **Build tool**: Vite
- **UI library**: Ant Design
- **State management**: Redux Toolkit
- **Routing**: React Router DOM
- **HTTP client**: Axios
- **Package management**: pnpm workspaces

#### Key Directories
- `web/packages/web/src/api/` - API client definitions
- `web/packages/web/src/pages/` - Page components
- `web/packages/web/src/Layout/` - Layout components
- `web/packages/web/src/utils/` - Utility functions

### Database Schema
- **Primary DB**: MySQL 8.0 (production), SQLite (development)
- **Key tables**: Users, Customers, Roles, Menus, File uploads, JWT blacklist, AI conversations
- **Auto-migration**: GORM handles schema migrations

### Authentication & Authorization
- **JWT tokens** with 7-day expiration
- **Token blacklist** for logout functionality
- **RBAC middleware** for role-based access control
- **Menu permissions** tied to user roles

### File Storage
- **Local storage**: Files stored in `uploads/file` directory
- **Tencent COS**: Cloud object storage integration
- **Unified interface**: OSS abstraction layer

## Configuration

### Environment Variables
- `GIN_MODE` - Gin running mode (debug/release)
- `JWT_SIGNING_KEY` - JWT signing secret
- `MYSQL_*` - MySQL connection parameters
- `COS_SECRET_ID`, `COS_SECRET_KEY` - Tencent COS credentials

### Configuration Files
- `server/config.dev.yaml` - Development environment config
- `server/config.docker.yaml` - Docker/production config
- Configurable via environment variables with fallback values

## Key API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - User registration
- `POST /api/logout` - User logout (JWT blacklist)

### User Management
- `GET /api/user/list` - List users
- `POST /api/user` - Create user
- `PUT /api/user` - Update user
- `DELETE /api/user/:id` - Delete user
- `GET /api/user/userinfo` - Get current user info

### Role & Permission Management
- `GET /api/authority/list` - List roles
- `POST /api/authority` - Create role
- `GET /api/menu/list` - List menus
- `POST /api/authority/setMenus` - Set role menus

### File Management
- `POST /api/upload` - Upload file
- `GET /api/upload/list` - List files
- `DELETE /api/upload` - Delete file

### Customer Management
- `GET /api/customer/list` - List customers
- `POST /api/customer` - Create customer
- `PUT /api/customer` - Update customer
- `DELETE /api/customer` - Delete customer

### AI Features
- `POST /api/ai/conversation` - Create AI conversation
- `POST /api/ai/chat` - Send chat message
- `GET /api/ai/conversation/list` - List conversations

## Development Guidelines

### Adding New API Endpoints
1. Create handler in `server/api/[feature]/` directory
2. Define model in `server/model/` if needed
3. Register route in `server/router/enter.go`
4. Add to appropriate route group (public/private)

### Database Changes
1. Add/update model in `server/model/`
2. Register model in `server/core/init_db.go` AutoMigrate
3. For production: set `disable-auto-migrate: true` in config

### Frontend Development
1. Create components in `web/packages/web/src/pages/`
2. Add API calls in `web/packages/web/src/api/`
3. Configure routes if adding new pages
4. Add menu items in layout configuration if needed

## Deployment

### Docker Compose (Recommended)
- Uses separate containers: MySQL, backend, frontend (Nginx)
- Backend and MySQL not exposed to host (internal network only)
- Frontend serves on port 80
- Includes health checks and resource limits

### Manual Deployment
- Backend: Build Go binary and run as service
- Frontend: Build static files and serve via Nginx/Apache
- Database: MySQL 8.0 with proper configuration

## Security Considerations

- **JWT tokens** stored in HTTP-only cookies or localStorage
- **Password hashing** using bcrypt
- **SQL injection protection** via GORM
- **CORS configuration** for cross-origin requests
- **Token blacklist** for immediate logout capability
- **Environment variables** for sensitive configuration

## Default Credentials
- **Admin user**: `admin` / `123456`
- **Important**: Change default credentials in production

## Monitoring & Health Checks
- Health endpoint: `GET /api/health`
- Structured logging with Zap
- Docker health checks for all services
- Log rotation and compression

## Common Development Tasks

### Running Tests
```bash
# Backend tests (if available)
cd server
go test ./...

# Frontend tests (if configured)
cd web
pnpm test
```

### Database Migration
For schema changes, update models and ensure they're registered in the AutoMigrate call in `server/core/init_db.go`.

### Adding New Dependencies
```bash
# Backend (Go modules)
cd server
go get package-name
go mod tidy

# Frontend (pnpm workspace)
cd web
pnpm add package-name
```

### Environment Setup
1. Install Go 1.23+, Node.js 20+, pnpm 9+
2. Configure database (MySQL/SQLite)
3. Set environment variables
4. Run `go mod download` and `pnpm install`
5. Start backend and frontend development servers

## Troubleshooting

### Common Issues
- **Database connection failed**: Check MySQL service and credentials
- **File upload failed**: Verify OSS configuration and permissions
- **JWT token expired**: Default 7-day expiration, re-login required
- **CORS errors**: Check frontend API URL configuration
- **Docker issues**: Verify `.env` file and port availability

### Log Locations
- Backend logs: `server/logs/` directory or Docker logs
- Frontend logs: Browser console and network tab
- Database logs: MySQL container logs or host MySQL logs
