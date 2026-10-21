"""Exercise production AT-SPI routes with synthetic desktop/window objects."""
import ast
import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace
import threading
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


def rejected(call, code):
    try:
        call()
    except Failure as error:
        assert error.code == code, error.code
    else:
        raise AssertionError('Expected ' + code)


for name in ('helper.py', 'wayland.py'):
    window, other_window = Node(21), Node(21)
    target = dict(id='native:synthetic', pid=21, kind='app', bounds=dict(x=0, y=0, width=800, height=600))
    # Execute the real element/point/act functions without initializing X11,
    # D-Bus or a desktop-sharing session. Their OS boundaries are synthetic.
    parsed = ast.parse((root_dir / 'native/linux' / name).read_text())
    definitions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in ('element', 'point', 'act')]
    env = dict(elements={}, fail=fail, verify_window=accessibility.verify_window,
               accessibility_action=accessibility.perform, app_window=lambda _target: window,
               windows={target['id']: window}, pyatspi=SimpleNamespace(STATE_DEFUNCT=0, DESKTOP_COORDS=0),
               check=lambda *_args: None, foreground=lambda *_args: None, input_lock=threading.RLock(),
               state=dict(stream=dict(position=(0, 0), size=(800, 600)), devices=3), uuid=uuid, math=math)
    exec(compile(ast.Module(body=definitions, type_ignores=[]), name, 'exec'), env)
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
    print(name + ': embedded control, foreign ID, moved element, coordinate hit, background action, cycle/defunct checks passed')
