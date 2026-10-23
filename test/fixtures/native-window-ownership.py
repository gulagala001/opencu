"""Exercise production AT-SPI routes with synthetic desktop/window objects."""
import ast
import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace
import threading
import time
import uuid

root_dir = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('accessibility_input', root_dir / 'native/linux/accessibility_input.py')
accessibility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(accessibility)


class Failure(Exception):
    def __init__(self, code):
        self.code = code


def fail(code, _message):
    raise Failure(code)


class Node:
    def __init__(self, pid, parent=None):
        self.pid, self.parent, self.hit, self.defunct = pid, parent, None, False
        self.name = 'Synthetic control'
        self.children, self.visited_children = [], 0

    def __iter__(self):
        for child in self.children:
            self.visited_children += 1
            yield child

    def getApplication(self):
        return self

    def get_process_id(self):
        return self.pid

    def getState(self):
        return self

    def contains(self, _state):
        return self.defunct

    def queryComponent(self):
        return self

    def getExtents(self, _coordinates):
        return SimpleNamespace(x=10, y=10, width=20, height=20)

    def getAccessibleAtPoint(self, *_args):
        return self.hit

    def getRoleName(self):
        return 'button'

    def getRole(self):
        return 1

    def queryText(self):
        raise NotImplementedError

    def queryAction(self):
        raise NotImplementedError


class MovingNode(Node):
    """Belongs to the window at validation, then changes during the action."""
    def __init__(self, window, after=None):
        super().__init__(99)
        self.window, self.after, self.parent_reads = window, after or self, 0

    @property
    def parent(self):
        self.parent_reads += 1
        return self.window if self.parent_reads == 1 else self.after

    @parent.setter
    def parent(self, _value):
        pass


def rejected(call, code):
    try:
        call()
    except Failure as error:
        assert error.code == code, error.code
    else:
        raise AssertionError('Expected ' + code)


for name in ('helper.py', 'wayland.py', 'hyprland.py'):
    window, other_window = Node(21), Node(21)
    target = dict(id='native:synthetic', pid=21, kind='app', name='Synthetic', bounds=dict(x=0, y=0, width=800, height=600))
    # Execute the real element/point/act/tree functions without initializing X11,
    # D-Bus or a desktop-sharing session. Their OS boundaries are synthetic.
    parsed = ast.parse((root_dir / 'native/linux' / name).read_text())
    definitions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in ('element', 'point', 'act', 'tree')]
    env = dict(elements={}, fail=fail, verify_window=accessibility.verify_window,
               accessibility_action=accessibility.perform, app_window=lambda _target: window,
               windows={target['id']: window}, pyatspi=SimpleNamespace(STATE_DEFUNCT=0, DESKTOP_COORDS=0, ROLE_PASSWORD_TEXT=2),
               check=lambda *_args: None, foreground=lambda *_args: None, input_lock=threading.RLock(),
               resolve=lambda target: target, report=lambda *_args: None, describe=lambda *_args: '', accessibility=lambda *_args: 'application',
               active_address=lambda: 'synthetic-window',
               state=dict(stream=dict(position=(0, 0), size=(800, 600)), devices=3), uuid=uuid, math=math, time=time)
    exec(compile(ast.Module(body=definitions, type_ignores=[]), name, 'exec'), env)
    target['windowId'] = 'synthetic-window'
    element, point, act = (env[key] for key in ('element', 'point', 'act'))
    child = Node(99, window)
    key = target['id'] + ':observed'
    env['elements'][key] = child
    assert element(target, key) is child, 'An embedded renderer in the selected window must remain usable'
    assert point(target, dict(elementId=key)) == (20, 20)
    window.hit = child
    assert act(target, dict(type='hit_test', inputMode='foreground', elementId=key), 0)['element']['name'] == child.name
    rejected(lambda: element(target, 'native:other:observed'), 'STALE_ELEMENT')
    child.pid, child.parent = 21, other_window
    rejected(lambda: element(target, key), 'TARGET_IDENTITY_CHANGED')
    rejected(lambda: point(target, dict(elementId=key)), 'TARGET_IDENTITY_CHANGED')
    # Coordinate hit tests must reject a returned foreign element even when it
    # has the same PID as the selected top-level window.
    env['point'] = lambda *_args: (20, 20)
    rejected(lambda: act(target, dict(type='hit_test', inputMode='foreground'), 0), 'TARGET_IDENTITY_CHANGED')
    rejected(lambda: act(target, dict(type='click', inputMode='background', elementId=key), 0), 'TARGET_IDENTITY_CHANGED')
    child.parent = child
    rejected(lambda: element(target, key), 'TARGET_IDENTITY_CHANGED')
    if name == 'wayland.py':
        child.parent, child.defunct = window, True
        rejected(lambda: element(target, key), 'STALE_ELEMENT')

    tree = env['tree']
    window.children = [Node(99, window) for _ in range(100)]
    observed = tree(target, dict(maxNodes=2))
    assert len(observed['nodes']) == 2 and observed['truncated']
    assert window.visited_children <= 2, 'Node cap must stop child enumeration'
    assert key not in env['elements'], 'A new observation must invalidate old IDs'
    window.visited_children = 0
    observed = tree(target, dict(maxDepth=0))
    assert len(observed['nodes']) == 1 and observed['truncated']
    assert window.visited_children == 1, 'Depth cap must stop child enumeration'
    window.children = window.children[:1]
    assert not tree(target, dict(maxNodes=2))['truncated'], 'A complete tree at the node limit is not truncated'
    moments = iter([0, 0, 6])
    env['time'] = SimpleNamespace(monotonic=lambda: next(moments, 6))
    observed = tree(target, dict(timeoutMs=5000))
    assert len(observed['nodes']) == 1 and observed['truncated'], 'Deadline must stop enumeration'
    env['time'] = time

    rejected(lambda: accessibility.perform(window, MovingNode(window),
             dict(type='scroll', deltaY=100), lambda: None, fail), 'TARGET_IDENTITY_CHANGED')
    calls = []
    scrolling = Node(21, other_window)
    scrolling.queryAction = lambda: SimpleNamespace(nActions=1, getName=lambda _index: 'scroll down', doAction=lambda _index: calls.append(True) or True)
    rejected(lambda: accessibility.perform(window, MovingNode(window, scrolling),
             dict(type='scroll', deltaY=100), lambda: None, fail), 'TARGET_IDENTITY_CHANGED')
    assert not calls, 'A scroll ancestor moved outside the window must not receive input'
    scrolling.parent = window
    assert accessibility.perform(window, scrolling, dict(type='scroll', deltaY=100), lambda: None, fail)['performed']
    assert calls == [True], 'A scroll action in the selected window must work'
    print(name + ': ownership, bounded tree enumeration/deadline and scroll ancestry checks passed')
