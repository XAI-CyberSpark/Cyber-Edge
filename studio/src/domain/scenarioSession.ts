import {FlowSessions} from './flowSession';
/** A bounded, resumable text experience. The model supplies content, never transitions or actions. */
export type WaitFor = 'answer' | 'continue' | 'arrival';
export type StepContent = { message: string; question?: string; answers?: string[]; hint?: string; reward?: string };
export type InteractionStep = { id: string; title: string; brief?: string; waitFor: WaitFor; acceptedAnswers?: string[]; hideAnswerInOpening?: boolean; fixedQuestion?: string; content?: StepContent };
export type InteractionPlan = { mode: 'authored' | 'live'; model?: string; premise: string; steps: InteractionStep[]; ending: string };
export type SessionEvent = { id: string; type: 'message' | 'pause' | 'resume' | 'next' | 'arrival' | 'skip' | 'stop' | 'restart'; text: string; source: 'chat' | 'simulated-chat' };
export type SessionState = { revision: number; index: number; status: 'waiting' | 'paused' | 'completed' | 'stopped'; content: StepContent; solved: boolean; rewards: string[]; history: string[]; seen: string[]; reply: string; source: 'authored' | 'live-model' };
export type SessionResult = { reply: string; session: Omit<SessionState, 'content' | 'seen' | 'history'>; duplicate?: boolean; simulated: boolean; finished: boolean };
export type ContentGenerator = (plan: InteractionPlan, step: InteractionStep, rewards: string[], signal?: AbortSignal, history?: string[]) => Promise<StepContent>;
const text = (v: unknown, max = 3000): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
export function validateContent(value: unknown, waitFor: WaitFor): asserts value is StepContent {
  const c = value as StepContent;
  if (!c || !text(c.message) || Object.keys(c).some(k => !['message','question','answers','hint','reward'].includes(k))) throw new Error('互动内容格式无效，进度未推进。');
  if (['question','hint','reward'].some(k => c[k as keyof StepContent] !== undefined && !text(c[k as keyof StepContent], 1000))) throw new Error('互动文字字段无效。');
  if (c.answers !== undefined && (!Array.isArray(c.answers) || !c.answers.length || c.answers.length > 12 || c.answers.some(a => !text(a,100)))) throw new Error('答案必须是简短有效文字列表。');
  if (waitFor === 'answer' && (!text(c.question) || !c.answers?.length || !text(c.hint))) throw new Error('问答阶段必须有问题、答案和提示。');
  if (waitFor !== 'answer' && (c.question !== undefined || c.answers !== undefined)) throw new Error('非问答阶段不能配置需要回答的问题。');
}
export function validateInteractionPlan(value: unknown): string[] {
  try {
    const p = value as InteractionPlan;
    if (!p || !['authored','live'].includes(p.mode) || !text(p.premise,4000) || !text(p.ending)) throw new Error('请配置互动模式、场景背景和结束语。');
    if (p.mode === 'live' && !text(p.model,200)) throw new Error('实时创作需要配置模型。');
    if (!Array.isArray(p.steps) || !p.steps.length || p.steps.length > 12) throw new Error('请配置 1–12 个互动阶段。');
    const ids = new Set<string>();
    for (const s of p.steps) {
      if (!s || !text(s.id,80) || ids.has(s.id) || !text(s.title,100) || !['answer','continue','arrival'].includes(s.waitFor)) throw new Error('阶段需要唯一 ID、标题和有效等待事件。');
      ids.add(s.id);
      if (s.fixedQuestion !== undefined && (s.waitFor!=='answer' || !text(s.fixedQuestion,1000) || !s.acceptedAnswers?.length)) throw new Error('固定题面需要问答阶段和固定答案。');
      if (s.hideAnswerInOpening !== undefined && typeof s.hideAnswerInOpening !== 'boolean') throw new Error('隐藏谜底配置必须为布尔值。');
      if (s.hideAnswerInOpening && !s.acceptedAnswers?.length) throw new Error('隐藏谜底检查需要先配置固定答案。');
      if (s.acceptedAnswers !== undefined && (s.waitFor !== 'answer' || !Array.isArray(s.acceptedAnswers) || !s.acceptedAnswers.length || s.acceptedAnswers.length > 12 || s.acceptedAnswers.some(a=>!text(a,100)))) throw new Error('固定答案需要 1–12 个简短答案，且仅用于问答阶段。');
      if (p.mode === 'authored') validateContent(s.content,s.waitFor);
      else if (!text(s.brief,2000)) throw new Error('实时创作的每个阶段需要创作要求。');
    }
    return [];
  } catch (e) { return [e instanceof Error ? e.message : '互动配置无效']; }
}
export function parseSessionEvent(input: unknown, id: string): SessionEvent {
  const raw = typeof input === 'string' ? input : typeof (input as any)?.text === 'string' ? (input as any).text : '';
  const command = raw.trim().replace(/[。！!？?]+$/u,'');
  const commands: Record<string, SessionEvent['type']> = { '暂停':'pause','继续':'resume','下一站':'next','下一章':'next','到达了':'arrival','到达':'arrival','到达啦':'arrival','抵达':'arrival','抵达了':'arrival','跳过':'skip','退出':'stop','结束':'stop','再见':'stop','重新开始':'restart' };
  const type = commands[command] || 'message';
  return {id,type,text:raw,source:['next','arrival'].includes(type) ? 'simulated-chat' : 'chat'};
}
const normalizeAnswer = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]/gu,'');
const visible = (s: SessionState) => [s.content.message, !s.solved && s.content.question && !s.content.message.includes(s.content.question) && s.content.question].filter(Boolean).join('\n\n');

