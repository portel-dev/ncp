# Contributing to NCP

Thank you for your interest in contributing to the Natural Context Protocol (NCP) project! This document provides guidelines and information for contributors.

## Code of Conduct

This project follows a standard code of conduct. Be respectful, inclusive, and professional in all interactions.

## Development Workflow

### Prerequisites

- Node.js 18+ and npm
- TypeScript knowledge
- Familiarity with Jest testing framework
- Understanding of the Model Context Protocol (MCP)

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/ncp.git
cd ncp

# Install dependencies
npm install

# Run tests to ensure everything works
npm test
```

### Test-Driven Development

NCP follows strict TDD principles:

1. **Write tests first** - All new features must have tests written before implementation
2. **Red-Green-Refactor** - Follow the TDD cycle strictly
3. **High coverage** - Maintain 95%+ test coverage
4. **Integration tests** - Test component interactions, not just units

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm test -- --watch

# Run specific test suites
npm test -- --testNamePattern="ProfileManager"
npm test -- --testNamePattern="CLI"

# Run with coverage report
npm run test:coverage
```

### Code Quality Standards

- **TypeScript Strict Mode**: All code must pass strict TypeScript checks
- **ESLint**: Follow the project's ESLint configuration
- **No Console Logs**: Use proper logging mechanisms in production code
- **Error Handling**: All async operations must have proper error handling
- **Resource Cleanup**: Always clean up resources (timeouts, connections, etc.)

### Commit Guidelines

Follow conventional commit format:

```
type(scope): description

Examples:
feat(cli): add new profile export command
fix(transport): resolve timeout cleanup issue
docs(readme): update installation instructions
test(orchestrator): add edge case coverage
```

**Commit Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Test additions or modifications
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write tests first**:
   - Create comprehensive test cases
   - Ensure tests fail initially (red phase)

3. **Implement your feature**:
   - Write minimal code to pass tests (green phase)
   - Refactor for quality and maintainability

4. **Ensure quality**:
   ```bash
   # All tests must pass
   npm test

   # Code must compile without errors
   npm run build

   # Follow TypeScript strict mode
   npm run typecheck
   ```

5. **Document your changes**:
   - Update README if needed
   - Add/update JSDoc comments
   - Update CHANGELOG.md

6. **Submit pull request**:
   - Clear title and description
   - Reference any related issues
   - Include test results
   - Request review from maintainers

### Project Structure

```
src/
├── core/           # Core orchestration and discovery
├── transport/      # MCP communication layers
├── profiles/       # Profile management system
├── discovery/      # Semantic matching algorithms
├── cli/           # Command-line interface
└── types/         # TypeScript type definitions

tests/
├── setup.ts       # Jest configuration
└── jest-setup.ts  # Environment setup
```

### Feature Development Guidelines

#### Adding New Transport Types
1. Create interface in `src/types/index.ts`
2. Implement transport in `src/transport/`
3. Add comprehensive tests
4. Update orchestrator to support new transport
5. Add CLI commands if needed

#### Extending Semantic Discovery
1. Add test cases in `src/discovery/semantic-matcher.test.ts`
2. Implement matching algorithms
3. Update confidence scoring mechanisms
4. Ensure backward compatibility

#### CLI Command Addition
1. Write CLI tests first in `src/cli/index.test.ts`
2. Implement command handlers
3. Add help documentation
4. Test error handling thoroughly

### Testing Guidelines

#### Unit Tests
- Test individual functions and methods
- Mock external dependencies
- Cover edge cases and error conditions
- Use descriptive test names

#### Integration Tests
- Test component interactions
- Verify end-to-end workflows
- Test real MCP server connections (when possible)
- Validate error propagation

#### Test Structure
```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup for each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('feature description', () => {
    it('should behave correctly in normal case', async () => {
      // Test implementation
    });

    it('should handle error case gracefully', async () => {
      // Error case testing
    });
  });
});
```

### Performance Considerations

- **Token Efficiency**: All features should maintain or improve token reduction
- **Memory Management**: Proper cleanup of resources and event listeners
- **Async Operations**: Use proper async/await patterns
- **Caching**: Consider caching strategies for expensive operations

### Security Guidelines

- **Input Validation**: Validate all external inputs
- **Path Security**: Prevent path traversal attacks
- **Process Security**: Secure child process spawning
- **Error Information**: Don't leak sensitive information in errors

### Documentation Standards

- **JSDoc Comments**: All public APIs must have JSDoc
- **README Updates**: Keep README synchronized with features
- **Example Code**: Provide working examples for new features
- **Architecture Docs**: Update architecture documentation for significant changes

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Code Review**: Maintainers will provide feedback on pull requests

### License

By contributing to NCP, you agree that your contributions will be licensed under the Elastic License v2.

---

Thank you for contributing to NCP! Your efforts help make AI tool integration more efficient for everyone.