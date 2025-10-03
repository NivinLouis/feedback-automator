# Vidya Feedback Automator

## Overview

The Vidya Feedback Automator is a Next.js web application that automates the process of submitting feedback forms on the Vidya Academy ERP system. The application logs into the ERP, fetches pending feedback forms, and allows users to submit ratings (Excellent, Very Good, Good, Fair, or Poor) either uniformly for all faculties or customized per faculty, streamlining what would otherwise be a manual, repetitive task for students.

The system uses a client-server architecture where the frontend provides a user interface for credential input, feedback rating selection, and real-time progress tracking, while the backend handles authentication with the ERP system and processes feedback submissions through streaming responses.

## Recent Changes

**October 3, 2025** - Added feedback customization features:
- Login validation: Users must enter credentials before starting automation (shows error alert if fields are empty)
- Feedback mode selection: Two modes available - "Set for all" (same rating for all faculties) or "Custom per faculty" (individual ratings)
- Rating options: Support for all five rating levels (Excellent, Very Good, Good, Fair, Poor) instead of only Excellent
- Interactive modal: For custom mode, displays faculty list with rating dropdowns before submission
- Enhanced logging: Shows which rating is being applied to each faculty in the automation logs

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui components

**Design Pattern**: The application follows a single-page application (SPA) pattern with server-side API routes. The frontend is built using React's client components with hooks for state management.

**Key Architectural Decisions**:

1. **Real-time Progress Tracking**: Uses streaming responses from the backend to provide live updates during the automation process. This was chosen over polling or WebSockets for simplicity and better integration with Next.js API routes.
   - Pros: Native support in Next.js, simpler implementation, lower resource overhead
   - Cons: One-way communication only (server to client)

2. **Component Library**: Implements shadcn/ui with Radix UI primitives for accessible, customizable components
   - Rationale: Provides production-ready components while maintaining full control over styling and behavior
   - Alternative considered: Material-UI or Chakra UI (rejected due to heavier bundle size and less customization flexibility)

3. **Styling System**: Tailwind CSS 4 with custom theme configuration for consistent design tokens
   - Uses CSS variables for theming support (light/dark modes)
   - Custom variant system for dark mode implementation

### Backend Architecture

**Technology Stack**: Next.js API Routes (App Router), Axios for HTTP requests

**Design Pattern**: Serverless functions with streaming response architecture

**Key Architectural Decisions**:

1. **Streaming API Response**: The `/api/automate/route.js` endpoint uses ReadableStream to send incremental updates to the client
   - Problem: Users need real-time feedback during long-running automation tasks
   - Solution: Server-Sent Events pattern via streaming JSON responses
   - Pros: Real-time updates, better UX, ability to track progress granularly
   - Cons: More complex error handling, requires client-side stream parsing

2. **Session Management**: Uses cookie-based session management with the ERP system
   - Extracts session ID (sid) from login response cookies
   - Passes sid in subsequent API calls to maintain authentication
   - Rationale: Matches the ERP system's authentication mechanism

3. **Error Handling**: Centralized error handling in API calls with detailed error propagation
   - Server errors are logged and transformed into user-friendly messages
   - Streaming architecture allows real-time error reporting to the UI

### Data Flow Architecture

1. **Authentication Flow**:
   - User submits credentials → API route authenticates with ERP → Session ID stored → Subsequent requests use session
   
2. **Automation Flow**:
   - Login → Fetch batch info → Fetch semester → Fetch config → Identify pending forms → Submit each form with progress updates

3. **Progress Tracking System**:
   - Backend sends step updates via stream (login, batch, semester, config, pending, submit)
   - Frontend updates UI components based on step progress
   - Each step includes progress percentage and detail information

### State Management

**Approach**: React hooks (useState, useRef, useEffect) for local component state

**Key State Decisions**:

1. **Multi-step Progress**: Steps array maintains state for each automation phase
   - Each step tracks: key, label, progress percentage, detail text, and counts
   - Chosen over global state management for simplicity (single-page app)

2. **Log Management**: Append-only logs array for audit trail and debugging
   - Auto-scrolling implemented via refs and useEffect
   - Provides transparency into automation process

3. **Stream Reference Management**: useRef for maintaining reader instance across renders
   - Prevents memory leaks from unclosed streams
   - Enables proper cleanup on component unmount

## External Dependencies

### Third-Party Services

1. **Vidya Academy ERP System** (`https://erp.vidyaacademy.ac.in`)
   - Purpose: Target system for feedback automation
   - Integration: JSON-RPC 2.0 API calls
   - Authentication: Cookie-based session management
   - Endpoints used:
     - `/web/session/authenticate` - User authentication
     - `/web/dataset/call_kw/*` - Data fetching and manipulation
   - Database: "liveone" (specified in authentication params)

2. **Vercel Analytics** (`@vercel/analytics`)
   - Purpose: Usage analytics and monitoring
   - Integration: Next.js plugin, auto-tracks page views and web vitals
   - Rationale: Zero-config analytics for deployment insights

### NPM Packages

**UI Components**:
- `@radix-ui/react-*`: Accessible component primitives (Progress, ScrollArea, Slot)
- `lucide-react`: Icon library for consistent iconography
- `class-variance-authority`: Type-safe variant API for components
- `tailwind-merge` & `clsx`: Utility for conditional Tailwind class merging

**HTTP & Data**:
- `axios`: HTTP client for ERP API communication
  - Chosen over fetch for better error handling and request/response interceptors
  - Used for JSON-RPC calls to ERP system

**Styling**:
- `tailwindcss`: Utility-first CSS framework
- `@tailwindcss/postcss`: PostCSS integration for Tailwind v4
- `tw-animate-css`: Animation utilities for Tailwind

### Configuration Files

1. **components.json**: shadcn/ui configuration
   - Defines component style ("new-york"), path aliases, and icon library
   - Controls TypeScript/JavaScript preference (tsx: false)

2. **jsconfig.json**: Path alias configuration
   - Enables `@/*` imports mapping to `./src/*`
   - Improves import statement clarity and refactoring

### Development Considerations

**Port Configuration**: Custom port 5000 (instead of default 3000)
- Configured in package.json scripts with `-p 5000 -H 0.0.0.0`
- Allows network access for testing across devices

**Font Optimization**: Uses Next.js font optimization with Geist fonts
- `next/font/google` for automatic font loading and optimization
- Variable fonts for better performance and flexibility