export function validateStepAnswers(content: unknown, step: InteractionStep): asserts content is StepContent {
  validateContent(content,step.waitFor);
  if (step.fixedQuestion) content.question=step.fixedQuestion;
  if (step.acceptedAnswers) {
    const allowed=step.acceptedAnswers.map(normalizeAnswer);
    if (content.answers!.some(a=>!allowed.includes(normalizeAnswer(a)))) throw new Error('模型改变了已配置的答案，请按固定答案重新创作题目。');
    content.answers=[...step.acceptedAnswers];
    if (step.hideAnswerInOpening && allowed.some(a=>normalizeAnswer(content.message).includes(a))) throw new Error('开场提前包含固定答案，请重写 message，不能出现固定答案字词。');
  }
}

export class ScenarioSessions {
  readonly flow = new FlowSessions();
  private states = new Map<string, { signature: string; state: SessionState }>();
  private locks = new Set<string>();
  clear() { if (this.locks.size) throw new Error('请等待本次互动完成。'); this.states.clear(); this.flow.clear(); }
  snapshot(key: string) { const record=this.states.get(key); return record ? structuredClone(record.state) : undefined; }
  async handle(key: string, plan: InteractionPlan, event: SessionEvent, generate?: ContentGenerator, signal?: AbortSignal): Promise<SessionResult> {
    const problems=validateInteractionPlan(plan); if (problems.length) throw new Error(problems.join(' '));
    if (this.locks.has(key)) throw new Error('当前互动正在处理，请稍候。');
    this.locks.add(key);
    try {
      signal?.throwIfAborted();
      const signature=JSON.stringify(plan); const existing=this.states.get(key);
      if (existing && existing.signature !== signature && event.type !== 'restart') throw new Error('互动配置已修改，请输入“重新开始”应用新配置。');
      if (existing?.state.seen.includes(event.id)) return this.result(existing.state,event,true);
      if (!existing && event.type !== 'message' && event.type !== 'restart') throw new Error('请先输入“开始”启动互动。');
      // Work on a copy: model failures/cancellation cannot spend a clue or advance a chapter.
      let s: SessionState;
      const content = async (index: number, rewards: string[], history: string[]) => {
        const step=plan.steps[index];
        const c=plan.mode === 'authored' ? structuredClone(step.content!) : await (generate ? generate(plan,step,[...rewards],signal,[...history]) : Promise.reject(new Error('未连接互动创作模型。')));
        validateStepAnswers(c,step); signal?.throwIfAborted(); return c;
      };
      if (!existing || event.type === 'restart') {
        s={revision:0,index:0,status:'waiting',content:await content(0,[],[]),solved:false,rewards:[],history:[],seen:[],reply:'',source:plan.mode==='live'?'live-model':'authored'};
        s.reply=visible(s)+'\n\n可以回答、要“提示”，或说“暂停”。旅程事件在这里通过“下一站”“到达了”模拟。';
      } else {
        s=structuredClone(existing.state);
        if (event.type === 'stop') { s.status=s.index===plan.steps.length-1?'completed':'stopped'; s.reply=s.status==='completed'?plan.ending:'本次互动已结束。输入“重新开始”可开启新一轮。'; }
        else if (s.status === 'completed' || s.status === 'stopped') s.reply='本次互动已结束。输入“重新开始”可开启新一轮。';
        else if (event.type === 'pause') { s.status='paused'; s.reply='已暂停，进度已保留。想继续时说“继续”。'; }
        else if (s.status === 'paused') {
          if (event.type === 'resume') { s.status='waiting'; s.reply='从这里继续：\n'+visible(s)+(s.solved?'\n这一题已完成，说“下一站”继续。':''); }
          else s.reply='当前已暂停。说“继续”后再接着玩。';
        } else {
          const step=plan.steps[s.index]; let advance=false; let nextIndex=s.index+1; let prefix='';
          if (event.type === 'skip') { advance=true; prefix='已跳过当前阶段。'; }
          else if (event.type === 'arrival') {
            // Arrival skips remaining optional games and unlocks the arrival follow-up, if configured.
            const arrivalIndex=plan.steps.findIndex((step,i)=>i>=s.index && step.waitFor==='arrival');
            nextIndex=arrivalIndex<0?plan.steps.length:arrivalIndex+1;
            advance=true; prefix='（模拟到达）';
          } else if (event.type === 'next') {
            if (step.waitFor === 'arrival') s.reply='这一阶段等待到达；测试时说“到达了”。';
            else if (step.waitFor === 'answer' && !s.solved) s.reply='这一题还没完成，可以回答、要“提示”，或说“跳过”。';
            else { advance=true; prefix='（模拟进入下一阶段）'; }
          } else if (event.type === 'resume') s.reply=visible(s)+(s.solved?'\n说“下一站”继续。':'');
          else if (step.waitFor === 'answer' && !s.solved) {
            if (event.text.trim() === '提示') s.reply=s.content.hint!;
            else if (s.content.answers!.some(a => normalizeAnswer(a) === normalizeAnswer(event.text))) {
              s.solved=true;
              if (s.content.reward) s.rewards.push(s.content.reward);
              s.reply='答对了！'+(s.content.reward ? '\n获得：'+s.content.reward : '')+'\n准备好时说“下一站”。';
            } else s.reply='还没猜中，再试试。'+(s.content.hint ? '\n提示：'+s.content.hint : '');
          } else s.reply=step.waitFor === 'arrival' ? '等待到达。测试时说“到达了”。' : '准备好时说“下一站”，也可以暂停。';
          if (advance) {
            if (nextIndex >= plan.steps.length) { s.status='completed'; s.reply=prefix+'\n'+plan.ending; }
            else { const next=nextIndex; s.history.push([s.content.message,s.content.question].filter(Boolean).join('\n')); s.content=await content(next,s.rewards,s.history); s.index=next; s.solved=false; s.reply=prefix+'\n'+visible(s)+(plan.steps[next].waitFor==='arrival'?'\n测试时说“到达了”。':plan.steps[next].waitFor==='continue'?'\n准备好时说“下一站”。':''); }
          }
        }
      }
      signal?.throwIfAborted(); s.revision++; s.seen=[...s.seen,event.id];
      // Bounded session; never silently forget deduplication keys and replay an old event.
      if (s.seen.length > 1000) throw new Error('本轮互动已达 1000 次事件，请重新开始。');
      this.states.set(key,{signature,state:s});
      return {...this.result(s,event), finished: s.status === 'completed' && existing?.state.status !== 'completed'};
    } finally { this.locks.delete(key); }
  }
  private result(s: SessionState,event: SessionEvent,duplicate=false): SessionResult {
    const {content:_content,seen:_seen,history:_history,...safe}=s;
    return {reply:s.reply,session:structuredClone(safe),simulated:event.source==='simulated-chat',finished:false,...(duplicate?{duplicate:true}:{})};
  }
}

const projectSessions = new Map<string, ScenarioSessions>();
export function sessionsForProject(id: string): ScenarioSessions {
  let sessions=projectSessions.get(id);
  if (!sessions) { sessions=new ScenarioSessions(); projectSessions.set(id,sessions); }
  return sessions;
}
