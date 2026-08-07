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
        pyautogui.keyUp('ctrl')
        pyautogui.keyUp('alt')
        pyautogui.keyUp('shift')
        return 'pong'

    elif action == 'click':
        pyautogui.keyUp('ctrl')
        pyautogui.keyUp('alt')
        pyautogui.keyUp('shift')
        pyautogui.moveTo(cmd['x'], cmd['y'])
        time.sleep(0.04)
        pyautogui.click()

    elif action == 'ctrl_click':
        pyautogui.keyUp('shift')
        pyautogui.moveTo(cmd['x'], cmd['y'])
        time.sleep(0.04)
        pyautogui.keyDown('ctrl')
        time.sleep(0.03)
        pyautogui.click()
        time.sleep(0.03)
        pyautogui.keyUp('ctrl')

    elif action == 'type':
        pyautogui.keyUp('ctrl')
        pyautogui.write(cmd['text'], interval=cmd.get('interval', 0.02))

    elif action == 'hotkey':
        # Custom clean hotkey without touching Alt
        keys = cmd['keys']
        for k in keys:
            pyautogui.keyDown(k)
        time.sleep(0.02)
        for k in reversed(keys):
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
            print(json.dumps({'status': 'error', 'message': str(e)}), flush=True)


if __name__ == '__main__':
    main()
