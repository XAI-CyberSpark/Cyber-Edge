"""Allowlisted run metadata. Never forward SDK text, messages or reasoning."""
TOOLS = frozenset(('oakegde_route_turn','oakegde_capabilities','oakegde_read_graph','oakegde_brief',
    'oakegde_patch_graph','oakegde_test_plan','oakegde_inspect','oakegde_trial','oakegde_submit',
    'oakegde_delegate','oakegde_apply_artifact'))
REASONS = frozenset(('auth','auth_permanent','billing','rate_limit','upstream_rate_limit',
    'upstream_blocked','overloaded','server_error','timeout','ssl_cert_verification',
    'context_overflow','payload_too_large','image_too_large','image_corrupt','model_not_found',
    'provider_policy_blocked','content_policy_blocked','model_entitlement','incomplete_response',
    'format_error','role_alternation','invalid_encrypted_content','multimodal_tool_content_unsupported',
    'reasoning_mandatory','thinking_signature','long_context_tier',
    # Terminal loop codes in the pinned SDK agent/turn_failure_copy.py.
    'truncated','invalid_response','empty_response','loop_error','interpreter_shutdown','session_busy'))
FLAGS = ('completed','failed','partial','interrupted','failure_retryable')
REJECTION_CODES = frozenset(('argument_contract','tool_rejected','unknown_artifact_reference',
    'unknown_artifact','artifact_already_applied','architecture_not_applicable','brief_required',
    'architecture_required','graph_required','stale_revision','invalid_source_quote',
    'delegation_budget','completion_budget','incomplete_delivery'))
STAGES = frozenset(('intake','before_brief','building_graph','checking_graph','executing_graph',
    'reviewing_output','submitting'))
EXCEPTIONS = frozenset(('TimeoutError','ValueError','TypeError','KeyError','RuntimeError',
    'ConnectionError','HTTPException','APIConnectionError','APIStatusError','RateLimitError',
    'AuthenticationError','APITimeoutError','BadRequestError','InternalServerError','other'))

def tool_status(tool, result, session):
    """Public control metadata only; never include arguments or raw errors."""
    status={'tool':tool,'ok':'error' not in result,'revision':session.revision,
            'brief_registered':session.brief is not None}
    if 'error' not in result:return status
    run=result.get('run')
    if isinstance(run,dict):
        status['specialist_outcome']=sanitize_run_diagnostics(run.get('model_outcome'))
        if type(run.get('delivery_attempts')) is int:status['delivery_attempts']=run['delivery_attempts']
        feedback=run.get('delivery_feedback',{})
        if isinstance(feedback,dict) and feedback.get('error'):
            status['delivery_rejection_code']=tool_status(tool,feedback,session)['rejection_code']
    error=str(result.get('error',''))
    code='argument_contract' if 'argument_contracts' in result else 'tool_rejected'
    for prefix, name in (
        ('引用的成果不存在','unknown_artifact_reference'),('成果不存在','unknown_artifact'),
        ('成果已应用','artifact_already_applied'),('设计成果供搭建员参考','architecture_not_applicable'),
        ('先应用需求员成果','brief_required'),('先让设计员交付','architecture_required'),
        ('请先应用节点搭建员','graph_required'),('图已更新','stale_revision'),
        ('source_quote必须','invalid_source_quote'),('本轮委派预算','delegation_budget'),
        ('本轮共享编排预算','completion_budget'),('子Agent未交付','incomplete_delivery')):
        if error.startswith(prefix):code=name;break
    status['rejection_code']=code
    return status

def sanitize_run_diagnostics(value):
    """Revalidate worker metadata before crossing the public API boundary."""
    if not isinstance(value,dict):return {}
    result={}
    for key in FLAGS+('brief_registered','last_tool_ok'):
        if type(value.get(key)) is bool:result[key]=value[key]
    for key in ('api_calls','tool_calls','failed_tool_calls','revision','node_count','completion_attempts','normalizations','call_timeouts','status_revisions','patch_total','patch_rejected','overload_retries','truncation_retries'):
        if type(value.get(key)) is int and 0<=value[key]<=1_000_000:result[key]=value[key]
    for key,allowed in [('failure_reason',REASONS),('last_tool',TOOLS),('stage',STAGES),
                        ('last_tool_error',{'argument_contract','tool_rejected'}),
                        ('termination',{'returned','exception','host_timeout'}),('exception_type',EXCEPTIONS)]:
        if isinstance(value.get(key),str) and value[key] in allowed:result[key]=value[key]
    if value.get('truncation_skip_reason') in ('retry_limit','call_budget','time_budget'):result['truncation_skip_reason']=value['truncation_skip_reason']
    return result

def run_diagnostics(outcome,session,exception=None):
    outcome=outcome if isinstance(outcome,dict) else {}
    result={k:outcome[k] for k in (*FLAGS,'api_calls','failure_reason') if k in outcome}
    result['termination']='exception' if exception is not None else 'returned'
    if exception is not None:
        name=type(exception).__name__
        result['exception_type']=name if name in EXCEPTIONS else 'other'
    trace=session.trace
    result.update(tool_calls=len(trace),failed_tool_calls=sum(c.get('ok') is False for c in trace),
                  revision=session.revision,node_count=len(session.project.nodes),brief_registered=session.brief is not None)
    stage='building_graph' if session.brief else 'before_brief'
    if trace:
        last=trace[-1];tool=last.get('tool');detail=last.get('result',{})
        result.update(last_tool=tool,last_tool_ok=last.get('ok'))
        if last.get('ok') is False:
            result['last_tool_error']='argument_contract' if 'argument_contracts' in detail else 'tool_rejected'
        if tool=='oakegde_inspect':stage='checking_graph'
        if tool=='oakegde_submit':stage='submitting'
        if tool=='oakegde_trial':
            stage='reviewing_output' if detail.get('status')=='passed' else 'executing_graph'
    result['stage']=stage
    return sanitize_run_diagnostics(result)


def public_failure_message(value):
    """Render only allowlisted observations, never raw provider text."""
    data=sanitize_run_diagnostics(value)
    stages={'intake':'需求讨论与意图确认','before_brief':'需求登记前','building_graph':'场景搭建',
            'checking_graph':'结构检查','executing_graph':'场景试跑','reviewing_output':'内容核验','submitting':'结果提交'}
    reasons={'auth':'模型鉴权失败','auth_permanent':'模型鉴权失败','billing':'模型账户额度不足',
             'rate_limit':'模型服务限流','upstream_rate_limit':'上游模型服务限流',
             'timeout':'模型响应超时','model_not_found':'配置的模型不可用',
             'model_entitlement':'当前账户无此模型权限','context_overflow':'对话超出模型上下文',
             'truncated':'模型输出被截断','empty_response':'模型返回空响应',
             'invalid_response':'模型响应格式无效','server_error':'模型服务异常'}
    message='本轮对话未完成，尚未进入场景构建。' if data.get('stage')=='intake' else '本轮场景编排未完成。'
    if data.get('stage') in stages:message+='停止阶段：'+stages[data['stage']]+'。'
    reason='本轮时间预算已用完' if data.get('termination')=='host_timeout' else reasons.get(data.get('failure_reason'))
    if reason:message+='原因：'+reason+'。'
    elif data.get('completed') is True:message+='智能体结束了回复，但未交付该阶段要求的结构化结果。'
    return message+'当前项目未被替换。'
