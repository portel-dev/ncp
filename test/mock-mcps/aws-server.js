#!/usr/bin/env node

/**
 * Mock AWS MCP Server
 * Real MCP server structure for AWS services testing
 */

import { MockMCPServer } from './base-mock-server.js';

const serverInfo = {
  name: 'aws-test',
  version: '1.0.0',
  description: 'Amazon Web Services integration for EC2, S3, Lambda, and cloud resource management'
};

const tools = [
  {
    name: 'create_ec2_instance',
    description: 'Launch new EC2 virtual machine instances with configuration. Create servers, deploy applications to cloud.',
    inputSchema: {
      type: 'object',
      properties: {
        image_id: {
          type: 'string',
          description: 'AMI ID for instance'
        },
        instance_type: {
          type: 'string',
          description: 'Instance size (t2.micro, m5.large, etc.)'
        },
        key_name: {
          type: 'string',
          description: 'Key pair name for SSH access'
        },
        security_groups: {
          type: 'array',
          description: 'Security group names',
          items: { type: 'string' }
        },
        tags: {
          type: 'object',
          description: 'Instance tags as key-value pairs'
        }
      },
      required: ['image_id', 'instance_type']
    }
  },
  {
    name: 'upload_to_s3',
    description: 'Upload files and objects to S3 storage buckets. Store files in cloud, backup data, host static content.',
    inputSchema: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'S3 bucket name'
        },
        key: {
          type: 'string',
          description: 'Object key/path in bucket'
        },
        file_path: {
          type: 'string',
          description: 'Local file path to upload'
        },
        content_type: {
          type: 'string',
          description: 'MIME type of file'
        },
        public: {
          type: 'boolean',
          description: 'Make object publicly accessible'
        }
      },
      required: ['bucket', 'key', 'file_path']
    }
  },
  {
    name: 'create_lambda_function',
    description: 'Deploy serverless Lambda functions for event-driven computing. Run code without servers, process events.',
    inputSchema: {
      type: 'object',
      properties: {
        function_name: {
          type: 'string',
          description: 'Lambda function name'
        },
        runtime: {
          type: 'string',
          description: 'Runtime environment (nodejs18.x, python3.9, etc.)'
        },
        handler: {
          type: 'string',
          description: 'Function handler entry point'
        },
        code: {
          type: 'object',
          description: 'Function code (zip file or inline)'
        },
        role: {
          type: 'string',
          description: 'IAM role ARN for execution'
        }
      },
      required: ['function_name', 'runtime', 'handler', 'code', 'role']
    }
  },
  {
    name: 'list_resources',
    description: 'List AWS resources across services with filtering options. View EC2 instances, S3 buckets, Lambda functions.',
    inputSchema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'AWS service name (ec2, s3, lambda, etc.)'
        },
        region: {
          type: 'string',
          description: 'AWS region to query'
        },
        filters: {
          type: 'object',
          description: 'Service-specific filters'
        }
      },
      required: ['service']
    }
  },
  {
    name: 'create_rds_database',
    description: 'Create managed RDS database instances with configuration. Set up MySQL, PostgreSQL databases in cloud.',
    inputSchema: {
      type: 'object',
      properties: {
        db_name: {
          type: 'string',
          description: 'Database instance identifier'
        },
        engine: {
          type: 'string',
          description: 'Database engine (mysql, postgres, etc.)'
        },
        instance_class: {
          type: 'string',
          description: 'Database instance size'
        },
        allocated_storage: {
          type: 'number',
          description: 'Storage size in GB'
        },
        username: {
          type: 'string',
          description: 'Master username'
        },
        password: {
          type: 'string',
          description: 'Master password'
        }
      },
      required: ['db_name', 'engine', 'instance_class', 'allocated_storage', 'username', 'password']
    }
  }
];

// Create and run the server
const server = new MockMCPServer(serverInfo, tools);
server.run().catch(console.error);