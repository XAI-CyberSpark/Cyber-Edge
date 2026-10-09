export const mcpCategories = [
  { id: 'browser-automation', name: '浏览器自动化' }, { id: 'search', name: '搜索工具' },
  { id: 'location-services', name: '位置服务' }, { id: 'communication', name: '交流协作工具' },
  { id: 'developer-tools', name: '开发者工具' }, { id: 'entertainment-and-media', name: '娱乐与多媒体' },
  { id: 'file-systems', name: '文件系统' }, { id: 'finance', name: '金融' },
] as const;
export const mcpCategoryName = (id: string) => mcpCategories.find(c => c.id === id)?.name ?? ({ 'calendar-management': '日历管理' } as Record<string, string>)[id] ?? id;
export type McpCatalogEntry = {
  id: string; name: string; categories: string[]; tags: string[]; provider: string;
  description: string; logo_url: string; view_count: number | null; is_hosted: boolean | null; url: string;
  readme?: string; readme_truncated?: boolean; configuration_fields?: { name: string; description: string; required: boolean }[]; installation_methods?: string[];
  installation?: { server_id: string; package: string; version: string; status: 'installed' | 'on_first_run'; usage_note?: string; tools: McpTool[] } | null;
  required_fields?: string[]; connection_status?: 'not_connected';
};
export type McpCatalogPage = { items: McpCatalogEntry[]; total: number; page: number; page_size: number; max_results: number; has_next: boolean };
export type McpCategoryCounts = { total: number | null; categories: { id: string; count: number | null }[] };

export type McpParameter = { name: string; type: string; required?: boolean; description: string; default?: unknown; input_ref?: string };
export type McpTool = { name: string; title?: string; parameters: McpParameter[] };
export type McpCanvasProps = { onAddToCanvas?: (spec: {type: string; label: string; data?: Record<string, unknown>}) => void; addDisabledReason?: string };
export function mcpNodeSpec(item: McpCatalogEntry, tool = item.installation?.tools[0]) {
  if (!item.installation || !tool) return null;
  return { type: 'tool', label: item.installation.tools.length > 1 ? `${item.name} · ${tool.title || tool.name}` : item.name, data: { tool_id: 'mcp', serverId: item.installation.server_id, toolName: tool.name,
    mcpParameters: tool.parameters, catalogId: item.id,
    arguments: Object.fromEntries(tool.parameters.filter(parameter => parameter.required || parameter.default !== undefined || parameter.input_ref)
      .map(parameter => [parameter.name, parameter.default !== undefined ? parameter.default : parameter.input_ref ? { $ref: parameter.input_ref } : parameter.type === 'string' ? '' : null])) } };
}
