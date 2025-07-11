# 3D Hartwig Chess Set 

3D chess game done in HTML/CSS/JS.

Original design and code by [juliangarnier](https://github.com/juliangarnier) and improved by [LunarEclipseCode](https://github.com/LunarEclipseCode)

Originally released under MIT License. However, this version is provided under GPL due to Stockfish integration.

## Improvements

- Migrated from table-based layout to CSS Grid to resolve Firefox compatibility [issue](https://bugzilla.mozilla.org/show_bug.cgi?id=733849)

- Added support to play against bot via Stockfish

- Improved User Experience
    - Choose to play as either white or black pieces
    - Board rotation on each move can now be disabled
    - Added mid-game restart functionality
    - No more page reload needed to start a new game after ending one

- Bug Fixes
    - Fixed squares being highlighted even if the piece is off the board

## Libraries

* three.js : https://github.com/mrdoob/three.js
* chess.js : https://github.com/jhlywa/chess.js
* stockfish.js : https://github.com/nmrugg/stockfish.js