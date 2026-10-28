"""Production Hyprland functions with synthetic compositor/input boundaries."""
import ast
import json
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest

source = Path(__file__).resolve().parents[2] / 'native/linux/hyprland.py'
sys.path.insert(0, str(source.parent))
target = dict(id='native:synthetic', pid=21, windowId='0x1', name='Synthetic',
              bounds=dict(x=0, y=0, width=100, height=100))
png = b'\x89PNG\r\n\x1a\n' + struct.pack('!I', 13) + b'IHDR' + struct.pack('!II', 100, 100)


def load():
    # Avoid startup's real compositor and stdin threads; execute unchanged
    # function bodies, including cancellation, journal and dispatch logic.
    parsed = ast.parse(source.read_text())
    definitions = [node for node in parsed.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))
                   and not (isinstance(node, ast.Import) and any(alias.name == 'fcntl' for alias in node.names))]
    env = {'__file__': str(source), '__name__': 'synthetic_hyprland'}
    exec(compile(ast.Module(body=definitions, type_ignores=[]), str(source), 'exec'), env)
    env.update(epoch=0, ended=False, closing=False, keys=set(), buttons=set(), elements={}, mappings={}, isolated={},
               input_lock=threading.RLock(), output_lock=threading.Lock(), process_lock=threading.RLock(), input_processes=set(),
               ydotool='synthetic', wtype='synthetic', grim='synthetic', shift=42, pyatspi=None,
               BUTTONS={'left': 0, 'right': 1, 'middle': 2})
    for name in ('report', 'notify', 'start_indicator', 'stop_indicator', 'persist', 'emit', 'settle_view'):
        env[name] = lambda *args, **kwargs: None
    env['resolve'] = lambda t: t
    env['active_address'] = lambda: target['windowId']
    env['accessibility'] = lambda *args: 'not-exposed'
    env['keys_ready'] = lambda: SimpleNamespace(character=lambda char: (30 if char.lower() == 'a' else 48, int(char.isupper())) if char.isascii() else None)
    env['keycode'] = lambda name: {'Return': 28, 'Tab': 15, 'Shift_L': 42}[name]
    return env


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.env = load()

    def refusal(self, call, code):
        with self.assertRaises(self.env['Failure']) as caught:
            call()
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_handback_and_shutdown_keep_release_receipt_when_compositor_fails(self):
        e = self.env
        def unavailable():
            raise e['Failure']('COMPOSITOR_UNAVAILABLE', 'Synthetic compositor disconnected')
        e['hand_back_view'] = unavailable
        e['restore_isolation'] = unavailable
        for method, args in [('away', {}), ('away', {'relinquish': True}), ('release', {}), ('close', {})]:
            failure = self.refusal(lambda: e['perform'](method, args, 0), 'COMPOSITOR_UNAVAILABLE')
            self.assertIs(failure.details['release']['released'], True)
            self.assertEqual(failure.details['release']['heldKeys'], [])
        self.assertFalse(e['closing'], 'failed desktop cleanup can be explicitly retried')

    def test_selection_and_monitoring_are_passive(self):
        e, effects = self.env, []
        for name in ('isolate', 'focus', 'start_indicator', 'report'):
            e[name] = lambda *args: effects.append('desktop side effect')
        e['clip'] = lambda b: dict(b, name='synthetic-monitor')
        e['execute'] = lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=png, stderr=b'')
        self.assertEqual(e['perform']('select', dict(reference=target), 0), target)
        for _ in range(3):
            self.assertEqual(e['perform']('preview', dict(target=target), 0)['kind'], 'native-frame')
        self.assertEqual(effects, [])
        e['active_address'] = lambda: 'other'
        self.refusal(lambda: e['capture'](target, True), 'BACKGROUND_CAPTURE_UNAVAILABLE')
        self.assertEqual(effects, [])

    def test_discard_frame_if_foreground_changes_during_capture(self):
        e = self.env
        e['clip'] = lambda b: dict(b, name='synthetic-monitor')
        def capture(*args, **kwargs):
            e['active_address'] = lambda: 'other'
            return SimpleNamespace(returncode=0, stdout=png, stderr=b'')
        e['execute'] = capture
        self.refusal(lambda: e['capture'](target, True), 'BACKGROUND_CAPTURE_UNAVAILABLE')
        self.assertFalse(e['mappings'])

    def test_background_and_inactive_refusals_do_not_take_the_desktop(self):
        e, effects = self.env, []
        for name in ('isolate', 'focus', 'start_indicator'):
            e[name] = lambda *args: effects.append('desktop side effect')
        for kind in ('click', 'scroll', 'key_down', 'type_text'):
            error = self.refusal(lambda: e['act'](target, dict(type=kind, inputMode='background'), 0), 'FOREGROUND_REQUIRED')
            self.assertIs(error.details['inputDispatched'], False)
        e['active_address'] = lambda: 'other'
        error = self.refusal(lambda: e['act'](target, dict(type='click', inputMode='foreground'), 0), 'TARGET_NOT_ACTIVE')
        self.assertIs(error.details['inputDispatched'], False)
        self.assertEqual(effects, [])

    def test_explicit_focus_owns_isolation_and_indicator(self):
        e, effects = self.env, []
        e['isolate'] = lambda t: effects.append('isolate') or True
        e['remember_view'] = lambda t: effects.append('remember')
        e['focus_window'] = lambda address: effects.append('focus')
        e['note_taken'] = lambda: effects.append('taken')
        e['start_indicator'] = lambda: effects.append('indicator')
        self.assertEqual(e['perform']('focus', dict(reference=target), 0), target)
        self.assertEqual(effects, ['isolate', 'remember', 'focus', 'taken', 'indicator'])

    def test_both_handbacks_release_before_moving_the_view(self):
        e = self.env
        for relinquish in (False, True):
            events = []
            e['keys'].add(29)
            e['buttons'].add(0)
            e['send'] = lambda *args: events.append(args)
            def hand_back():
                self.assertFalse(e['keys'] | e['buttons'])
                events.append('view')
                return True
            e['hand_back_view'] = hand_back
            e['restore_isolation'] = lambda: events.append('restore')
            e['stop_indicator'] = lambda: events.append('hide')
            self.assertTrue(e['away'](relinquish))
            self.assertEqual(events[:3], [('key', 29, False), ('button', 0, False), 'view'])
            self.assertEqual('hide' in events, relinquish)

    def test_failed_release_does_not_claim_successful_handback(self):
        e, effects = self.env, []
        e['keys'].add(29)
        e['send'] = lambda *args: e['fail']('INPUT_REJECTED', 'synthetic release failure')
        for name in ('hand_back_view', 'restore_isolation', 'stop_indicator'):
            e[name] = lambda: effects.append('handed back')
        error = self.refusal(lambda: e['away'](True), 'RELEASE_FAILED')
        self.assertFalse(error.details['release']['released'])
        self.assertEqual(e['keys'], {29})
        self.assertEqual(effects, [])

    def test_ascii_stops_and_releases_temporary_keys(self):
        e, sent = self.env, []
        def send(kind, code, down, expected=None):
            sent.append((kind, code, down))
            if down:
                e['epoch'] += 1
        e['send'] = send
        self.refusal(lambda: e['type_text'](target, 'a' * 100, 0), 'CONTROL_STOPPED')
        self.assertEqual(sent, [('key', 30, True), ('key', 30, False)])
        self.assertFalse(e['keys'])

    def test_focus_loss_after_dispatch_is_not_a_predispatch_refusal(self):
        e = self.env
        def send(kind, code, down, expected=None):
            if down:
                e['active_address'] = lambda: 'other'
        e['send'] = send
        error = self.refusal(lambda: e['type_text'](target, 'aa', 0), 'TARGET_NOT_ACTIVE')
        self.assertIsNone(error.details)
        self.assertFalse(e['keys'])

    def test_unicode_and_wheel_stop_between_events(self):
        e, sent = self.env, []
        def execute(argv, expected=None):
            sent.append(argv)
            e['epoch'] += 1
            return SimpleNamespace(returncode=0, stdout='', stderr='')
        e['execute_input'] = execute
        self.refusal(lambda: e['type_text'](target, '你好', 0), 'CONTROL_STOPPED')
        self.assertEqual(sent, [['wtype', '--', '你']])
        e['epoch'], sent = 0, []
        e['cursor_position'] = lambda: (50, 50)
        self.refusal(lambda: e['act'](target, dict(type='scroll', inputMode='foreground', deltaY=10000), 0), 'CONTROL_STOPPED')
        self.assertEqual(len(sent), 1)

    def test_typing_preserves_an_explicit_shift(self):
        e, sent = self.env, []
        e['keys'].add(42)
        e['send'] = lambda kind, code, down, expected=None: sent.append((code, down))
        e['type_text'](target, 'A', 0)
        self.assertEqual(sent, [(30, True), (30, False)])
        self.assertEqual(e['keys'], {42})

    def test_preflight_covers_later_pieces_before_dispatch(self):
        e, sent = self.env, []
        e['keys'].add(30)
        e['send'] = lambda *args: sent.append(args)
        self.refusal(lambda: e['type_text'](target, 'b\na', 0), 'INPUT_ALREADY_HELD')
        self.refusal(lambda: e['type_text'](target, 'b\n你', 0), 'UNSUPPORTED_ACTION')
        self.assertFalse(sent)

    def test_intent_is_journaled_before_unknown_dispatch(self):
        e, events = self.env, []
        e['persist'] = lambda: events.append(('journal', set(e['keys'])))
        def send(kind, code, down, expected=None):
            events.append(('send', down))
            if down:
                e['fail']('COMMAND_TIMEOUT', 'synthetic uncertain delivery')
        e['send'] = send
        self.refusal(lambda: e['input_event']('key', 30, True, 0), 'COMMAND_TIMEOUT')
        self.assertEqual(events[:2], [('journal', {30}), ('send', True)])
        self.assertTrue(e['release']()['released'])
        self.assertFalse(e['keys'])

    def test_refused_action_preserves_already_held_input(self):
        e, sent, responses = self.env, [], []
        e['keys'].add(42)
        e['send'] = lambda *args: sent.append(args)
        e['emit'] = responses.append
        e['reply'](dict(id=1, method='act', epoch=0, params=dict(target=target, action=dict(type='click', inputMode='background'))))
        self.assertEqual(responses[0]['error']['code'], 'FOREGROUND_REQUIRED')
        self.assertEqual(sent, [])
        self.assertEqual(e['keys'], {42})

    def test_status_contains_no_typed_content(self):
        e = self.env
        secret = 'synthetic-secret-123'
        status = e['describe']('type_text', target, dict(text=secret))
        with tempfile.TemporaryDirectory() as directory:
            # Use the production writer as well as its redacted description.
            real = load()
            parsed = ast.parse(source.read_text())
            report = next(node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == 'report')
            exec(compile(ast.Module(body=[report], type_ignores=[]), str(source), 'exec'), real)
            real.update(directory=directory, status_lock=threading.Lock(), indicator_status={})
            real['report'](status)
            self.assertNotIn(secret, (Path(directory) / 'indicator.status').read_text())
            self.assertIn(str(len(secret)), status)

    def test_cancellation_terminates_a_running_sender(self):
        e, errors = self.env, []
        with tempfile.TemporaryDirectory() as directory:
            ready, late = Path(directory) / 'ready', Path(directory) / 'late'
            program = 'import pathlib,time;pathlib.Path(%r).touch();time.sleep(3);pathlib.Path(%r).touch()' % (str(ready), str(late))
            def run():
                try:
                    e['execute_input']([sys.executable, '-c', program], 0)
                except e['Failure'] as error:
                    errors.append(error.code)
            thread = threading.Thread(target=run)
            thread.start()
            try:
                deadline = time.monotonic() + 2
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(ready.exists())
                e['epoch'] += 1
                e['cancel_input_processes']()
                thread.join(2)
                self.assertFalse(thread.is_alive())
                self.assertEqual(errors, ['CONTROL_STOPPED'])
                self.assertFalse(late.exists())
                self.assertFalse(e['input_processes'])
            finally:
                e['cancel_input_processes']()
                thread.join(5)


if __name__ == '__main__':
    unittest.main()
