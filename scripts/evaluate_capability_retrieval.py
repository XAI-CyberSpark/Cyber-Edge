"""Offline fixed-gold retrieval evaluation. No authoring or tool execution calls."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).absolute().parents[1]


def _min_score(value):
    try:
        score = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError('min-score must be finite and between 0 and 1') from exc
    if not math.isfinite(score) or not 0 <= score <= 1:
        raise argparse.ArgumentTypeError('min-score must be finite and between 0 and 1')
    return score


def _top_k(value):
    try:
        count = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError('top-k must be a positive integer') from exc
    if count <= 0:
        raise argparse.ArgumentTypeError('top-k must be a positive integer')
    return count


def evaluate_case(case, result, elapsed_ms):
    ids = [item['id'] for item in result['candidates']]
    policy = result.get('selection_policy')
    normalized_scores = {item['id']: item.get('normalized_score') for item in result['candidates']}
    forced_ids = [id for id in policy.get('forced_ids', []) if id in ids] if policy else []
    ordinary_ids = [id for id in ids if id not in forced_ids]
    threshold, top_k = (policy['min_score'], policy['top_k']) if policy else (None, None)
    visible_ids = set(ids) | {item['id'] for item in result.get('node_overview', [])} | {
        item['id'] for item in result.get('capability_overview', [])}
    units = [{id} for id in case.get('required_ids', [])]
    units += [set(group) for group in case.get('acceptable_groups', [])]
    first_ranks = [next((rank for rank, id in enumerate(ids, 1) if id in unit), None) for unit in units]
    hits = sum(rank is not None for rank in first_ranks)
    visible_hits = sum(bool(unit & visible_ids) for unit in units)
    expected = case.get('expected_retrieval', {})
    candidate_limit = expected.get('max_candidates')
    row = {'id': case.get('id'), 'split': case.get('split'), 'gold_units': len(units), 'hit_units': hits,
           'relevance_case': bool(units) and expected.get('known_task', True),
           'recall': hits / len(units) if units else None,
           'all_required_recalled': visible_hits == len(units) if units else None,
           'ranked_all_required_recalled': hits == len(units) if units else None,
           'available_hit_units': visible_hits,
           'available_capability_count': len(visible_ids),
           'availability_characters': len(json.dumps({key: result.get(key, []) for key in
                ('candidates', 'node_overview', 'capability_overview')}, ensure_ascii=False)),
           'mrr': 1 / min(rank for rank in first_ranks if rank) if hits else 0 if units else None,
           'candidate_count': len(ids), 'candidate_characters': len(json.dumps(result['candidates'], ensure_ascii=False)),
           'elapsed_ms': elapsed_ms, 'fallback': result.get('fallback', False),
           'retrieval_status': result.get('retrieval_status', 'baseline'),
           'semantic_status': result.get('semantic_status'),
           'required_refs_preserved': all(id in ids for id in case.get('required_refs', [])),
           'candidate_budget_met': candidate_limit is None or len(ids) <= candidate_limit,
           'candidate_budget_scope': 'historical_gold_max_candidates',
           'selection_policy': policy,
           'candidate_normalized_scores': normalized_scores,
           'forced_required_ref_ids': [id for id in forced_ids if id in case.get('required_refs', [])],
           'exact_id_ids': [item['id'] for item in result['candidates'] if item.get('recall_source') == 'exact_id'],
           'threshold_exempt_ids': [id for id in forced_ids if normalized_scores[id] is None or normalized_scores[id] < threshold],
           'top_k_exempt_ids': forced_ids,
           'ordinary_candidate_count': len(ordinary_ids),
           'ordinary_top_k_met': len(ordinary_ids) <= top_k if policy else None,
           'ordinary_threshold_met': all(normalized_scores[id] is not None and normalized_scores[id] >= threshold
                                         for id in ordinary_ids) if policy else None,
           'candidate_count_above_top_k': max(0, len(ids) - top_k) if policy else None,
           'missing_units': [sorted(unit) for unit, rank in zip(units, first_ranks) if rank is None],
           'unavailable_units': [sorted(unit) for unit in units if not unit & visible_ids],
           'candidate_ids': ids, 'diagnostics': result.get('diagnostics', []),
           'index_hash': result.get('index_hash'), 'strategy': result.get('strategy')}
    for k in (1, 5, 10, 20):
        row[f'recall_at_{k}'] = sum(rank is not None and rank <= k for rank in first_ranks) / len(units) if units else None
    dcg = sum(1 / math.log2(rank + 1) for rank in first_ranks if rank is not None and rank <= 10)
    ideal = sum(1 / math.log2(rank + 1) for rank in range(1, min(len(units), 10) + 1))
    row['ndcg_at_10'] = dcg / ideal if ideal else None
    return row


def aggregate(rows):
    relevant = [row for row in rows if row['relevance_case']]
    mean = lambda key: statistics.mean(row[key] for row in relevant) if relevant else None
    latency = sorted(row['elapsed_ms'] for row in rows)
    complete_rate = mean('all_required_recalled')
    return {'cases': len(rows), 'relevance_cases': len(relevant),
            'availability_gate': {'metric': 'all_required_rate', 'target': .999, 'observed': complete_rate,
                                  'scope': 'all planning-visible capabilities; ranking alone is diagnostic',
                                  'known_tasks': len(relevant),
                                  'sample_passed': bool(relevant) and complete_rate >= .999,
                                  'population_target_validated': False},
            'mean_recall': mean('recall'), 'all_required_rate': mean('all_required_recalled'),
            'ranked_all_required_rate': mean('ranked_all_required_recalled'),
            'micro_recall': sum(row['hit_units'] for row in relevant) / sum(row['gold_units'] for row in relevant) if relevant else None,
            'mrr': mean('mrr'), 'ndcg_at_10': mean('ndcg_at_10'),
            **{f'mean_recall_at_{k}': mean(f'recall_at_{k}') for k in (1, 5, 10, 20)},
            'fallback_rate': statistics.mean(row['fallback'] for row in rows) if rows else None,
            'mean_candidates': statistics.mean(row['candidate_count'] for row in rows) if rows else None,
            'mean_available_capabilities': statistics.mean(row['available_capability_count'] for row in rows) if rows else None,
            'mean_availability_characters': statistics.mean(row['availability_characters'] for row in rows) if rows else None,
            'mean_candidate_characters': statistics.mean(row['candidate_characters'] for row in rows) if rows else None,
            'candidate_budget_rate': statistics.mean(row['candidate_budget_met'] for row in rows) if rows else None,
            'candidate_budget_scope': 'historical_gold_max_candidates',
            'required_refs_preserved': all(row['required_refs_preserved'] for row in rows),
            'latency_median_ms': statistics.median(latency) if rows else None,
            'latency_p95_ms': latency[math.ceil(len(latency) * .95) - 1] if rows else None,
            'degraded_cases': sum(row['retrieval_status'] == 'degraded' for row in rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=ROOT / 'benchmarks/retrieval/capability-retrieval-v1.json')
    parser.add_argument('--output', type=Path, required=True, help='New result JSON; existing evidence is never replaced.')
    parser.add_argument('--baseline', type=Path, help='Optional frozen pre-change capability_selection.py for historical comparison.')
    parser.add_argument('--modes', nargs='+', choices=('bm25', 'dense', 'hybrid'), default=['bm25', 'dense', 'hybrid'])
    parser.add_argument('--min-score', type=_min_score, default=.35,
                        help='Relative RRF threshold in [0,1] for current modes; not a relevance probability.')
    parser.add_argument('--top-k', type=_top_k, default=32,
                        help='Maximum ordinary candidates per query; explicit IDs and existing refs are exempt.')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('output already exists; choose a new artifact path')
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.services import capability_selection as api
    from app.services.node_capability_service import CATALOG

    dataset_bytes = args.dataset.read_bytes()
    dataset = json.loads(dataset_bytes)
    report = {'metric_version': 2, 'primary_metric': 'all_required_rate',
              'dataset_id': dataset['dataset_id'], 'dataset_sha256': hashlib.sha256(dataset_bytes).hexdigest(),
              'catalog_sha256': hashlib.sha256(json.dumps(CATALOG, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
              'scope': 'offline retrieval; no authoring, workflow execution, MCP discovery or user project writes',
              'intent_rewrite_evaluation': {'executed': False, 'query_source': 'dataset_original_queries',
                                            'real_authoring_llm_called': False},
              'candidate_budget_scope': 'historical_gold_max_candidates',
              'candidate_budget_interpretation': 'Frozen gold size target only; not a character/token budget or the current Top-K limit.',
              'requested_selection_policy': {'min_score': args.min_score, 'top_k': args.top_k,
                                             'applies_to_modes': args.modes},
              'modes': {}, 'model': None}
    implementations = []
    if args.baseline:
        spec = importlib.util.spec_from_file_location('frozen_capability_selection', args.baseline)
        old = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(old)
        implementations.append(('baseline', old, {}))
        report['baseline_sha256'] = hashlib.sha256(args.baseline.read_bytes()).hexdigest()
        report['baseline_path'] = str(args.baseline.absolute())
    provider = None
    try:
        if any(mode in ('dense', 'hybrid') for mode in args.modes):
            from app.services.capability_embeddings import get_embedding_provider
            started = time.perf_counter()
            provider = get_embedding_provider()
            # Factory failure must not silently turn an embedding benchmark into lexical-only results.
            if provider is None:
                raise RuntimeError('real embedding provider unavailable')
            provider.embed_query('模型加载检查')
            report['model'] = dict(provider.metadata, fingerprint=provider.fingerprint,
                                   cold_probe_ms=(time.perf_counter() - started) * 1000)
        for mode in args.modes:
            options = {'embedding_provider': provider if mode != 'bm25' else None,
                       'min_score': args.min_score, 'top_k': args.top_k}
            if mode == 'dense':
                options['lexical_enabled'] = False
            implementations.append((mode, api, options))
        snapshots = dataset['connection_snapshots']
        for mode, implementation, kwargs in implementations:
            rows, indexes = [], {}
            for case in dataset['cases']:
                snapshot_id = case['connection_snapshot']
                if snapshot_id not in indexes:
                    indexes[snapshot_id] = implementation.capability_index(CATALOG, snapshots[snapshot_id])
                started = time.perf_counter()
                result = implementation.search_capabilities(case['query'], indexes[snapshot_id], case.get('required_refs', []), **kwargs)
                rows.append(evaluate_case(case, result, (time.perf_counter() - started) * 1000))
            policies = [row['selection_policy'] for row in rows if row['selection_policy']]
            policy = {key: value for key, value in policies[0].items() if key != 'forced_ids'} if policies else None
            report['modes'][mode] = {'summary': aggregate(rows), 'selection_policy': policy,
                                     'splits': {split: aggregate([row for row in rows if row['split'] == split])
                                                for split in ('development', 'heldout')}, 'cases': rows}
            if mode == 'hybrid':
                report['per_tool_indexes'] = indexes
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Open exclusively so a concurrent run cannot overwrite this result either.
        with args.output.open('x', encoding='utf-8') as file:
            json.dump(report, file, ensure_ascii=False, indent=2, allow_nan=False)
            file.write('\n')
        print(json.dumps({mode: result['summary'] for mode, result in report['modes'].items()}, ensure_ascii=False))
        gate_mode = 'hybrid' if 'hybrid' in report['modes'] else args.modes[-1]
        if not report['modes'][gate_mode]['summary']['availability_gate']['sample_passed']:
            raise SystemExit(2)
    finally:
        if provider is not None and hasattr(provider, 'close'):
            provider.close()


if __name__ == '__main__':
    main()
