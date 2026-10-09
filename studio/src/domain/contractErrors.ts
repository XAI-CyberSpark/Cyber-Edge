export type ErrorCategory = 'input_contract' | 'model_output' | 'graph_logic' | 'assertion';
export class ContractError extends Error {
  category: ErrorCategory;
  code: string;
  field?: string;
  constructor(message: string, category: ErrorCategory, code: string, field?: string) {
    super(message); this.category=category; this.code=code; this.field=field;
  }
}
export function errorDetails(error: unknown) {
  return error instanceof ContractError ? {category:error.category,code:error.code,...(error.field?{field:error.field}:{})}
    : {category:'graph_logic' as const,code:'GRAPH_EXECUTION'};
}
