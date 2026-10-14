"""Local capability recall and contract projection; never grants execution rights.

The registry and an explicitly supplied connection snapshot are the facts. All
public results use JSON values, so the same snapshots can be logged or passed to
the planning stage without a database server, remote call, or persistent user state.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import sqlite3
import statistics
import threading
from collections import OrderedDict
from typing import NotRequired, TypedDict

from app.services.hmi_control_contract import CONTROLS


class CapabilitySummary(TypedDict):
    id: str
    node_type: str
    operation: str | None
    purpose: str
    inputs: object
    outputs: object
    source: str
    limits: list
    known: bool
    facts: dict
    contract_hash: NotRequired[str]
    document_hash: str
    semantic_text: str
    server_id: NotRequired[str]
    tool_name: NotRequired[str]


class RecallResult(TypedDict):
    candidates: list
    node_overview: list
    capability_overview: list
    coverage_policy: str
    coverage_rule: str
    index_hash: str
    diagnostics: list
    fallback: bool
    strategy: str
    retrieval_status: str
    semantic_status: str
    embedding_metadata: dict | None
    selection_policy: dict


class CapabilityView(TypedDict):
    catalog: dict
    selected_ids: list
    dependencies: list
    facts: dict
    diagnostics: list
    index_hash: str
    mcp_connections: list
    selection_incomplete: bool


_DEFAULT_EMBEDDING = object()
_VECTOR_CACHE = OrderedDict()
_VECTOR_CACHE_LOCK = threading.RLock()
_VECTOR_CACHE_LIMIT = 4096
_VECTOR_CACHE_WAIT_SECONDS = 30
_RRF_OFFSET = 60


class _EmbeddingCacheBusy(TimeoutError):
    code = 'embedding_cache_busy'


def get_embedding_provider():
    # Lazy import/loading keeps catalog projection usable without model files.
    from app.services.capability_embeddings import get_embedding_provider as factory
    return factory()


def _hash(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def _records(snapshot):
    return snapshot or []


def _hmi_controls(catalog):
    # Existing callers use either the top-level authoring view or node registry.
    return catalog.get('hmi_controls', catalog.get('nodes', {}).get('car_control', {}).get('hmi_controls', {}))


def _node_facts(node):
    return {'create_allowed': node.get('generatable'), 'existing_readable': True,
            'execution_source': node.get('source', 'unknown'),
            'configured': None, 'trial_authorized': None}


def _summary(id, kind, operation, purpose, node, contract, *, facts=None, known=True, limits=None, semantic_text=None):
    result = {'id': id, 'node_type': kind, 'operation': operation, 'purpose': (purpose or 'unknown')[:120],
            'inputs': copy.deepcopy(node.get('inputs', 'unknown'))[:50],
            'outputs': copy.deepcopy(node.get('outputs', 'unknown'))[:50],
            'source': (facts or {}).get('execution_source', node.get('source', 'unknown')),
            'limits': copy.deepcopy(limits or []), 'known': known,
            'facts': copy.deepcopy(facts if facts is not None else _node_facts(node))}
    # Permissions and availability remain current facts, outside vector keys.
    static_contract = {key: value for key, value in contract.items()
                       if key not in ('generatable', 'allow_trials', 'execution_authorized', 'available', 'configured')}
    result['semantic_text'] = (semantic_text if semantic_text is not None else _semantic_text(result)) if known else ''
    result['document_hash'] = _hash({'id': id, 'text': result['semantic_text'], 'contract': static_contract})
    # Index hashes still track all current contracts and permission facts.
    if id.startswith(('node:', 'mcp:')):
        result['contract_hash'] = _hash(contract)
    return result


def _operation_contract(node, name):
    # Sibling purpose/control changes do not invalidate an unchanged operation.
    # Shared protocol/field changes still invalidate every affected operation.
    return {'operation': name, 'node': {key: value for key, value in node.items()
                                      if key not in ('generatable', 'action_summaries', 'operation_summaries', 'hmi_controls')}}


def _node_semantics(node):
    descriptions = [node.get(key) for key in ('name', 'summary', 'description')]
    descriptions.extend(' '.join(str(field.get(key) or '') for key in ('label', 'description'))
                        for field in node.get('fields', {}).values())
    return '\n'.join(str(text) for text in descriptions if text)


def _schema_semantics(schema):
    """Index parameter meanings, never example/default values or credentials."""
    if not isinstance(schema, dict):
        return ''
    descriptions = [schema.get(key) for key in ('title', 'description')]
    for name, spec in schema.get('properties', {}).items():
        if name.lower() in ('apikey', 'api_key', 'password', 'token', 'credentials', 'authorization', 'headers', 'env'):
            continue
        meaning = _schema_semantics(spec)
        if meaning:
            descriptions.append(name + ': ' + meaning)
    if isinstance(schema.get('items'), dict):
        descriptions.append(_schema_semantics(schema['items']))
    return '\n'.join(str(text) for text in descriptions if text)


def capability_index(catalog, connection_snapshot) -> list[CapabilitySummary]:
    """Build a short discovery index from registered identities, not name guesses."""
    result = []
    nodes = catalog.get('nodes', {})
    for kind, node in nodes.items():
        result.append(_summary('node:' + kind, kind, None, node.get('summary') or node.get('name'), node, node,
                               limits=[] if node.get('generatable') else ['existing_only'], semantic_text=_node_semantics(node)))
    car = nodes.get('car_control', {})
    for name in car.get('fields', {}).get('action', {}).get('enum', []):
        # Discovery is an identity/short-purpose view. Full protocol paragraphs
        # are loaded by resolve_selection, never repeated for every enum value.
        purpose = car.get('action_summaries', {}).get(name) or car.get('name', 'unknown') + ': ' + name
        result.append(_summary('action:' + name, 'car_control', name, purpose, car,
                               _operation_contract(car, name), limits=['simulation_only']))
    tool = nodes.get('tool', {})
    for name in tool.get('fields', {}).get('tool_id', {}).get('enum', []):
        if name == 'mcp':
            continue
        result.append(_summary('action:' + name, 'tool', name, tool.get('operation_summaries', {}).get(name),
                               tool, _operation_contract(tool, name), limits=['interface_simulation_only']))
    for name, contract in _hmi_controls(catalog).items():
        # Labels are canonical HMI metadata; no purpose inference from ac/seat IDs.
        label = contract.get('label') or CONTROLS.get(name, {}).get('label')
        hmi_io = {'source': car.get('source'), 'generatable': car.get('generatable'),
                  'inputs': 'controlValue: ' + contract.get('type', 'unknown'),
                  'outputs': 'action_result.actual: ' + contract.get('type', 'unknown')}
        result.append(_summary('hmi:' + name, 'car_control', name, label, hmi_io, contract,
                               known=bool(label), limits=['shared_hmi_simulation_only'],
                               semantic_text='\n'.join(str(value) for value in
                                   (label, contract.get('description'), *contract.get('options', {}).values()) if value)))
    for server in _records(connection_snapshot):
        for tool in server.get('tools', []):
            name = tool.get('name')
            if not name:
                continue
            description = tool.get('description') or tool.get('title')
            facts = {'create_allowed': tool.get('execution_authorized', True), 'existing_readable': None,
                     'execution_source': 'mcp', 'configured': server.get('configured'),
                     'trial_authorized': tool.get('allow_trials'), 'connection_available': server.get('available')}
            safe_contract = {key: copy.deepcopy(tool[key]) for key in ('name', 'description', 'title', 'input_schema', 'inputSchema', 'allow_trials', 'execution_authorized') if key in tool}
            safe_contract['available'] = server.get('available')
            summary = _summary(f"mcp:{server['server_id']}/{name}", 'tool', name, description, nodes.get('tool', {}),
                                   safe_contract, facts=facts, known=bool(description),
                                   limits=['registered_binding_only', 'independent_trial_permission'],
                                   semantic_text='\n'.join(value for value in
                                       (description, _schema_semantics(tool.get('input_schema', tool.get('inputSchema')))) if value))
            summary.update(server_id=server['server_id'], tool_name=name)
            result.append(summary)
    return result


def _tokens(text):
    """Identical pre-tokenization for FTS documents and safe OR queries.

    Chinese bigrams cover ordinary phrases; single characters support short
    words such as 关窗. English identifiers also retain their components.
    """
    tokens = []
    for run in re.findall(r'[\u3400-\u9fff]+|[A-Za-z0-9_]+', str(text)):
        if '\u3400' <= run[0] <= '\u9fff':
            tokens.extend('zh2' + run[i:i + 2] for i in range(len(run) - 1))
            tokens.extend('zh1' + char for char in run)
        else:
            tokens.append(run.lower())
            tokens.extend(part.lower() for part in re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\b)|[0-9]+', run.replace('_', ' ')))
    return list(dict.fromkeys(tokens))


def _document(summary):
    return ' '.join(str(summary.get(key, '')) for key in ('id', 'purpose', 'inputs', 'outputs', 'semantic_text'))


def _semantic_text(summary):
    # An opaque MCP name cannot supply a missing purpose. Exact binding recall
    # remains available through its ID in the lexical document.
    if not summary.get('known', True):
        return ''
    return summary.get('semantic_text', summary.get('purpose', 'unknown'))


def _query_parts(query):
    # Split independently meaningful clauses before the model's token limit.
    # No query/history text is persisted or cached.
    parts = []
    for clause in re.split(r'[\n。！？!?；;]+', str(query)):
        clause = clause.strip()
        parts.extend(clause[start:start + 400] for start in range(0, len(clause), 400))
    return list(dict.fromkeys(parts))


def _lexical_evidence(query_tokens, terms, purpose):
    terms = set(terms)
    purpose_terms = set(_tokens(purpose))
    for token in query_tokens:
        if token.startswith('zh2'):
            # Non-adjacent short-word recall belongs to the actual purpose;
            # unrelated characters scattered through a long schema are weak.
            if token in terms or all('zh1' + char in purpose_terms for char in token[3:]):
                return True
        elif not token.startswith('zh1') and token in terms:
            return True
    return bool(query_tokens) and all(token.startswith('zh1') and token in terms for token in query_tokens)


def _unit_vector(vector, dimension):
    if not isinstance(vector, (list, tuple)) or len(vector) != dimension:
        raise ValueError('invalid_embedding_dimension')
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector):
        raise ValueError('invalid_embedding_value')
    norm = math.sqrt(sum(value * value for value in vector))
    if not math.isfinite(norm) or norm <= 0:
        raise ValueError('invalid_embedding_norm')
    return tuple(value / norm for value in vector)


def _semantic_scores(provider, index, query):
    metadata = copy.deepcopy(provider.metadata)
    dimension = metadata.get('dimension')
    if not isinstance(dimension, int) or dimension <= 0 or not provider.fingerprint:
        raise ValueError('invalid_embedding_metadata')
    documents = sorted((item for item in index if item.get('known', True)), key=lambda item: item['id'])
    texts = {item['id']: _semantic_text(item) for item in documents}
    keys = {item['id']: (provider.fingerprint, item.get('document_hash') or _hash({'id': item['id'], 'text': texts[item['id']]}))
            for item in documents}
    if not _VECTOR_CACHE_LOCK.acquire(timeout=_VECTOR_CACHE_WAIT_SECONDS):
        raise _EmbeddingCacheBusy()
    try:
        missing = [item for item in documents if keys[item['id']] not in _VECTOR_CACHE]
        if missing:
            vectors = provider.embed_documents([texts[item['id']] for item in missing])
            if not isinstance(vectors, (list, tuple)) or len(vectors) != len(missing):
                raise ValueError('invalid_embedding_batch')
            normalized = [_unit_vector(vector, dimension) for vector in vectors]
            for item, vector in zip(missing, normalized):
                _VECTOR_CACHE[keys[item['id']]] = vector
        vectors = {item['id']: _VECTOR_CACHE[keys[item['id']]] for item in documents}
        for key in keys.values():
            _VECTOR_CACHE.move_to_end(key)
        while len(_VECTOR_CACHE) > _VECTOR_CACHE_LIMIT:
            _VECTOR_CACHE.popitem(last=False)
    finally:
        _VECTOR_CACHE_LOCK.release()
    query_vectors = [_unit_vector(provider.embed_query(part), dimension) for part in _query_parts(query)]
    scores = {id: max((sum(a * b for a, b in zip(vector, q)) for q in query_vectors), default=0.0)
              for id, vector in vectors.items()}
    return scores, metadata


def _rank_positions(scores, *, reverse=False):
    ordered = sorted(scores, key=lambda id: ((-scores[id] if reverse else scores[id]), id))
    ranks, previous, position = {}, None, 0
    for i, id in enumerate(ordered, 1):
        score = scores[id]
        if previous is None or not math.isclose(score, previous, rel_tol=1e-9, abs_tol=1e-12):
            position = i
        ranks[id], previous = position, score
    return ranks


def search_capabilities(query, index_snapshot, required_refs, *, embedding_provider=_DEFAULT_EMBEDDING,
                        lexical_enabled=True, min_score=0.35, top_k=32) -> RecallResult:
    """Fuse local BM25 and semantic ranks; scores never grant capability rights."""
    if (isinstance(min_score, bool) or not isinstance(min_score, (int, float)) or
            not 0 <= min_score <= 1 or not math.isfinite(min_score) or
            isinstance(top_k, bool) or not isinstance(top_k, int) or top_k <= 0):
        raise ValueError('invalid_recall_selection_policy')
    index = list(index_snapshot)
    by_id = {summary['id']: summary for summary in index}
    index_hash = _hash(index)
    diagnostics, lexical_scores, dense_scores = [], {}, {}
    exact_ids = sorted(id for id in by_id if re.search(r'(?<![A-Za-z0-9_:./-])' + re.escape(id) + r'(?![A-Za-z0-9_./-])', str(query)))
    query_tokens = _tokens(query)
    documents = [(item['id'], _tokens(_document(item))) for item in index]
    document_terms = dict(documents)
    lexical_available = bool(lexical_enabled)
    connection = None
    if lexical_enabled:
        try:
            connection = sqlite3.connect(':memory:')
            connection.execute('CREATE VIRTUAL TABLE capabilities USING fts5(capability_id UNINDEXED, terms)')
            connection.executemany('INSERT INTO capabilities VALUES (?, ?)', [(id, ' '.join(terms)) for id, terms in documents])
            if query_tokens:
                # Never interpret user punctuation/boolean syntax as MATCH grammar.
                match = ' OR '.join('"' + token.replace('"', '""') + '"' for token in query_tokens)
                lexical_scores = {id: score for id, score in connection.execute(
                    'SELECT capability_id, bm25(capabilities) FROM capabilities WHERE capabilities MATCH ?', (match,))
                    if _lexical_evidence(query_tokens, document_terms[id], by_id[id].get('purpose', ''))}
        except sqlite3.Error:
            lexical_available = False
            diagnostics.append({'code': 'lexical_recall_unavailable', 'status': 'degraded'})
        finally:
            if connection is not None:
                connection.close()
    semantic_status, embedding_metadata = 'disabled', None
    if embedding_provider is not None:
        try:
            provider = get_embedding_provider() if embedding_provider is _DEFAULT_EMBEDDING else embedding_provider
            dense_scores, embedding_metadata = _semantic_scores(provider, index, query)
            semantic_status = 'available'
        except Exception as exc:
            semantic_status = 'unavailable'
            diagnostics.append({'code': 'semantic_recall_unavailable', 'status': 'degraded',
                                'reason': getattr(exc, 'code', 'invalid_vectors' if isinstance(exc, ValueError) else 'provider_failure')})
    # Use within-query contrast rather than a model-dependent absolute cosine
    # threshold. A flat dense response alone supplies no ranking evidence.
    dense_evidence = {}
    if dense_scores:
        median, best = statistics.median(dense_scores.values()), max(dense_scores.values())
        if best > 0 and best - median > 1e-8:
            dense_evidence = {id: score for id, score in dense_scores.items() if score > median + 1e-8}
        elif best > 0 and lexical_scores:
            dense_evidence = {id: score for id, score in dense_scores.items() if id in lexical_scores}
    lexical_ranks = _rank_positions(lexical_scores)
    semantic_ranks = _rank_positions(dense_evidence, reverse=True)
    fused = {id: (1 / (_RRF_OFFSET + lexical_ranks[id]) if id in lexical_ranks else 0) +
                 (1 / (_RRF_OFFSET + semantic_ranks[id]) if id in semantic_ranks else 0)
             for id in set(lexical_ranks) | set(semantic_ranks)}
    ranks = sorted(fused, key=lambda id: (-fused[id], id))
    # This is relative ranking strength inside one query, not a probability
    # of semantic relevance. Weak queries can also have a best score of 1.
    best_score = max(fused.values(), default=0)
    normalized_scores = {id: score / best_score for id, score in fused.items()} if best_score else {}
    fallback = ((not lexical_available and semantic_status in ('disabled', 'unavailable')) or
                (not exact_ids and not fused))
    if fallback:
        diagnostics.append({'code': 'recall_no_evidence', 'status': 'selection_incomplete'})
    retrieval_status = ('degraded' if (lexical_enabled and not lexical_available) or semantic_status == 'unavailable' else
                        'lexical_only' if semantic_status == 'disabled' and lexical_enabled else
                        'disabled' if semantic_status == 'disabled' else
                        'semantic_only' if not lexical_enabled else 'hybrid')

    def candidate(id, rank):
        item = copy.deepcopy(by_id[id])
        item.pop('semantic_text', None)
        item.pop('document_hash', None)
        source = ('exact_id' if id in exact_ids else 'required_ref' if id in (required_refs or []) else
                  'hybrid_rrf' if id in lexical_ranks and id in semantic_ranks else
                  'semantic' if id in semantic_ranks else 'fts5_bm25')
        item.update(rank=rank, score=fused.get(id), normalized_score=normalized_scores.get(id), recall_source=source)
        if id in lexical_scores:
            item['lexical_score'] = lexical_scores[id]
        if id in dense_scores:
            item['semantic_score'] = dense_scores[id]
        return item

    selected = list(exact_ids)
    forced_ids = list(dict.fromkeys(exact_ids + [id for id in required_refs or [] if id in by_id]))
    ordinary_count = 0
    for id in ranks:
        if id in selected:
            continue
        if id in forced_ids:
            selected.append(id)
        elif normalized_scores[id] >= min_score and ordinary_count < top_k:
            selected.append(id)
            ordinary_count += 1
    for id in required_refs or []:
        if id in by_id and id not in selected:
            selected.append(id)
        elif id not in by_id:
            diagnostics.append({'code': 'required_reference_unknown', 'id': id, 'status': 'selection_incomplete'})
    candidates = [candidate(id, i + 1) for i, id in enumerate(selected)]
    overview = [{key: copy.deepcopy(item[key]) for key in ('id', 'node_type', 'purpose', 'source', 'facts')} for item in index if item['id'].startswith('node:')]
    # Ranking controls loading priority only. Its threshold/Top-K cutoffs must
    # never hide a registered identity from the planner's discovery view.
    complete_overview = [{key: copy.deepcopy(item[key]) for key in
                          ('id', 'node_type', 'purpose', 'source', 'facts', 'known', 'limits')}
                         for item in index]
    return {'candidates': candidates, 'node_overview': overview, 'index_hash': index_hash,
            'capability_overview': complete_overview, 'coverage_policy': 'complete_registry_overview_v1',
            'coverage_rule': 'capability_overview是完整已登记能力短目录；candidates仅为优先列表。'
                             '未进入优先列表不表示能力缺失；按需求从完整目录选ID，再加载契约并核对权限/来源。',
            'selection_policy': {'type': 'relative_rrf_threshold_top_k_v1', 'min_score': min_score, 'top_k': top_k,
                                 'score_normalization': 'relative_to_best_rrf', 'forced_ids': forced_ids},
            'diagnostics': diagnostics, 'fallback': fallback, 'strategy': 'bm25_embedding_rrf_v2',
            'retrieval_status': retrieval_status, 'semantic_status': semantic_status, 'embedding_metadata': embedding_metadata}


def project_required_refs(project):
    """Preserve identities used by the full project, including old node kinds."""
    if hasattr(project, 'model_dump'):
        project = project.model_dump()
    refs = []
    for node in (project or {}).get('nodes', []):
        kind, data = node.get('type'), node.get('data') or {}
        if kind:
            refs.append('node:' + kind)
        if kind == 'car_control':
            if data.get('executionMode') == 'hmi' and data.get('controlId'):
                refs.append('hmi:' + data['controlId'])
            elif data.get('action'):
                refs.append('action:' + data['action'])
        if kind == 'tool':
            if data.get('tool_id', data.get('tool')) == 'mcp' and data.get('serverId') and data.get('toolName'):
                refs.append(f"mcp:{data['serverId']}/{data['toolName']}")
            elif data.get('tool_id', data.get('tool')):
                refs.append('action:' + data.get('tool_id', data.get('tool')))
    return list(dict.fromkeys(refs))


def _selection_ids(selection):
    if isinstance(selection, list):
        return list(dict.fromkeys(selection)), {}
    requirement_map = {}
    for item in (selection or {}).get('requirements', []):
        for id in item.get('capability_ids', []):
            requirement_map.setdefault(id, []).append(item.get('requirement_id'))
    return list(requirement_map), requirement_map


def resolve_selection(selection, catalog, project, connection_snapshot) -> CapabilityView:
    """Load selected complete contracts and explicit protocol dependencies only."""
    index = capability_index(catalog, connection_snapshot)
    by_id = {item['id']: item for item in index}
    selected, requirements = _selection_ids(selection)
    existing = project_required_refs(project)
    dependencies, diagnostics = [], []
    def add(id, reason):
        if id not in selected:
            selected.append(id)
            dependencies.append({'id': id, 'reason': reason})
    for id in existing:
        add(id, 'existing_project_reference')
    for id in list(selected):
        if id in by_id and not id.startswith('node:'):
            add('node:' + by_id[id]['node_type'], 'operation_node_contract')
    facts = {id: copy.deepcopy(by_id[id]['facts']) for id in selected if id in by_id}
    for id in selected:
        if id not in by_id:
            diagnostics.append({'code': 'unknown_capability_id', 'id': id, 'requirement_ids': requirements.get(id, []), 'status': 'selection_incomplete'})
            continue
        item = by_id[id]
        if facts[id]['create_allowed'] is False and id not in existing:
            diagnostics.append({'code': 'creation_disallowed', 'id': id, 'status': 'selection_incomplete'})
        if not item['known']:
            diagnostics.append({'code': 'purpose_unknown', 'id': id, 'status': 'selection_incomplete'})
        if id.startswith('mcp:'):
            if facts[id]['configured'] is False:
                diagnostics.append({'code': 'connection_not_configured', 'id': id, 'status': 'needs_input'})
            if facts[id]['trial_authorized'] is False:
                diagnostics.append({'code': 'trial_not_authorized', 'id': id, 'status': 'needs_input'})
    if isinstance(selection, dict) and selection.get('unresolved'):
        diagnostics.append({'code': 'selection_unresolved', 'status': 'selection_incomplete', 'items': copy.deepcopy(selection['unresolved'])})
    kinds = {by_id[id]['node_type'] for id in selected if id in by_id}
    projected = {key: copy.deepcopy(value) for key, value in catalog.items() if key not in ('nodes', 'hmi_controls', 'connection_contract')}
    projected['nodes'] = {kind: copy.deepcopy(catalog['nodes'][kind]) for kind in catalog['nodes'] if kind in kinds}
    selected_controls = {id[4:] for id in selected if id.startswith('hmi:') and id in by_id}
    selected_actions = {id[7:] for id in selected if id.startswith('action:') and id in by_id}
    consumers = set()
    if 'tool' in kinds and 'node:tool' not in existing and not any(id.startswith('mcp:') and id in by_id for id in selected) and not any(by_id.get('action:' + name, {}).get('node_type') == 'tool' for name in selected_actions):
        diagnostics.append({'code': 'operation_selection_required', 'id': 'node:tool', 'status': 'selection_incomplete'})
    if 'car_control' in projected['nodes']:
        car = projected['nodes']['car_control']
        car['hmi_controls'] = {name: copy.deepcopy(spec) for name, spec in _hmi_controls(catalog).items() if name in selected_controls}
        families = set()
        if selected_controls:
            families.add('hmi'); consumers.add('hmi')
        if any(name.startswith('ambient_light.') for name in selected_actions):
            families.add('ambient'); consumers.add('ambient')
        if any(by_id.get('action:' + name, {}).get('node_type') == 'car_control' and not name.startswith('ambient_light.') for name in selected_actions):
            families.add('ordinary'); consumers.add('ordinary')
        if not families and 'node:car_control' not in existing:
            diagnostics.append({'code': 'operation_selection_required', 'id': 'node:car_control', 'status': 'selection_incomplete'})
        # Contracts are already extracted by the registry; never split prose.
        car['operation_contracts'] = {key: value for key, value in car.get('operation_contracts', {}).items() if key in families}
        car['description'] = ' '.join(car['operation_contracts'].values())
        car['action_summaries'] = {key: value for key, value in car.get('action_summaries', {}).items() if key in selected_actions}
        car['configuration_examples'] = [item for item in car.get('configuration_examples', [])
                                         if item.get('controlId') in selected_controls or item.get('action') in selected_actions]
        fields = car.get('fields', {})
        grouped_fields = {'device_type'}
        if 'ordinary' in families:
            grouped_fields.update(('action', 'parameter', 'module', 'signalKey', 'function', 'area', 'targetStatus'))
        if 'hmi' in families:
            grouped_fields.update(('executionMode', 'controlId', 'controlOperation', 'controlValue', 'valueField', 'module', 'signalKey', 'function', 'area', 'targetStatus', 'level'))
        if 'ambient' in families:
            grouped_fields.update(('executionMode', 'action', 'color', 'brightness', 'reason', 'poseTips', 'light_color', 'light_brightness', 'light_reason', 'pose_tips', 'module', 'signalKey', 'function'))
        if hasattr(project, 'model_dump'):
            project = project.model_dump()
        for node in (project or {}).get('nodes', []):
            if node.get('type') == 'car_control':
                grouped_fields.update((node.get('data') or {}).keys())
        car['fields'] = fields = {key: value for key, value in fields.items() if key in grouped_fields}
        if 'controlId' in fields:
            fields['controlId']['enum'] = list(car['hmi_controls'])
            fields['controlId']['example'] = next(iter(car['hmi_controls']), None)
        if 'action' in fields:
            action_enum = [name for name in fields['action'].get('enum', []) if name in selected_actions]
            # windows is the fixed node classification for canonical window actions.
            if any(name in selected_actions for name in ('windows.close_all', 'windows.open_all')) and 'windows' not in action_enum:
                action_enum.insert(0, 'windows')
            fields['action']['enum'] = action_enum
            fields['action']['example'] = next(iter(action_enum), None)
    if 'hmi_controls' in catalog:
        projected['hmi_controls'] = {name: copy.deepcopy(spec) for name, spec in _hmi_controls(catalog).items() if name in selected_controls}
    selected_connections = []
    for server in _records(connection_snapshot):
        tools = [copy.deepcopy(tool) for tool in server.get('tools', []) if f"mcp:{server['server_id']}/{tool.get('name')}" in selected]
        if not tools:
            continue
        consumers.add('mcp')
        record = {key: copy.deepcopy(server[key]) for key in ('server_id', 'name', 'description', 'configured', 'available', 'issue', 'discovery_elapsed_seconds') if key in server}
        record['tools'] = tools
        selected_connections.append(record)
        if server.get('available') is not True:
            code = 'connection_unavailable' if server.get('available') is False else 'discovery_required'
            diagnostics.append({'code': code, 'id': 'mcp:' + server['server_id'], 'status': 'selection_incomplete'})
        for tool in tools:
            if 'input_schema' not in tool and 'inputSchema' not in tool:
                diagnostics.append({'code': 'tool_contract_unloaded', 'id': f"mcp:{server['server_id']}/{tool['name']}", 'status': 'selection_incomplete'})
    if any(by_id.get('action:' + name, {}).get('node_type') == 'tool' for name in selected_actions):
        consumers.add('ordinary')
    connection = catalog.get('connection_contract', {})
    projected['connection_contract'] = {key: copy.deepcopy(value) for key, value in connection.items() if key not in ('producers', 'consumers')}
    projected['connection_contract']['consumers'] = {key: copy.deepcopy(value) for key, value in connection.get('consumers', {}).items() if key in consumers}
    # An explicit producer contract is protocol data, not an inserted llm node.
    projected['connection_contract']['producers'] = copy.deepcopy(connection.get('producers', {})) if consumers or 'llm' in kinds else {}
    projected['loaded_scope'] = {'selected_ids': list(selected), 'is_platform_catalog': False}
    return {'catalog': projected, 'selected_ids': selected, 'dependencies': dependencies,
            'facts': facts, 'diagnostics': diagnostics, 'index_hash': _hash(index),
            'mcp_connections': selected_connections,
            'selection_incomplete': any(item['status'] == 'selection_incomplete' for item in diagnostics)}
