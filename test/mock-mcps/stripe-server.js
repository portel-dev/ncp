#!/usr/bin/env node

/**
 * Mock Stripe MCP Server
 * Real MCP server structure for payment processing testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'stripe-test',
  version: '1.0.0',
  description: 'Complete payment processing for online businesses including charges, subscriptions, and refunds'
};

const tools = [
  {
    name: 'create_payment',
    description: 'Process credit card payments and charges from customers. Charge customer for order, process payment from customer.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Payment amount in cents'
        },
        currency: {
          type: 'string',
          description: 'Three-letter currency code (USD, EUR, etc.)'
        },
        customer: {
          type: 'string',
          description: 'Customer identifier or email'
        },
        description: {
          type: 'string',
          description: 'Payment description for records'
        }
      },
      required: ['amount', 'currency']
    }
  },
  {
    name: 'refund_payment',
    description: 'Process refunds for previously charged payments. Refund cancelled subscription, return customer money.',
    inputSchema: {
      type: 'object',
      properties: {
        payment_id: {
          type: 'string',
          description: 'Original payment identifier to refund'
        },
        amount: {
          type: 'number',
          description: 'Refund amount in cents (optional, defaults to full amount)'
        },
        reason: {
          type: 'string',
          description: 'Reason for refund'
        }
      },
      required: ['payment_id']
    }
  },
  {
    name: 'create_subscription',
    description: 'Create recurring subscription billing for customers. Set up monthly billing, create subscription plans.',
    inputSchema: {
      type: 'object',
      properties: {
        customer: {
          type: 'string',
          description: 'Customer identifier'
        },
        price: {
          type: 'string',
          description: 'Subscription price identifier or amount'
        },
        trial_days: {
          type: 'number',
          description: 'Optional trial period in days'
        },
        interval: {
          type: 'string',
          description: 'Billing interval (monthly, yearly, etc.)'
        }
      },
      required: ['customer', 'price']
    }
  },
  {
    name: 'list_payments',
    description: 'List payment transactions with filtering and pagination. See all payment transactions from today, view payment history.',
    inputSchema: {
      type: 'object',
      properties: {
        customer: {
          type: 'string',
          description: 'Optional customer filter'
        },
        date_range: {
          type: 'object',
          description: 'Optional date range filter with start and end dates'
        },
        status: {
          type: 'string',
          description: 'Optional payment status filter (succeeded, failed, pending)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return'
        }
      }
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);