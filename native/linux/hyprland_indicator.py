#!/usr/bin/env python3
"""A small bar that says the desktop is under computer control.

Hyprland gives every surface the same input path, so the agent cannot take the
pointer away from the user. The next best thing is telling the user: this bar
sits on a layer-shell surface above normal windows, ignores pointer and keyboard
input entirely, and disappears on its own once the helper stops poking the
heartbeat file. It is deliberately not a window: layer surfaces never show up in
`hyprctl clients`, so it cannot become a capture target by accident.
"""

import argparse
import os
import sys
import time

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

try:
    gi.require_version('GtkLayerShell', '0.1')
    from gi.repository import GtkLayerShell  # noqa: E402
    LAYER = True
except (ValueError, ImportError):
    LAYER = False

STYLE = b"""
window, .root { background: transparent; }
.box {
  background: rgba(24, 24, 27, 0.92);
  border: 1px solid rgba(255, 170, 0, 0.85);
  border-radius: 999px;
  padding: 7px 18px;
}
.dot { color: #ffaa00; font-size: 15px; font-weight: bold; }
.label { color: #f4f4f5; font-size: 13px; }
"""


class Bar(Gtk.Window):
    def __init__(self, text, idle, offset):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.idle = idle
        self.set_decorated(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_accept_focus(False)
        self.set_focus_on_map(False)
        self.set_app_paintable(True)
        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            self.set_visual(visual)

        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        box.get_style_context().add_class('box')
        dot = Gtk.Label(label='●')
        dot.get_style_context().add_class('dot')
        label = Gtk.Label(label=text)
        label.get_style_context().add_class('label')
        box.pack_start(dot, False, False, 0)
        box.pack_start(label, False, False, 0)
        self.add(box)

        provider = Gtk.CssProvider()
        provider.load_from_data(STYLE)
        Gtk.StyleContext.add_provider_for_screen(screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        if LAYER:
            GtkLayerShell.init_for_window(self)
            GtkLayerShell.set_layer(self, GtkLayerShell.Layer.OVERLAY)
            GtkLayerShell.set_anchor(self, GtkLayerShell.Edge.TOP, True)
            GtkLayerShell.set_margin(self, GtkLayerShell.Edge.TOP, offset)
            GtkLayerShell.set_keyboard_mode(self, GtkLayerShell.KeyboardMode.NONE)
            GtkLayerShell.set_exclusive_zone(self, -1)
        else:
            # Without layer-shell the bar is a normal floating window, which at
            # least stays visible even if it cannot be made click-through.
            self.set_type_hint(Gdk.WindowTypeHint.NOTIFICATION)
            self.set_keep_above(True)

        self.connect('realize', self.on_realize)
        self.show_all()

    def on_realize(self, _widget):
        """Let every click and scroll pass through to whatever is underneath."""
        window = self.get_window()
        if window is None:
            return
        try:
            import cairo
            window.input_shape_combine_region(cairo.Region())
        except Exception:
            pass


def heartbeat_fresh(path, idle):
    try:
        return (time.time() - os.path.getmtime(path)) < idle
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', default='OpenCU 正在操作这台桌面 · 请勿移动鼠标或键盘')
    parser.add_argument('--heartbeat', required=True)
    parser.add_argument('--idle', type=float, default=20.0)
    parser.add_argument('--offset', type=int, default=6)
    arguments = parser.parse_args()

    bar = Bar(arguments.text, arguments.idle, arguments.offset)

    def tick():
        if heartbeat_fresh(arguments.heartbeat, arguments.idle):
            return True
        Gtk.main_quit()
        return False

    # One second is slow enough to cost nothing and fast enough to feel instant.
    GLib.timeout_add(1000, tick)
    Gtk.main()
    return 0


if __name__ == '__main__':
    sys.exit(main())
