/** Authoring checks are not runtime or device certification. */
export type ScenarioBuildReport = {
  status: 'needs_input' | 'needs_changes' | 'capability_gap' | 'preview';
  can_apply: boolean;
  can_inspect?: boolean;
  draft_displayed?: boolean;
  brief: {
    title: string; goal: string; experience_outline: string[]; assumptions: string[]; questions: string[];
    requirements: Array<{id: string; description: string; acceptance: string}>;
  };
  coverage: Array<{requirement_id: string; status: 'implemented' | 'simulated' | 'missing'; node_ids: string[]; note: string}>;
  issues: string[];
  runtime_verified: boolean;
  execution?: {status: string; model_calls?: number; scope?: string; cases?: Array<{name:string;passed:boolean}>};
  rehearsal?: { status: string; inputs: number; checks: string[]; issue?: string };
};

export function canApplyScenario(result: { validation?: {passed: boolean}; project?: {nodes?: unknown[]}; build_report?: ScenarioBuildReport }) {
  return result.validation?.passed === true && !!result.project?.nodes?.length &&
    (!result.build_report || result.build_report.status === 'preview' && result.build_report.can_apply === true);
}

export function canInspectScenario(result: {project?: {nodes?: Array<{data?: Record<string, unknown>}>}; build_report?: ScenarioBuildReport}, existingNodeCount: number) {
  return existingNodeCount === 0 && result.build_report?.can_apply === false && result.build_report.can_inspect === true &&
    !!result.project?.nodes?.length && result.project.nodes.every(node => node.data?.designOnly === true);
}

export function describeScenarioBuild(report: ScenarioBuildReport): string {
  if (report.status === 'needs_input' && !report.draft_displayed) return ['为了完成这个场景，还需要确认：', ...report.brief.questions.map((q,i)=>`${i+1}. ${q}`)].join('\n');
  const lines = [report.can_apply ? `「${report.brief.title}」已生成，可以进入仿真体验。` : report.draft_displayed ? `「${report.brief.title}」已生成节点草稿，可在画布检查；尚不能运行。` : `「${report.brief.title}」还未达到可应用条件，当前画布已保留。`];
  if (report.can_apply) {
    lines.push('', report.brief.experience_outline.join(' → '));
    if (report.brief.assumptions.length) lines.push('', `本次假设：${report.brief.assumptions.join('；')}`);
    const simulated = report.coverage.filter(c=>c.status==='simulated');
    if (simulated.length) lines.push('', `目前使用模拟：${[...new Set(simulated.map(c=>c.note))].join('；')}`);
    lines.push('', report.execution?.status === 'passed' ? `已通过${report.execution.cases?.length || 0}组实际引擎试跑，覆盖所列输入与结果断言；内容质量与真实设备效果仍需验证。` : report.rehearsal?.status === 'passed' ? '已自动试跑答题、暂停和收尾流程，可到仿真查看体验。内容与真实设备效果仍需验证。' : '生成检查已完成；实际运行效果仍需在仿真中验证。');
  } else {
    const missing = report.coverage.filter(c=>c.status==='missing');
    const issues = [...report.brief.questions.map(q=>`待确认：${q}`), ...(missing.length ? missing.map(c=>c.note) : report.issues.filter(i=>!i.startsWith('待确认：')))];
    lines.push('', ...issues.slice(0,4).map(i=>`- ${i}`), '', report.draft_displayed ? '缺口和未通过项已保留；补齐能力或修正后重新生成，通过检查再运行。' : '可继续在这里修改需求，候选方案与检查记录已保留。');
  }
  return lines.join('\n');
}
