"""Read renamed configuration without disabling existing installations."""
import os


def brand_env(name, default=None, env=None):
    values = os.environ if env is None else env
    if name in values:
        return values[name]
    legacy = name.replace('OAKEGDE_', 'CYBEREDGE_', 1)
    return values.get(legacy, default)
