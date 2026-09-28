import { createHash } from 'node:crypto';
import type { McpServerConfig } from '@shared/domain/assistant/types';
import type { ToolDefinition } from './toolRegistry';

type McpTool = ToolDefinition['openaiTool'];

interface McpListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

/**
 * Minimal HTTP MCP client — lists tools and calls them via JSON-RPC.
 * Supports servers exposing standard MCP HTTP transport.
 */
export class McpBridge {
  private originalNames = new Map<string, string>();
  private toolCache = new Map<string, McpTool[]>();

  async listTools(servers: McpServerConfig[], signal?: AbortSignal): Promise<McpTool[]> {
    const enabled = servers.filter((s) => s.enabled !== false && s.url?.trim());
    const all: McpTool[] = [];

    for (const server of enabled) {
      signal?.throwIfAborted();
      const cacheKey = server.url;
      if (this.toolCache.has(cacheKey)) {
        all.push(...(this.toolCache.get(cacheKey) || []));
        continue;
      }

      try {
        const tools = await this.fetchTools(server, signal);
        this.toolCache.set(cacheKey, tools);
        all.push(...tools);
      } catch (err) {
        console.warn(`[MCP] Failed to list tools from ${server.name}:`, err);
      }
    }

    return all;
  }

  async callTool(
    servers: McpServerConfig[],
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<string> {
    const enabled = servers.filter((s) => s.enabled !== false && s.url?.trim());

    for (const server of enabled) {
      signal?.throwIfAborted();
      const tools = this.toolCache.get(server.url) || (await this.listTools([server], signal));
      const match = tools.find((t) => t.function.name === toolName || t.function.name === `mcp_${toolName}`);
      if (!match) continue;

      signal?.throwIfAborted();
      const actualName = match.function.name;
      try {
        const result = await this.rpc(server.url, 'tools/call', {
          name: this.originalNames.get(actualName) || actualName,
          arguments: args,
        }, signal);
        return JSON.stringify({ success: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'MCP tool call failed';
        return JSON.stringify({ success: false, error: msg });
      }
    }

    return JSON.stringify({ success: false, error: `MCP tool not found: ${toolName}` });
  }

  clearCache() {
    this.toolCache.clear();
    this.originalNames.clear();
  }

  private async fetchTools(server: McpServerConfig, signal?: AbortSignal): Promise<McpTool[]> {
    const result = (await this.rpc(server.url, 'tools/list', {}, signal)) as McpListToolsResult;
    const tools = result?.tools || [];
    return tools.map((t) => {
      const name = `mcp_${createHash('sha256').update(JSON.stringify([server.url, t.name])).digest('hex').slice(0, 12)}_${t.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`;
      this.originalNames.set(name, t.name);
      return ({
      type: 'function' as const,
      function: {
        name,
        description: t.description || `MCP tool: ${t.name} (from ${server.name})`,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }); });
  }

  private async rpc(url: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || 'MCP RPC error');
    }
    return data.result;
  }
}

export const mcpBridge = new McpBridge();
