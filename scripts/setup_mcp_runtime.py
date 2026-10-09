"""Provision the isolated official MCP SDK. Run with the chosen host Python."""
import json,subprocess,sys
from pathlib import Path
if sys.version_info < (3,10):raise SystemExit('请使用Python3.10或以上，例如后端虚拟环境的Python。')
root=Path(__file__).resolve().parents[1]
folder=root/'.demo-runtime/mcp-venv'
if not folder.exists():subprocess.run([sys.executable,'-m','venv',str(folder)],check=True)
python=folder/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
subprocess.run([str(python),'-m','pip','install','-r',str(root/'backend/requirements-mcp-runtime.txt')],check=True)
config=root/'.demo-runtime/mcp-runtime.json'
if config.exists():
    print('SDK installed; existing runtime configuration retained:',config)
else:
    config.write_text(json.dumps({'python':str(python)},indent=2)+'\n')
    print('SDK installed; runtime configured:',config)
