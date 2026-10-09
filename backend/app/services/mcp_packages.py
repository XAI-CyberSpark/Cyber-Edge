"""Reviewed install recipes. Catalog prose/config never becomes executable code."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import signal
import sys

ROOT = Path(__file__).resolve().parents[3] / '.demo-runtime' / 'mcp-packages'
RECIPES = {
    'catalog-fetch': {
        'catalog_id': '@modelcontextprotocol/fetch',
        'package': 'mcp-server-fetch', 'version': '2026.8.18', 'module': 'mcp_server_fetch',
        'usage_note': '无需凭证。可访问运行主机可达的网络，包括内网；默认遵守网站 robots.txt。',
        'tools': {'fetch': {'allow_trials': False, 'title': '抓取网页', 'parameters': [
            {'name': 'url', 'type': 'string', 'required': True, 'input_ref': 'input.text', 'description': '要读取的网页地址'},
            {'name': 'max_length', 'type': 'integer', 'default': 5000, 'description': '返回的最大字符数'},
            {'name': 'start_index', 'type': 'integer', 'default': 0, 'description': '从指定字符位置继续读取'},
            {'name': 'raw', 'type': 'boolean', 'default': False, 'description': '保留原始网页内容'},
        ]}},
    },
    'catalog-time': {
        'catalog_id': '@modelcontextprotocol/time',
        'package': 'mcp-server-time', 'version': '2026.8.18', 'module': 'mcp_server_time',
        'usage_note': '无需凭证。读取运行主机的时钟并进行时区换算；时间使用24小时制，时区使用IANA名称。',
        'tools': {
            'get_current_time': {'allow_trials': False, 'title': '查询当前时间', 'parameters': [
                {'name': 'timezone', 'type': 'string', 'required': True, 'description': 'IANA时区名称，例如 Asia/Shanghai 或 UTC'},
            ]},
            'convert_time': {'allow_trials': False, 'title': '时区换算', 'parameters': [
                {'name': 'source_timezone', 'type': 'string', 'required': True, 'description': '原始时区，例如 Asia/Shanghai'},
                {'name': 'time', 'type': 'string', 'required': True, 'description': '待换算时间，格式为 HH:MM，例如 09:30'},
                {'name': 'target_timezone', 'type': 'string', 'required': True, 'description': '目标时区，例如 Europe/London'},
            ]},
        },
    },
}


class PackageError(ValueError):
    pass


def python_at(folder):
    return folder / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')


def folder_for(recipe):
    return ROOT / f"{recipe['package']}-{recipe['version']}"


def installed(recipe):
    folder = folder_for(recipe)
    try:
        return python_at(folder).exists() and json.loads((folder / 'ready.json').read_text()) == {
            'package': recipe['package'], 'version': recipe['version']}
    except (OSError, ValueError):
        return False


def presentation(catalog_id):
    for server_id, recipe in RECIPES.items():
        if recipe['catalog_id'] == catalog_id:
            return {'server_id': server_id, 'package': recipe['package'], 'version': recipe['version'],
                    'status': 'installed' if installed(recipe) else 'on_first_run',
                    'usage_note': recipe['usage_note'],
                    'tools': [{'name': name, 'title': tool['title'], 'parameters': tool['parameters']}
                              for name, tool in recipe['tools'].items()]}
    return None


@asynccontextmanager
async def install_lock(folder):
    # OS lock is released after crashes; callers never reuse a half-installed environment.
    folder.parent.mkdir(parents=True, exist_ok=True)
    with folder.with_name(folder.name + '.lock').open('a+b') as handle:
        if sys.platform == 'win32':
            import msvcrt
            handle.write(b'0'); handle.flush()
            def acquire():
                handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            def release():
                handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            def acquire(): fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            def release(): fcntl.flock(handle, fcntl.LOCK_UN)
        while True:
            try:
                acquire(); break
            except (BlockingIOError, OSError):
                await asyncio.sleep(.1)
        try:
            yield
        finally:
            release()


async def stop_process(process):
    if process.returncode is not None:
        return
    try:
        if sys.platform == 'win32':
            killer = await asyncio.create_subprocess_exec('taskkill', '/PID', str(process.pid), '/T', '/F',
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await killer.wait()
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    await process.wait()


async def command(*args):
    process = await asyncio.create_subprocess_exec(*map(str, args),
        env={k: v for k, v in os.environ.items() if k in ('PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'LANG')},
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        start_new_session=sys.platform != 'win32')
    try:
        await process.wait()
        if process.returncode:
            raise PackageError('MCP安装失败，请检查运行主机的Python、网络和磁盘空间，再次Run可重试。')
    finally:
        await stop_process(process)


async def ensure_environment(recipe):
    folder = folder_for(recipe)
    if installed(recipe):
        return str(python_at(folder))
    try:
        async with asyncio.timeout(180):
            async with install_lock(folder):
                if not installed(recipe):
                    await command(sys.executable, '-m', 'venv', str(folder))
                    await command(python_at(folder), '-m', 'pip', '--isolated', 'install',
                        '--disable-pip-version-check', '--no-input', '--index-url', 'https://pypi.org/simple',
                        f"{recipe['package']}=={recipe['version']}")
                    await command(python_at(folder), '-c',
                        'from importlib.metadata import version; import sys; assert version(sys.argv[1]) == sys.argv[2]',
                        recipe['package'], recipe['version'])
                    (folder / 'ready.json').write_text(json.dumps({
                        'package': recipe['package'], 'version': recipe['version']}))
        return str(python_at(folder))
    except TimeoutError:
        raise PackageError('MCP安装超过180秒，未开始工具调用；再次Run可重试。') from None
    except OSError:
        raise PackageError('无法创建MCP独立环境，请检查运行主机的Python与目录写入权限。') from None


async def prepare(server_id):
    recipe = RECIPES[server_id]
    python = await ensure_environment(recipe)
    return {'command': python, 'args': ['-m', recipe['module']]}
