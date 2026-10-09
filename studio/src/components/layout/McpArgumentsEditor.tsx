import { useState } from 'react';
import { uiText } from '@/i18n';
import type { McpParameter } from '@/data/mcpCatalog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function McpArgumentsEditor({data, onChange}: {data: any; onChange: (value: Record<string, unknown>) => void}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const parameters: McpParameter[] = Array.isArray(data.mcpParameters) ? data.mcpParameters : [];
  const values = data.arguments || {};
  const update = (name: string, value: unknown) => {setDraft(null); setError(''); onChange({...values, [name]: value});};
  return <div className="space-y-4">
    <div><Label>{uiText("MCP 工具")}</Label><p className="type-code break-all">{data.serverId} / {data.toolName}</p></div>
    {data.catalogId && <p className="type-caption text-muted-foreground">{uiText("首次 Run 自动准备独立环境，安装失败会停止本次调用。")}</p>}
    {parameters.map(parameter => {
      const value = values[parameter.name];
      const reference = value && typeof value === 'object' && '$ref' in value;
      return <div className="space-y-2" key={parameter.name}>
        <Label htmlFor={`mcp-${parameter.name}`}>{parameter.name} {parameter.required && uiText("（必填）")}</Label>
        {parameter.type === 'boolean' ? <input id={`mcp-${parameter.name}`} type="checkbox" checked={value === true} onChange={event => update(parameter.name, event.target.checked)}/> :
          <Input id={`mcp-${parameter.name}`} type={parameter.type === 'integer' && !reference ? 'number' : 'text'} value={reference ? String(value.$ref) : value ?? ''}
            onChange={event => update(parameter.name, reference ? {$ref: event.target.value} : parameter.type === 'integer' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}/>}
        <p className="type-caption text-muted-foreground">{uiText(parameter.description)}</p>
        {parameter.type === 'string' && <label className="flex items-center gap-2 type-label"><input type="checkbox" checked={!!reference} onChange={event => update(parameter.name, event.target.checked ? {$ref: 'input.text'} : '')}/>{uiText("使用上游字段")}</label>}
      </div>;
    })}
    <details><summary className="type-label cursor-pointer">{uiText("参数 JSON")}</summary>
      <Textarea aria-label={uiText("MCP参数 JSON")} className="type-code min-h-32 mt-2" value={draft ?? JSON.stringify(values, null, 2)} onChange={event => {
        setDraft(event.target.value);
        try {
          const value = JSON.parse(event.target.value);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
          setError(''); onChange(value);
        } catch { setError('请输入有效的JSON对象，尚未应用此修改。'); }
      }}/>{error && <p role="alert" className="type-body text-destructive">{uiText(error)}</p>}
    </details>
  </div>;
}
