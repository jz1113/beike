import type { McpServerConfig } from '@beike/domain/assistant/types';
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
  private toolCache = new Map<string, McpTool[]>();

  async listTools(servers: McpServerConfig[]): Promise<McpTool[]> {
    const enabled = servers.filter((s) => s.enabled !== false && s.url?.trim());
    const all: McpTool[] = [];

    for (const server of enabled) {
      const cacheKey = server.url;
      if (this.toolCache.has(cacheKey)) {
        all.push(...(this.toolCache.get(cacheKey) || []));
        continue;
      }

      try {
        const tools = await this.fetchTools(server);
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
  ): Promise<string> {
    const enabled = servers.filter((s) => s.enabled !== false && s.url?.trim());

    for (const server of enabled) {
      const tools = this.toolCache.get(server.url) || (await this.listTools([server]));
      const match = tools.find((t) => t.function.name === toolName || t.function.name === `mcp_${toolName}`);
      if (!match) continue;

      const actualName = match.function.name;
      try {
        const result = await this.rpc(server.url, 'tools/call', {
          name: actualName.replace(/^mcp_/, ''),
          arguments: args,
        });
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
  }

  private async fetchTools(server: McpServerConfig): Promise<McpTool[]> {
    const result = (await this.rpc(server.url, 'tools/list', {})) as McpListToolsResult;
    const tools = result?.tools || [];
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: `mcp_${t.name}`,
        description: t.description || `MCP tool: ${t.name} (from ${server.name})`,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  private async rpc(url: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(30000),
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
