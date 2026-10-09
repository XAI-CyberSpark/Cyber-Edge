"""Natural back edges into declared repeatable waits; shared semantic contract."""
def repeated_wait_back_edges(nodes, edges):
    ids={n['id'] for n in nodes if n.get('type')!='stage'}
    starts={n['id'] for n in nodes if n.get('type') in ('input','systemInput')}
    dom={id:({id} if id in starts else set(ids)) for id in ids}
    changed=True
    while changed:
        changed=False
        for id in ids-starts:
            parents=[dom[e['source']] for e in edges if e['target']==id and e['source'] in ids]
            value=(set.intersection(*parents) if parents else set())|{id}
            if value!=dom[id]:dom[id]=value;changed=True
    gates={n['id'] for n in nodes if n.get('type')=='wait' and (n.get('data') or {}).get('repeat') is True}
    return {i for i,e in enumerate(edges) if e['target'] in gates and e['target'] in dom.get(e['source'],set())}
