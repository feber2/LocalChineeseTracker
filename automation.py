"""
automation.py - Thin stdin/stdout IPC bridge for mouse/keyboard automation.
Electron spawns this, sends JSON commands line by line, reads JSON responses.
"""
import sys
import json
import time
import pyautogui
import pyperclip

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0  # We handle all delays on the JS side


def execute(cmd):
    action = cmd.get('action', '')

    if action == 'ping':
        return 'pong'

    elif action == 'click':
        pyautogui.moveTo(cmd['x'], cmd['y'])
        time.sleep(0.04)
        pyautogui.click()

    elif action == 'ctrl_click':
        pyautogui.moveTo(cmd['x'], cmd['y'])
        time.sleep(0.04)
        pyautogui.keyDown('ctrl')
        try:
            time.sleep(0.03)
            pyautogui.click()
            time.sleep(0.03)
        finally:
            pyautogui.keyUp('ctrl')

    elif action == 'type':
        pyautogui.write(cmd['text'], interval=cmd.get('interval', 0.02))

    elif action == 'hotkey':
        keys = cmd['keys']
        pressed = []
        try:
            for k in keys:
                pyautogui.keyDown(k)
                pressed.append(k)
            time.sleep(0.02)
        finally:
            for k in reversed(pressed):
                pyautogui.keyUp(k)

    elif action == 'press':
        pyautogui.press(cmd['key'])

    elif action == 'sleep':
        time.sleep(cmd['ms'] / 1000.0)

    elif action == 'clear_clipboard':
        pyperclip.copy('')

    elif action == 'get_clipboard':
        return pyperclip.paste()

    elif action == 'get_mouse_pos':
        x, y = pyautogui.position()
        return {'x': x, 'y': y}

    return None


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            result = execute(cmd)
            print(json.dumps({'status': 'ok', 'result': result}), flush=True)
        except Exception as e:
            # Acil Durum (Failsafe) Kurtarmasi:
            # Eger script cokerse veya kullanici fareyi koseye cekerse (FailsafeException),
            # modifier tuslari (Ctrl, Shift, Alt vb.) basili kalmasin diye zorla serbest birakiyoruz.
            for key in ['ctrl', 'shift', 'alt']:
                try:
                    pyautogui.keyUp(key)
                except:
                    pass
            print(json.dumps({'status': 'error', 'message': str(e)}), flush=True)


if __name__ == '__main__':
    main()
