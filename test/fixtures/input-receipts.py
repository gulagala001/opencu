"""Execute production Linux reply and receipt logic without starting native hosts."""
import ast
import contextlib
import io
import json
from pathlib import Path
import sys
import threading
from types import SimpleNamespace

directory = Path(__file__).resolve().parents[2] / 'native/linux'
sys.path.insert(0, str(directory))
import input_receipt


class Failure(Exception):
    code = 'STALE_SCREENSHOT'


class ChordAlreadyHeld(Failure):
    pass


for name in ('helper.py', 'wayland.py', 'hyprland.py'):
    source = ast.parse((directory / name).read_text())
    reply = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'reply')
    for attempted in (False, True):
        release_calls, emitted = [], []
        def perform(*args):
            error = Failure('synthetic view changed')
            error.details = {'inputDispatched': False}  # An earlier receipt cannot hide later input.
            if attempted:
                input_receipt.dispatch(lambda: None)
            raise error
        def release():
            release_calls.append(True)
            input_receipt.dispatch(lambda: None)
            return {'released': True}
        env = dict(input_receipt=input_receipt, json=json, output_lock=threading.Lock(),
                   perform=perform, release=release, ChordAlreadyHeld=ChordAlreadyHeld, emit=emitted.append)
        exec(compile(ast.Module(body=[reply], type_ignores=[]), name, 'exec'), env)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            env['reply']({'id': 1, 'method': 'act', 'epoch': 0})
        result = emitted[0] if emitted else json.loads(output.getvalue())
        assert result['error']['details']['inputDispatched'] is attempted, (name, attempted, result)
        if attempted:
            assert release_calls and result['error']['details']['release']['released']

input_receipt.begin()
worker = threading.Thread(target=lambda: input_receipt.dispatch(lambda: None))
worker.start(); worker.join()
error = Failure('preflight')
assert input_receipt.failure(error, lambda: {'released': True})['inputDispatched'] is False
input_receipt.begin()
input_receipt.dispatch(lambda: None)
assert input_receipt.failure(error, lambda: {'released': False}) == {'inputDispatched': True, 'release': {'released': False}}
print('Linux pre-dispatch, partial input, release receipts and thread isolation passed')
