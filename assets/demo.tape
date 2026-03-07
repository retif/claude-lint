Output assets/demo.gif

Set Shell bash
Set FontSize 14
Set Width 1200
Set Height 700
Set Padding 20
Set Theme { "name": "Dracula", "black": "#282a36", "red": "#ff5555", "green": "#50fa7b", "yellow": "#f1fa8c", "blue": "#bd93f9", "magenta": "#ff79c6", "cyan": "#8be9fd", "white": "#f8f8f2", "brightBlack": "#6272a4", "brightRed": "#ff6e6e", "brightGreen": "#69ff94", "brightYellow": "#ffffa5", "brightBlue": "#d6acff", "brightMagenta": "#ff92df", "brightCyan": "#a4ffff", "brightWhite": "#ffffff", "background": "#282a36", "foreground": "#f8f8f2", "selection": "#44475a", "cursor": "#f8f8f2" }
Set TypingSpeed 40ms
Set CursorBlink false

# Show version
Type "claudecode-linter --version"
Enter
Sleep 1s

# List rules (show a slice)
Type "claudecode-linter --list-rules | head -20"
Enter
Sleep 3s

# Lint the demo plugin
Type "claudecode-linter tests/fixtures/demo-plugin/"
Enter
Sleep 4s

# Fix dry-run to show diffs
Type "claudecode-linter --fix-dry-run tests/fixtures/demo-plugin/ 2>&1 | head -25"
Enter
Sleep 4s

# JSON output
Type "claudecode-linter --output json tests/fixtures/demo-plugin/ 2>&1 | head -20"
Enter
Sleep 3s

Sleep 2s
