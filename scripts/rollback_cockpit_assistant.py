"""Detach the dev.10 assistant without reverting subsequent HMI layout changes."""
from pathlib import Path
import argparse, datetime, hashlib, json, re
parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];p=root/'studio/src/components/core/CockpitHmi.tsx';old=p.read_text()
pattern=r"^import \{ CockpitAssistant \} from './CockpitAssistant';\n"
new,n=re.subn(pattern,'',old,count=1,flags=re.M)
new,m=re.subn(r'^.*<CockpitAssistant\b[^>]*\/>\s*\n','',new,count=1,flags=re.M)
if (n,m)!=(1,1): raise SystemExit('未找到唯一的助手接入点；未修改文件。请先核对当前代码。')
if not args.apply: print('校验通过：可单独撤回顶部助手，保留当前 HMI 布局和数据。');raise SystemExit(0)
b=root/'.demo-runtime/versions'/('before-assistant-detach-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'));b.mkdir(parents=True)
(b/'CockpitHmi.tsx').write_bytes(p.read_bytes());(b/'manifest.json').write_text(json.dumps({'CockpitHmi.tsx':hashlib.sha256(p.read_bytes()).hexdigest()}))
p.write_text(new);print('已撤回助手接入。当前 HMI 备份：',b)
