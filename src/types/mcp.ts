import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Readable } from 'stream';

export class Server {
  private handlers = new Map<any, (request: any) => Promise<any>>();
  private app = express();

  constructor() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setRequestHandler(schema: any, handler: (request: any) => Promise<any>) {
    this.handlers.set(schema, handler);
  }

  async listen(transport: 'stdio' | 'http', options?: any) {
    if (transport === 'stdio') {
      await this.handleStdio();
    } else {
      const port = options?.port || 3002;
      const server = createServer(this.app);
      server.listen(port);
    }
  }

  private async handleStdio() {
    const input = process.stdin;
    const output = process.stdout;
    
    input.setEncoding('utf8');
    
    let buffer = '';
    input.on('data', (chunk) => {
      buffer += chunk;
      
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        try {
          const request = JSON.parse(line);
          this.handleRequest(request).then(response => {
            output.write(JSON.stringify(response) + '\n');
          });
        } catch (error) {
          // Silent error handling for production
        }
      }
    });
  }

  private async handleRequest(request: any) {
    for (const [schema, handler] of this.handlers) {
      try {
        const parsed = schema.parse(request);
        return await handler(parsed);
      } catch (error) {
        continue;
      }
    }
    throw new Error('No matching handler found');
  }
}

export const ListToolsRequestSchema = z.object({});

export const CallToolRequestSchema = z.object({
  name: z.string(),
  args: z.record(z.any())
});

export interface CallToolRequest {
  name: string;
  args: Record<string, any>;
} 