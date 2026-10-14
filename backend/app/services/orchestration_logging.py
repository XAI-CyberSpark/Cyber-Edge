"""Content-free, bounded JSONL diagnostics for each authoring request."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import re
import threading
import time
from uuid import uuid4

from fastapi import HTTPException

from app.services import model_providers
from app.services.authoring_diagnostics import EXCEPTIONS, REJECTION_CODES, TOOLS, sanitize_run_diagnostics


LOG_PATH = Path(__file__).resolve().parents[3] / '.demo-runtime' / 'logs' / 'orchestration.jsonl'
MAX_BYTES = 5 * 1024 * 1024
BACKUP_COUNT = 3
RESULT_STATUSES = frozenset(('preview', 'needs_input', 'needs_changes', 'capability_gap', 'discussion'))
TOKEN_FIELDS = ('input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_hit_tokens',
                'cache_miss_tokens', 'cache_read_tokens', 'cache_write_tokens')
_LOGGER = logging.Logger('oakegde.orchestration', level=logging.INFO)
_LOCK = threading.RLock()


def safe_call_metadata(metadata):
    if not isinstance(metadata, dict): return {}
    safe = model_providers.safe_call_context(metadata)
    call_id = metadata.get('call_id')
    if isinstance(call_id, str) and re.fullmatch(r'[0-9a-f]{32}', call_id):
        safe['call_id'] = call_id
    for field in ('requested_max_tokens', 'duration_ms', 'input_uncached_tokens',
                  'input_tokens_lower_bound', *TOKEN_FIELDS):
        value = metadata.get(field)
        safe[field] = value if type(value) is int and value >= 0 else None
    reason = metadata.get('finish_reason')
    safe['finish_reason'] = reason if isinstance(reason, str) and reason in model_providers.FINISH_REASONS else 'other'
    code = metadata.get('failure_code')
    safe['failure_code'] = code if isinstance(code, str) and code in model_providers.FAILURE_CODES else None
    known = [safe[field] is not None for field in ('input_tokens', 'output_tokens')]
    safe['usage_status'] = 'known' if all(known) else ('partial' if any(known) else 'unknown')
    safe['cache_status'] = 'known' if any(safe[field] is not None for field in
        ('cache_hit_tokens', 'cache_miss_tokens', 'cache_write_tokens')) else 'unknown'
    return safe


def summarize_usage_records(records, *, available=True):
    """Sum known counts once per call; unknown calls retain a measured lower bound."""
    calls = {}
    for record in records:
        if not isinstance(record, dict) or record.get('event') not in ('model_call_started', 'model_completion'):
            continue
        safe = safe_call_metadata(record)
        call_id = safe.get('call_id')
        if call_id is None:
            available = False
            continue
        entry = calls.setdefault(call_id, {'started': False, 'completed': False,
                                           'call_scope': safe.get('call_scope', 'authoring')})
        if record['event'] == 'model_call_started': entry['started'] = True
        elif not entry['completed']:
            entry.update(safe, started=True, completed=True)

    def totals(entries):
        result = {'status': 'available' if available else 'unknown',
                  'calls_started': len(entries) if available else None,
                  'calls_completed': sum(entry['completed'] for entry in entries) if available else None}
        for field in TOKEN_FIELDS:
            measured = [entry.get(field) if entry.get(field) is not None else
                        (entry.get('input_tokens_lower_bound') if field == 'input_tokens' else None)
                        for entry in entries]
            known = sum(value for value in measured if type(value) is int)
            unknown = sum(entry.get(field) is None for entry in entries)
            result[field] = known if available and unknown == 0 else None
            result['known_' + field] = known
            result['unknown_' + field.removesuffix('_tokens') + '_calls'] = unknown if available else None
        return result
    entries = list(calls.values())
    result = totals(entries)
    result['by_scope'] = {scope: totals([entry for entry in entries if entry['call_scope'] == scope])
                          for scope in ('authoring', 'graph_inference')}
    return result


def combine_usage_summaries(summaries):
    """Combine request totals without converting an unknown amount into zero."""
    def totals(values):
        result = {'status': 'available' if all(v['status'] == 'available' for v in values) else 'unknown'}
        for field in ('calls_started', 'calls_completed', *TOKEN_FIELDS,
                      *('unknown_' + f.removesuffix('_tokens') + '_calls' for f in TOKEN_FIELDS)):
            result[field] = sum(v[field] for v in values) if all(v[field] is not None for v in values) else None
        for field in TOKEN_FIELDS:
            result['known_' + field] = sum(v['known_' + field] for v in values)
        return result
    result = totals(summaries)
    result['by_scope'] = {scope: totals([s['by_scope'][scope] for s in summaries])
                          for scope in ('authoring', 'graph_inference')}
    return result


class _LogHandler(RotatingFileHandler):
    def handleError(self, record):
        # Diagnostics must never interrupt authoring or print a failing write.
        pass


def _write(record):
    try:
        with _LOCK:
            path = LOG_PATH.resolve()
            if not _LOGGER.handlers or _LOGGER.handlers[0].baseFilename != str(path):
                for handler in list(_LOGGER.handlers):
                    _LOGGER.removeHandler(handler)
                    handler.close()
                path.parent.mkdir(parents=True, exist_ok=True)
                handler = _LogHandler(path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding='utf-8')
                handler.setFormatter(logging.Formatter('%(message)s'))
                _LOGGER.addHandler(handler)
            _LOGGER.info(json.dumps(record, ensure_ascii=False, separators=(',', ':')))
    except Exception:
        # Opening/rotating a log can fail independently of the business request.
        pass


class OrchestrationRunLog:
    def __init__(self, request):
        self.started = time.monotonic()
        self.fields = {
            'request_id': uuid4().hex, 'run_id': uuid4().hex,
            'engine': 'pending', 'provider': request.provider_id, 'model': None,
            'agent_mode': request.agent_mode, 'phase': 'initializing',
            'candidate_node_count': 0, 'can_apply': None, 'runtime_verified': None, 'result_status': None,
        }
        # Read identity without requiring credentials; this does not authorize a call.
        try:
            provider = model_providers.resolve(request.provider_id, request.model, require_key=False)
            if provider.id in model_providers.PROVIDERS:
                self.fields['provider'] = provider.id
                if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,149}', provider.model):
                    self.fields['model'] = provider.model
        except Exception:
            pass
        self.error = {}
        self._call_events = set()
        self.emit('started')

    def emit(self, event, **metadata):
        _write({**self.fields, **metadata, 'event': event,
                'timestamp': datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
                'elapsed_ms': round((time.monotonic() - self.started) * 1000)})

    def configure(self, engine, agent_mode=None):
        self.fields.update(engine=engine, agent_mode=agent_mode, phase='authoring')
        self.emit('engine_selected')

    def bounded(self, phase):
        if phase in ('planning', 'building_graph', 'checking_graph', 'executing_graph', 'reviewing_output'):
            self.fields['phase'] = phase
            self.emit('phase')

    def event(self, event, data):
        if event == 'result':
            nodes = (data.get('project') or {}).get('nodes')
            report = data.get('build_report') or {}
            calls = report.get('calls')
            for call in calls[:40] if isinstance(calls, list) else []:
                if not isinstance(call, dict): continue
                completions = call.get('completions')
                for metadata in completions[:2] if isinstance(completions, list) else []:
                    self.completion(metadata, call.get('stage'))
            raw_status = report.get('status')
            status = raw_status if isinstance(raw_status, str) and raw_status in RESULT_STATUSES else None
            self.fields['result_status'] = status
            self.fields['candidate_node_count'] = len(nodes) if isinstance(nodes, list) else 0
            for field in ('can_apply', 'runtime_verified'):
                self.fields[field] = report[field] if type(report.get(field)) is bool else None
            self.fields['phase'] = 'result'
            validation = data.get('validation') or {}
            rejected = (self.fields['engine'] != 'greeting' and (status == 'needs_changes' or
                        (status not in ('needs_input', 'capability_gap', 'discussion') and
                         (validation.get('passed') is False or
                          (status == 'preview' and report.get('can_apply') is False)))))
            if rejected:
                self.error = {'error_category': 'validation_rejected'}
        elif event == 'done':
            self.fields['phase'] = 'completed'
        self.emit(event if event in ('thinking', 'result', 'done') else 'other')

    def call(self, metadata):
        if not isinstance(metadata, dict) or metadata.get('event') not in ('started', 'completed'): return
        safe = safe_call_metadata(metadata)
        call_id = safe.get('call_id')
        if call_id is None: return
        event = metadata['event']
        key = (call_id, event)
        if key in self._call_events: return
        self._call_events.add(key)
        if event == 'started':
            safe = {field: value for field, value in safe.items() if field not in
                    (*TOKEN_FIELDS, 'finish_reason', 'failure_code', 'usage_status', 'cache_status', 'duration_ms')}
        if safe.get('stage'): safe['completion_stage'] = safe['stage']
        self.emit('model_call_started' if event == 'started' else 'model_completion', **safe)

    def completion(self, metadata, stage=None):
        if not isinstance(metadata, dict): return
        if safe_call_metadata(metadata).get('call_id'):
            self.call({**metadata, 'stage': metadata.get('stage', stage), 'event': 'completed'})
            return
        safe = {}
        if isinstance(stage, str) and stage in ('understand', 'select', 'build', 'repair', 'review'):
            safe['completion_stage'] = stage
        for field in ('requested_max_tokens', 'input_uncached_tokens', 'input_tokens_lower_bound', *TOKEN_FIELDS):
            if type(metadata.get(field)) is int and metadata[field] >= 0:
                safe[field] = metadata[field]
        reason = metadata.get('finish_reason')
        if isinstance(reason, str) and reason in model_providers.FINISH_REASONS:
            safe['finish_reason'] = reason
        code = metadata.get('failure_code')
        if isinstance(code, str) and code in model_providers.FAILURE_CODES:
            safe['failure_code'] = code
        self.emit('model_completion', **safe)

    def worker(self, message):
        kind, data = message.get('type'), message.get('data') or {}
        if kind == 'ready' and data.get('phase') in ('intake', 'authoring'):
            self.fields['phase'] = data['phase']
            self.emit('phase')
        elif kind == 'tool_status' and isinstance(data.get('tool'), str) and data['tool'] in TOOLS:
            tool = data['tool']
            self.fields['phase'] = {
                'oakegde_route_turn': 'intake', 'oakegde_brief': 'building_graph',
                'oakegde_patch_graph': 'building_graph', 'oakegde_inspect': 'checking_graph',
                'oakegde_trial': 'executing_graph', 'oakegde_submit': 'submitting',
            }.get(tool, self.fields['phase'])
            metadata = {'tool': tool}
            if type(data.get('ok')) is bool:
                metadata['ok'] = data['ok']
            if isinstance(data.get('rejection_code'), str) and data['rejection_code'] in REJECTION_CODES:
                metadata['rejection_code'] = data['rejection_code']
            self.emit('tool_status', **metadata)

    def failed(self, exception):
        name = type(exception).__name__
        self.error = {'exception_type': name if name in EXCEPTIONS else 'other',
                      'error_category': 'timeout' if isinstance(exception, TimeoutError) else 'contract_error'}
        termination = 'exception'
        code = getattr(exception, 'provider_failure_code', None)
        if isinstance(code, str) and code in model_providers.FAILURE_CODES:
            self.error['provider_failure_code'] = code
        completions = getattr(exception, 'provider_completions', None)
        if isinstance(completions, list):
            for metadata in completions[:2]: self.completion(metadata, getattr(exception, 'provider_stage', 'understand'))
        else:
            self.completion(getattr(exception, 'provider_completion_metadata', None))
        if isinstance(exception, HTTPException):
            self.error.update(http_status=exception.status_code, error_category={
                400: 'invalid_request', 422: 'invalid_request', 502: 'contract_error',
                503: 'unavailable'}.get(exception.status_code, 'http_error'))
            detail = exception.detail
            if isinstance(detail, dict):
                diagnostics = sanitize_run_diagnostics(detail.get('diagnostics'))
                if detail.get('code') == 'hermes_incomplete':
                    self.error['error_category'] = 'incomplete'
                if 'stage' in diagnostics:
                    self.fields['phase'] = diagnostics['stage']
                if 'node_count' in diagnostics:
                    self.fields['candidate_node_count'] = diagnostics['node_count']
                if 'failure_reason' in diagnostics:
                    self.error['failure_reason'] = diagnostics['failure_reason']
                termination = diagnostics.get('termination', termination)
        return termination

    def finish(self, termination):
        self.emit('terminal', **self.error, termination=termination)
