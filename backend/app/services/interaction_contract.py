"""Authoring-time checks; mirrored by Studio before running an interaction."""
def validate_interaction_plan(p):
    def text(v, maximum=3000): return isinstance(v,str) and bool(v.strip()) and len(v)<=maximum
    if not isinstance(p,dict) or p.get('mode') not in ('live','authored') or not text(p.get('premise'),4000) or not text(p.get('ending')):
        return ['请配置互动模式、场景背景和结束语。']
    if p['mode']=='live' and not text(p.get('model'),200): return ['实时创作需要配置模型。']
    steps=p.get('steps')
    if not isinstance(steps,list) or not 1<=len(steps)<=12: return ['请配置 1–12 个互动阶段。']
    ids=set()
    for s in steps:
        if not isinstance(s,dict) or not text(s.get('id'),80) or s['id'] in ids or not text(s.get('title'),100) or s.get('waitFor') not in ('answer','continue','arrival'): return ['阶段需要唯一 ID、标题和有效等待事件。']
        ids.add(s['id'])
        if 'fixedQuestion' in s and (s['waitFor']!='answer' or not text(s['fixedQuestion'],1000) or not s.get('acceptedAnswers')): return ['固定题面需要问答阶段和固定答案。']
        if 'hideAnswerInOpening' in s and not isinstance(s['hideAnswerInOpening'],bool): return ['隐藏谜底配置必须为布尔值。']
        if s.get('hideAnswerInOpening') and not s.get('acceptedAnswers'): return ['隐藏谜底检查需要固定答案。']
        if 'acceptedAnswers' in s and (s['waitFor']!='answer' or not isinstance(s['acceptedAnswers'],list) or not 1<=len(s['acceptedAnswers'])<=12 or any(not text(a,100) for a in s['acceptedAnswers'])): return ['固定答案需要 1–12 个简短答案，且仅用于问答阶段。']
        if p['mode']=='live':
            if not text(s.get('brief'),2000): return ['实时创作的每个阶段需要创作要求。']
        else:
            c=s.get('content')
            if not isinstance(c,dict) or not text(c.get('message')) or set(c)-{'message','question','answers','hint','reward'}: return ['互动内容格式无效。']
            if any(k in c and not text(c[k],1000) for k in ('question','hint','reward')): return ['互动文字字段无效。']
            answers=c.get('answers')
            if 'answers' in c and (not isinstance(answers,list) or not 1<=len(answers)<=12 or any(not text(a,100) for a in answers)): return ['答案必须是简短有效文字列表。']
            if s['waitFor']=='answer' and (not text(c.get('question')) or not answers or not text(c.get('hint'))): return ['问答阶段必须有问题、答案和提示。']
            if s['waitFor']!='answer' and ('question' in c or 'answers' in c): return ['非问答阶段不能配置需要回答的问题。']
    return []
