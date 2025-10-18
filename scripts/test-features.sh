#!/bin/bash
set -e

echo ""
echo "=========================================="
echo "NCP Feature Test Suite - Version 1.5.4"
echo "=========================================="
echo ""

FAILED=0

# Phase 1 Tests: Quick Wins (Unit Tests)
echo "📦 Phase 1: Unit Tests"
echo "=========================================="
echo ""

# Test 1: Client Registry
echo "Running Test 1: Client Registry..."
if node scripts/test-client-registry.js; then
  echo ""
else
  echo "❌ Client Registry tests failed"
  FAILED=1
fi

# Test 2: Registry Security
echo "Running Test 2: Registry Security..."
if node scripts/test-registry-security.js; then
  echo ""
else
  echo "❌ Registry Security tests failed"
  FAILED=1
fi

# Phase 2 Tests: Integration Tests
echo "📦 Phase 2: Integration Tests"
echo "=========================================="
echo ""

# Test 3: HTTP/SSE Transport
echo "Running Test 3: HTTP/SSE Transport..."
echo "⏭️  Skipped: Test times out (connects to real endpoints)"
echo ""

# Phase 3 Tests: End-to-End Tests (Future)
echo "📦 Phase 3: End-to-End Tests"
echo "=========================================="
echo ""

# Test 4: HTTP Authentication
echo "Running Test 4: HTTP Authentication..."
if node scripts/test-http-auth.js; then
  echo ""
else
  echo "❌ HTTP Authentication tests failed"
  FAILED=1
fi

# Test 5: Protocol Transparency
echo "Running Test 5: Protocol Transparency..."
echo "⏭️  Skipped: Requires SDK Server clientInfo support (future implementation)"
echo ""

# Summary
echo "=========================================="
echo "Test Suite Summary"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo "✅ All Implemented Tests Passed!"
  echo ""
  echo "Coverage:"
  echo "  ✅ Client Registry (10 tests)"
  echo "  ✅ Registry Security (12 tests)"
  echo "  ⏭️  HTTP/SSE Transport (skipped: times out)"
  echo "  ✅ HTTP Authentication (12 tests)"
  echo "  ⏭️  Protocol Transparency (skipped: needs SDK Server support)"
  echo ""
  echo "Total: 34 automated tests passing"
  echo ""
  exit 0
else
  echo "❌ Some tests failed"
  echo ""
  exit 1
fi
