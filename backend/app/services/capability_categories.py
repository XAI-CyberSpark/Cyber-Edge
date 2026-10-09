"""Presentation categories for capability discovery, not execution permissions."""
import re

CATEGORIES = ('车辆状态', '车控动作', '座舱交互', 'AI模型', '待分类')

def classify(name, method='', description='', domain='', group='', title=''):
    identifiers = f'{name} {title}'
    wording = f'{title or name} {description}'.strip()
    # A read remains a state query even if the provider is called HMI or media.
    reads = re.search(r'(?:^|[_/\s.])(?:get|read|query|is|has|require)(?=[A-Z_/\s.]|$)', identifiers)
    if method.upper() in {'GET', 'HEAD'} or reads or re.match(r'^(获取|读取|查询|检查是否)', wording) or description.startswith(('获取', '读取', '查询')):
        return '车辆状态'
    if any(word in f'{identifiers} {description}'.lower() for word in ('模型推理', '大模型', 'inference', 'llm')):
        return 'AI模型'
    interactive_groups = ('显示', '亮度', '连接与热点', '日期', '主题', '音量', '音效', '语言', '蓝牙', '导航', '媒体', '通知')
    if domain.lower() in {'cpeservice', 'media', 'navi', 'camera'} or any(word in group for word in interactive_groups):
        return '座舱交互'
    if any(word in f'{identifiers} {description}'.lower() for word in ('display', 'toast', 'popup', '播放', '弹窗', '屏幕', '导航', '音乐', '蓝牙')):
        return '座舱交互'
    writes = re.search(r'(?:^|[_/\s.])(?:set|adjust|reset|switch|action|control)(?=[A-Z_/\s.]|$)', identifiers)
    if method.upper() in {'POST', 'PUT', 'PATCH', 'DELETE'} or writes or re.match(r'^(设置|调节|控制|打开|关闭|执行|修改)', wording) or description.startswith(('设置', '调节', '控制', '打开', '关闭', '执行', '修改')):
        return '车控动作'
    return '待分类'
