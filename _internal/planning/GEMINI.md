# NCP (Natural Context Provider) - Developer Context

## Project Overview
**NCP** is a meta-MCP server (Model Context Protocol) that acts as a unified gateway/router for AI assistants. Instead of connecting an AI client (like Claude Desktop or Cursor) to dozens of individual MCP servers (which bloats context and causes decision paralysis), the client connects only to NCP. NCP then manages discovery, routing, execution, scheduling, and health monitoring of downstream MCPs.

**Core Value:** Reduces context usage by ~97% (150k -> 8k tokens) and improves tool selection speed/accuracy via semantic vector search.

## Tech Stack
*   **Runtime:** Node.js (v18+)
*   **Language:** TypeScript
*   **Core Libraries:**
    *   `@modelcontextprotocol/sdk`: MCP implementation.
    *   `@xenova/transformers`: Local vector embeddings for semantic search.
    *   `commander`: CLI interface.
    *   `express` (via deps): HTTP transport handling.
*   **Testing:** Jest (`ts-jest`), with support for E2E and integration tests.

## Key Architecture Components
*   **Orchestrator (`src/orchestrator/`):** The brain. Manages the pool of connections to downstream MCPs, handles routing, and lifecycle (lazy loading/hibernation).
*   **Discovery Engine (`src/discovery/`):** Uses vector embeddings to semantically match natural language user queries (e.g., "read file") to specific tools (e.g., `filesystem:read_file`).
*   **Registry (`src/registry/`):** Manages known MCPs, configuration, and profiles.
*   **Transports (`src/transports/`):** Handles communication (Stdio, HTTP/SSE).
*   **Photons:** Lightweight, local TypeScript-based MCPs that don't require full npm packaging.

## Development Workflow

### Build & Run
*   **Install Dependencies:** `npm install`
*   **Build:** `npm run build` (Compiles TS to `dist/`, handles schemas)
*   **Run CLI (Dev):** `npm start` or `./dist/index.js`
*   **Run MCP Server (Dev):** `node dist/index-mcp.js`

### Testing Standards (Strict TDD)
*   **Run All Tests:** `npm test`
*   **Critical Path:** `npm run test:critical` (MCP protocol & timeout scenarios)
*   **E2E Tests:** `npm run test:e2e`
*   **Watch Mode:** `npm run test:watch`

**Conventions:**
*   **Test-First:** Write tests before implementation (Red-Green-Refactor).
*   **Coverage:** Maintain high coverage (>95% target).
*   **Strict Mode:** TypeScript `strict: true` is enforced.
*   **Error Handling:** Never swallow errors; propagate or handle gracefully with proper cleanup.

## Important Directories
*   `src/index.ts`: CLI entry point (`ncp`).
*   `src/index-mcp.ts`: MCP Server entry point (used by AI clients).
*   `tests/`: Comprehensive test suite.
*   `docs/`: Extensive documentation (Architecture, Guides).
*   `.ncp/`: Default location for configuration, cache, and logs (usually in user home, but respects project-local `.ncp` if present).

## Common Tasks
*   **Adding a new Transport:** Implement interface in `src/transports/`, update `Orchestrator`.
*   **Modifying Discovery:** Check `src/discovery/semantic-matcher.ts`. Ensure embedding cache invalidation logic is sound.
*   **Debugging:** Use `DEBUG=ncp:*` environment variable for verbose logging.

## Commit Guidelines
Follow **Conventional Commits**:
*   `feat(...)`: New features
*   `fix(...)`: Bug fixes
*   `test(...)`: Adding tests
*   `docs(...)`: Documentation updates
*   `refactor(...)`: Code restructuring without behavior change
