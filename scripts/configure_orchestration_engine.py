"""Select a server-owned authoring engine; never accepts or stores model keys."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.services.hermes_authoring import EngineConfig,CONFIG_PATH,verify_runtime

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--engine',choices=['hermes','bounded'],required=True)
    parser.add_argument('--runtime-root');parser.add_argument('--python');parser.add_argument('--pythonpath')
    args=parser.parse_args()
    config=EngineConfig(engine=args.engine,runtime_root=args.runtime_root,python=args.python,pythonpath=args.pythonpath)
    if config.engine=='hermes':
        await verify_runtime(config)
        if config.pythonpath and (not Path(config.pythonpath).is_absolute() or not Path(config.pythonpath).is_dir()):
            raise ValueError('pythonpath must be an installed absolute dependency directory')
    CONFIG_PATH.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(prefix='orchestration-',suffix='.json',dir=CONFIG_PATH.parent)
    try:
        with os.fdopen(fd,'w') as out:json.dump(config.model_dump(exclude_none=True),out,indent=2)
        os.replace(temp,CONFIG_PATH)
    finally:
        if os.path.exists(temp):os.unlink(temp)
    print('Authoring engine configured:',config.engine)
    print('Configuration:',CONFIG_PATH)

if __name__=='__main__':asyncio.run(main())
