/*
 * 3D Artwig chess set
 * @JulianGarnier
 *
 * Licensed under the MIT license.
 * Copyright 2012 Julian Garnier
 */

var chess = new Chess();
var currentColor = chess.turn();
var timeOut = null;
var photon = document.getElementsByClassName("photon-shader");
var sphere = document.getElementsByClassName("sphere");
var piece = document.getElementsByClassName("piece");
var square = document.getElementsByClassName("square");
var app = document.getElementById("app");
var scene = document.getElementById("scene");
var sceneX = 70;
var sceneY = 90;
var controls = false;
var animated = false;
var mouseDown = false;
var closestElement = null;
var white = "White";
var black = "Black";
var board = {};
var autoRotate = true;
var gameStarted = false;
var playerSide = "w";
var botEnabled = false;
var stockfish = null;
var waitingForBotMove = false;
var pendingPlayerSideChange = null;
var pendingBotChange = null;

// Touch/mouse event detection
var isTouch = (function () {
  var d = document.createElement("div");
  d.setAttribute("ontouchmove", "return;");
  return typeof d.ontouchmove === "function";
})();

var press = isTouch ? "touchstart" : "mousedown";
var drag = isTouch ? "touchmove" : "mousemove";
var drop = isTouch ? "touchend" : "mouseup";

// Utility functions
function getAllSquares() {
  var squares = [];
  for (var file of "abcdefgh") {
    for (var rank of "12345678") {
      squares.push(file + rank);
    }
  }
  return squares;
}

function clearBoard() {
  // Clear all pieces from board squares
  getAllSquares().forEach(function (squareId) {
    var square = document.getElementById(squareId);
    if (square) square.innerHTML = "";
  });

  // Clear jails
  document.getElementById("w-jail").innerHTML = "";
  document.getElementById("b-jail").innerHTML = "";
}

function placeStartingPieces() {
  getAllSquares().forEach(function (tile) {
    var chessSquare = chess.get(tile);
    if (chessSquare) {
      createPiece(chessSquare.color, chessSquare.type, tile);
    }
    board[tile] = chessSquare;
  });
}

function resetGameState() {
  chess.reset();
  gameStarted = false;
  waitingForBotMove = false;
  currentColor = chess.turn();
  board = {};
  document.getElementById("undo").dataset.state = "inactive";
}

function resetGame() {
  resetGameState();
  clearBoard();
  placeStartingPieces();
  updateMenuButtons();
}

function isGameInProgress() {
  return gameStarted && chess.history().length > 0 && !chess.isGameOver();
}

// Bot functionality
function initStockfish() {
  stockfish = new STOCKFISH();
  stockfish.onmessage = function (line) {
    if (line.startsWith("bestmove")) {
      var move = line.split(" ")[1];
      if (move && move !== "(none)") {
        makeBotMove(move);
      }
      waitingForBotMove = false;
    }
  };
  stockfish.postMessage("uci");
  stockfish.postMessage("isready");
}

function toggleBot(event) {
  if (isGameInProgress()) {
    pendingBotChange = event.checked;
    // Revert the checkbox since we're not allowing the change yet
    event.checked = !event.checked;
    showSideSwitchDialog("Cannot change bot setting during match");
    return;
  }

  // Game hasn't started yet, allow the change
  botEnabled = event.checked;
  if (botEnabled && !stockfish) {
    initStockfish();
  }
}

function togglePlayerSide(event) {
  if (botEnabled && isGameInProgress()) {
    pendingPlayerSideChange = event.checked;
    event.checked = !event.checked;
    showSideSwitchDialog("Cannot switch sides during match");
    return;
  }
  playerSide = event.checked ? "b" : "w";
}

function isBotTurn() {
  if (!botEnabled) return false;
  return (playerSide === "w" && currentColor === "b") || (playerSide === "b" && currentColor === "w");
}

function makeBotMove(move) {
  var from = move.substring(0, 2);
  var to = move.substring(2, 4);
  var promotion = move.length > 4 ? move.substring(4) : "q";

  var fromSquare = document.getElementById(from);
  var toSquare = document.getElementById(to);
  var pieceElement = fromSquare.querySelector(".piece");

  if (!pieceElement || !toSquare) {
    chess.move({ from: from, to: to, promotion: promotion });
    updateBoard();
    return;
  }

  // Handle captures
  var capturedPiece = chess.get(to);
  if (capturedPiece) {
    var jailId = capturedPiece.color === "w" ? "w-jail" : "b-jail";
    createPiece(capturedPiece.color, capturedPiece.type, jailId);
  }

  // Calculate movement offset
  var fromRect = fromSquare.getBoundingClientRect();
  var toRect = toSquare.getBoundingClientRect();
  var offsetX = toRect.left - fromRect.left;
  var offsetY = toRect.top - fromRect.top;

  var shouldInvert = autoRotate ? currentColor === "b" : playerSide === "b";
  if (shouldInvert) {
    offsetX = -offsetX;
    offsetY = -offsetY;
  }

  // Animate move
  pieceElement.style.transition = "transform 0.5s ease-in-out";
  pieceElement.style.transform = `translateX(${offsetX}px) translateY(${offsetY}px) translateZ(2px)`;

  // After animation completes, update the board
  setTimeout(function () {
    // Remove transition and reset transform
    pieceElement.style.transition = "";
    pieceElement.style.transform = "translateX(0px) translateY(0px) translateZ(2px)";

    // Make the actual chess move
    chess.move({ from: from, to: to, promotion: promotion });
    waitingForBotMove = false;
    updateBoard();
  }, 500);
}

function requestBotMove() {
  if (botEnabled && stockfish && !waitingForBotMove) {
    waitingForBotMove = true;
    disableGameButtons();
    stockfish.postMessage("position fen " + chess.fen());
    stockfish.postMessage("go depth 10");
  }
}

// Game controls
function initControls() {
  for (var i = 0; i < piece.length; i++) {
    piece[i].addEventListener(press, grabPiece, false);
  }
  app.addEventListener(drag, dragPiece, false);
  app.addEventListener(drop, dropPiece, false);
  app.addEventListener(drag, moveScene, false);
  app.onselectstart = function (event) {
    event.preventDefault();
  };
  app.ontouchmove = function (event) {
    event.preventDefault();
  };
}

function grabPiece(event) {
  if (!mouseDown && controls) {
    // Check bot turn restriction
    if (botEnabled && (isBotTurn() || waitingForBotMove)) return;

    // Check piece color restriction
    if (botEnabled) {
      var pieceColor = this.classList.contains("white") ? "w" : "b";
      if (pieceColor !== playerSide) return;
    }

    event.preventDefault();
    mouseDown = true;
    grabbed = this;
    grabbedID = grabbed.id.substr(-2);
    startX = event.pageX - document.body.offsetWidth / 2;
    startY = event.pageY - document.body.offsetHeight / 2;

    var style = window.getComputedStyle(grabbed);
    var matrix = style.getPropertyValue("transform");
    var matrixParts = matrix.split(",");
    grabbedW = parseInt(style.getPropertyValue("width")) / 2;
    grabbedX = parseInt(matrixParts[4]);
    grabbedY = parseInt(matrixParts[5]);

    grabbed.classList.add("grabbed");
    showMoves(grabbedID);
    highLight(grabbed, square);
  }
}

function dragPiece(event) {
  if (mouseDown && controls && !waitingForBotMove) {
    event.preventDefault();
    var moveX = event.pageX - document.body.offsetWidth / 2;
    var moveY = event.pageY - document.body.offsetHeight / 2;
    var distX = moveX - startX;
    var distY = moveY - startY;

    // Only invert movement for black pieces if auto-rotation is enabled
    // When auto-rotate is off, invert if player chose black side
    var shouldInvert = autoRotate ? currentColor === "b" : playerSide === "b";
    var newX = shouldInvert ? -(grabbedX + distX) : grabbedX + distX;
    var newY = shouldInvert ? -(grabbedY + distY) : grabbedY + distY;

    grabbed.style.transform = "translateX(" + newX + "px) translateY(" + newY + "px) translateZ(2px)";
    highLight(grabbed, square);
  }
}

function dropPiece(event) {
  if (mouseDown && controls && !waitingForBotMove) {
    event.preventDefault();

    if (closestElement && closestElement.classList.contains("valid")) {
      var squareEndPos = closestElement.id;

      if (closestElement.classList.contains("captured")) {
        var capturedPiece = chess.get(squareEndPos);
        var jailId = capturedPiece.color === "w" ? "w-jail" : "b-jail";
        createPiece(capturedPiece.color, capturedPiece.type, jailId);
      }

      hideMoves(grabbedID);
      chess.move({ from: grabbedID, to: squareEndPos, promotion: "q" });
    } else {
      hideMoves(grabbedID);
      grabbed.style.transform = "translateX(0px) translateY(0px) translateZ(2px)";
    }

    updateBoard();
    grabbed.classList.remove("grabbed");
    mouseDown = false;
  }
}

function moveScene(event) {
  if (animated) {
    eventStartX = event.pageX - document.body.offsetWidth / 2;
    eventStartY = event.pageY - document.body.offsetHeight / 2;
  }
  eventStartX = 0;
  eventStartY = 0;

  if (!controls && !animated) {
    document.body.classList.remove("animated");
    event.preventDefault();
    var eventMoveX = event.pageX - document.body.offsetWidth / 2;
    var eventDistX = eventMoveX - eventStartX;
    var eventMoveY = event.pageY - document.body.offsetHeight / 2;
    var eventDistY = eventMoveY - eventStartY;
    var eventX = sceneY - eventDistX * -0.03;
    var eventY = sceneX - eventDistY * -0.03;

    scene.style.transform = "RotateX(" + eventY + "deg) RotateZ(" + eventX + "deg)";
    for (var i = 0; i < sphere.length; i++) {
      updateSphere(sphere[i], eventY, eventX);
    }
  }
}

function showMoves(target) {
  var validMoves = chess.moves({ square: target, verbose: true });
  for (var i = 0; i < validMoves.length; i++) {
    var validMove = validMoves[i];
    document.getElementById(validMove.from).classList.add("current");
    document.getElementById(validMove.to).classList.add("valid");
    if (validMove.captured) {
      document.getElementById(validMove.to).classList.add("captured");
    }
  }
}

function hideMoves(target) {
  var validMoves = chess.moves({ square: target, verbose: true });
  for (var i = 0; i < validMoves.length; i++) {
    var validMove = validMoves[i];
    var from = validMove.from;
    var to = validMove.to;
    document.getElementById(validMove.from).classList.remove("current");
    document.getElementById(validMove.to).classList.remove("valid");
    document.getElementById(validMove.to).classList.remove("captured");
  }
}

function createPiece(color, piece, position) {
  var clone = document.getElementById(piece).cloneNode(true);
  clone.addEventListener(press, grabPiece, false);
  clone.setAttribute("id", color + piece + position);
  clone.classList.add(color === "w" ? "white" : "black");
  document.getElementById(position).appendChild(clone);
}

function updateBoard() {
  var updateTiles = {};
  var gameStatus = {
    inCheck: chess.inCheck(),
    inCheckmate: chess.isCheckmate(),
    inDraw: chess.isDraw(),
    inStalemate: chess.isStalemate(),
    inThreefold: chess.isThreefoldRepetition(),
  };

  // Calculate board changes
  getAllSquares().forEach(function (tile) {
    var boardSquare = board[tile];
    var chessSquare = chess.get(tile);
    if (boardSquare && chessSquare) {
      if (boardSquare.type !== chessSquare.type || boardSquare.color !== chessSquare.color) {
        updateTiles[tile] = chessSquare;
      }
    } else if (boardSquare || chessSquare) {
      updateTiles[tile] = chessSquare;
    }
    board[tile] = chessSquare;
  });

  // Apply board changes
  for (var id in updateTiles) {
    var titleID = document.getElementById(id);
    if (updateTiles[id] === null || updateTiles[id] === undefined) {
      titleID.innerHTML = "";
    } else {
      var color = updateTiles[id].color;
      var piece = updateTiles[id].type;
      if (currentColor === color && !titleID.hasChildNodes()) {
        createPiece(color, piece, id);
      } else {
        titleID.innerHTML = "";
        createPiece(color, piece, id);
      }
    }
  }

  currentColor = chess.turn();
  if (!gameStarted) gameStarted = true;

  // Handle game status and rotation
  var botMoveDelay = (autoRotate && gameStarted) || (!autoRotate && chess.history().length === 0) ? 2500 : 500;

  function updateLog(message) {
    document.getElementById("log").innerHTML = message;
  }

  // Update undo button state
  var isStartingPosition = chess.fen() === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  document.getElementById("undo").dataset.state = isStartingPosition || chess.isGameOver() ? "inactive" : "active";

  // Handle game state messages
  if (currentColor === "w") {
    if (autoRotate && !chess.isGameOver()) updateView(0, 0);
    updateLog(gameStatus.inCheck ? white + "'s king is in check !" : white + "'s turn");
    if (gameStatus.inCheckmate) {
      updateLog("Checkmate! " + black + " wins!");
      showGameEndDialog("Checkmate! " + black + " wins!");
    }
  } else {
    if (autoRotate && !chess.isGameOver()) updateView(0, 180);
    updateLog(gameStatus.inCheck ? black + "'s king is in check !" : black + "'s turn");
    if (gameStatus.inCheckmate) {
      updateLog("Checkmate! " + white + " wins!");
      showGameEndDialog("Checkmate! " + white + " wins!");
    }
  }

  // Handle other game endings
  if (gameStatus.inDraw) {
    updateLog("Game drawn!");
    showGameEndDialog("Game drawn!");
  } else if (gameStatus.inStalemate) {
    updateLog("Stalemate!");
    showGameEndDialog("Stalemate!");
  } else if (gameStatus.inThreefold) {
    updateLog("Draw by threefold repetition!");
    showGameEndDialog("Draw by threefold repetition!");
  }

  // Handle bot moves
  if (botEnabled && gameStarted && !waitingForBotMove && !chess.isGameOver() && isBotTurn()) {
    setTimeout(requestBotMove, botMoveDelay);
  }

  updateButtonStates();
}

function updateCaptured() {
  document.getElementById("w-jail").innerHTML = "";
  document.getElementById("b-jail").innerHTML = "";

  var startingPieces = {
    w: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
    b: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
  };

  var currentPieces = {
    w: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 },
    b: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 },
  };

  // Count current pieces on board
  getAllSquares().forEach(function (square) {
    var piece = chess.get(square);
    if (piece) {
      currentPieces[piece.color][piece.type]++;
    }
  });

  // Add captured pieces to jails
  ["w", "b"].forEach(function (color) {
    Object.keys(startingPieces[color]).forEach(function (pieceType) {
      var captured = startingPieces[color][pieceType] - currentPieces[color][pieceType];
      var jailId = color === "w" ? "w-jail" : "b-jail";
      for (var i = 0; i < captured; i++) {
        createPiece(color, pieceType, jailId);
      }
    });
  });
}

function undoMove() {
  if (document.getElementById("undo").classList.contains("disabled")) return;

  if (botEnabled) {
    // Undo two moves when playing against bot
    if (chess.history().length > 0) chess.undo();
    if (chess.history().length > 0) chess.undo();
  } else {
    chess.undo();
  }
  updateBoard();
  updateCaptured();
}

function highLight(element, squares) {
  function getWinPos(obj) {
    var box = obj.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  var elementPos = getWinPos(element);
  var smallestDistance = null;
  var newClosestElement = null;

  // Find closest valid square
  for (var i = 0; i < squares.length; i++) {
    if (squares[i].classList.contains("valid")) {
      var squarePos = getWinPos(squares[i]);
      var distX = elementPos.x - squarePos.x;
      var distY = elementPos.y - squarePos.y;
      var distance = Math.sqrt(distX * distX + distY * distY);

      if (smallestDistance === null || distance < smallestDistance) {
        smallestDistance = distance;
        newClosestElement = squares[i];
      }
    }
  }

  // Remove all highlights
  for (var i = 0; i < squares.length; i++) {
    squares[i].classList.remove("highlight");
  }

  // Add highlight if within range
  if (newClosestElement && smallestDistance < 65) {
    newClosestElement.classList.add("highlight");
    closestElement = newClosestElement;
  } else {
    closestElement = null;
  }
}

function updateView(sceneXAngle, sceneZAngle) {
  scene.style.transform = "rotateX( " + sceneXAngle + "deg) rotateZ( " + sceneZAngle + "deg)";
  for (var i = 0; i < sphere.length; i++) {
    updateSphere(sphere[i], sceneXAngle, sceneZAngle);
  }
}

function updateSphere(sphere, sceneXAngle, sceneZAngle) {
  sphere.style.transform = "rotateZ( " + -sceneZAngle + "deg ) rotateX( " + -sceneXAngle + "deg )";
}

class ThreeJsLighting {
  constructor(x, y, z) {
    this.lightPosition = new THREE.Vector3(x, y, z);
    this.lightVector = this.lightPosition.clone().normalize();
  }

  calcFaceLighting(faceElement, maxShade, maxTint, isBackfaced) {
    const transform = window.getComputedStyle(faceElement).transform;
    const rotations = this.getRotationsFromTransform(transform);
    const faceVector = this.getRotationVector(rotations);

    const angleRadians = this.lightVector.angleTo(faceVector);
    const angleDegrees = angleRadians * (180 / Math.PI);

    let normalizedAngle = isBackfaced ? angleDegrees / 180 : angleDegrees / 90;

    if (isBackfaced && normalizedAngle > 0.5) {
      normalizedAngle = 1 - normalizedAngle;
    }

    const totalRange = Math.abs(maxShade + maxTint);
    const lightIntensity = totalRange * normalizedAngle;

    return lightIntensity <= maxTint ? "transparent" : `rgba(0, 0, 0, ${Math.abs(lightIntensity - maxTint)})`;
  }

  getRotationsFromTransform(transform) {
    const defaultMatrix = "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)";
    const matrixString = transform === "none" ? defaultMatrix : transform;

    const values = matrixString.match(/matrix3d\(([^)]+)\)/);
    if (!values) return { x: 0, y: 0, z: 0 };

    const m = values[1].split(",").map((n) => parseFloat(n.trim()));

    const matrix = new THREE.Matrix4().set(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, quaternion, scale);

    const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");

    return { x: euler.x, y: euler.y, z: euler.z };
  }

  getRotationVector(rotations) {
    let vector = new THREE.Vector3(0, 0, 1);

    const matrixX = new THREE.Matrix4().makeRotationX(rotations.x);
    const matrixY = new THREE.Matrix4().makeRotationY(rotations.y);
    const matrixZ = new THREE.Matrix4().makeRotationZ(rotations.z);

    vector.applyMatrix4(matrixX);
    vector.applyMatrix4(matrixY);
    vector.applyMatrix4(matrixZ);

    return vector.normalize();
  }

  calcSphereGradient(sphereElement) {
    const pieceElement = sphereElement.closest(".piece");
    const transform = window.getComputedStyle(pieceElement).transform;
    const rotations = this.getRotationsFromTransform(transform);

    let lightDir = this.lightVector.clone();
    const matrixX = new THREE.Matrix4().makeRotationX(-rotations.x);
    const matrixY = new THREE.Matrix4().makeRotationY(-rotations.y);
    const matrixZ = new THREE.Matrix4().makeRotationZ(-rotations.z);

    lightDir.applyMatrix4(matrixZ);
    lightDir.applyMatrix4(matrixY);
    lightDir.applyMatrix4(matrixX);

    const highlightX = (lightDir.x * 0.35 + 0.5) * 100;
    const highlightY = (-lightDir.y * 0.35 + 0.5) * 100;
    const intensity = Math.max(0, lightDir.z);
    const shadowOpacity = 0.5 - intensity * 0.2;

    return `radial-gradient(ellipse 55% 55% at ${highlightX}% ${highlightY}%, 
      rgba(255, 255, 255, ${intensity * 0.15}) 0%, 
      transparent 25%, 
      rgba(0, 0, 0, ${shadowOpacity * 0.35}) 50%, 
      rgba(0, 0, 0, ${shadowOpacity * 0.65}) 80%, 
      rgba(0, 0, 0, ${Math.min(0.55, shadowOpacity)}) 100%)`;
  }
}

function renderPoly() {
  const lighting = new ThreeJsLighting(50, 150, 250);

  // Apply lighting to faces
  document.querySelectorAll("#container .face").forEach((face) => {
    let shader = face.querySelector(".threejs-shader");
    if (!shader) {
      shader = document.createElement("div");
      shader.className = "threejs-shader";
      shader.style.width = shader.style.height = "100%";
      face.insertBefore(shader, face.firstChild);
    }
    shader.style.background = lighting.calcFaceLighting(face, 1.7, 0.425, true);
  });

  // Apply lighting to spheres
  document.querySelectorAll("#container .sphere").forEach((sphere) => {
    let shader = sphere.querySelector(".threejs-shader");
    if (!shader) {
      shader = document.createElement("div");
      shader.className = "threejs-shader";
      shader.style.width = shader.style.height = "100%";
      shader.style.borderRadius = "50%";
      shader.style.pointerEvents = "none";
      sphere.insertBefore(shader, sphere.firstChild);
    }
    shader.style.background = lighting.calcSphereGradient(sphere);
  });
}

function resetPoly() {
  if (timeOut != null) clearTimeout(timeOut);
  timeOut = setTimeout(() => requestAnimationFrame(renderPoly), 16);
}

// UI Functions
function Continue() {
  if (chess.isGameOver()) resetGame();

  renderPoly();
  gameStarted = false;
  updateBoard();

  // Orient board based on settings
  if (!autoRotate) {
    updateView(0, playerSide === "w" ? 0 : 180);
  }

  controls = true;
  animated = true;
  document.getElementById("app").dataset.state = "game";
  document.body.classList.add("animated");
}

function optionScreen() {
  if (document.getElementById("open-menu").classList.contains("disabled")) return;

  updateView(sceneX, sceneY);
  updateMenuButtons();
  controls = false;
  document.getElementById("app").dataset.state = "menu";
  setTimeout(() => (animated = false), 2500);
}

function toggleFrame(event) {
  document.getElementById("app").dataset.frame = event.checked ? "on" : "off";
  resetPoly();
}

function toggleRotation(event) {
  autoRotate = event.checked;
}

function setState(event) {
  event.preventDefault();
  document.getElementById("app").dataset.menu = this.dataset.menu;
}

function setTheme(event) {
  event.preventDefault();
  var theme = this.dataset.theme;
  document.getElementById("app").dataset.theme = theme;

  if (theme === "flat") {
    white = "Blue";
    black = "Red";
  } else if (theme === "wireframe") {
    white = "Blue";
    black = "Yellow";
  } else {
    white = "White";
    black = "Black";
  }
  updatePlayerSideLabel();
}

function updatePlayerSideLabel() {
  var label = document.querySelector('label[for="player-side-switch"]');
  var theme = document.getElementById("app").dataset.theme;

  var labelText = {
    wireframe: "Play as Yellow",
    flat: "Play as Red",
    default: "Play as Black",
  };

  label.textContent = labelText[theme] || labelText.default;
}

function updateMenuButtons() {
  var continueButton = document.getElementById("continue");
  var restartButton = document.getElementById("restart");

  if (chess.isGameOver()) {
    continueButton.textContent = "New Game";
    restartButton.style.display = "none";
  } else if (gameStarted && chess.history().length > 0) {
    continueButton.textContent = "Continue";
    restartButton.style.display = "inline-block";
  } else {
    continueButton.textContent = "Play";
    restartButton.style.display = "none";
  }
}

function updateButtonStates() {
  var undoButton = document.getElementById("undo");
  var menuButton = document.getElementById("open-menu");
  var shouldDisable = botEnabled && (isBotTurn() || waitingForBotMove);

  undoButton.classList.toggle("disabled", shouldDisable);
  menuButton.classList.toggle("disabled", shouldDisable);
}

function disableGameButtons() {
  document.getElementById("undo").classList.add("disabled");
  document.getElementById("open-menu").classList.add("disabled");
}

function enableGameButtons() {
  document.getElementById("undo").classList.remove("disabled");
  document.getElementById("open-menu").classList.remove("disabled");
}

function restartMatch() {
  resetGame();
  renderPoly();
  Continue();
}

function UI() {
  var menuBtns = document.getElementsByClassName("menu-nav");
  var themeBtns = document.getElementsByClassName("set-theme");

  for (var i = 0; i < menuBtns.length; i++) {
    menuBtns[i].addEventListener(press, setState, false);
  }
  for (var i = 0; i < themeBtns.length; i++) {
    themeBtns[i].addEventListener(press, setTheme, false);
  }

  document.getElementById("continue").addEventListener(press, Continue, false);
  document.getElementById("restart").addEventListener(press, restartMatch, false);
  document.getElementById("open-menu").addEventListener(press, optionScreen, false);
  document.getElementById("undo").addEventListener(press, undoMove, false);
}

function showSideSwitchDialog(title) {
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("side-switch-dialog").style.display = "flex";
}

function closeSideSwitchDialog() {
  document.getElementById("side-switch-dialog").style.display = "none";
  pendingPlayerSideChange = null;
  pendingBotChange = null;
}

function startNewGame() {
  var playerSideCheckbox = document.getElementById("player-side-switch");
  var botCheckbox = document.getElementById("bot-switch");

  if (!playerSideCheckbox || !botCheckbox) {
    console.error("Could not find checkbox elements");
    return;
  }

  // Apply pending changes
  if (pendingPlayerSideChange !== null) {
    playerSideCheckbox.checked = pendingPlayerSideChange;
    playerSide = pendingPlayerSideChange ? "b" : "w";
    pendingPlayerSideChange = null;
  } else {
    playerSide = playerSideCheckbox.checked ? "b" : "w";
  }

  if (pendingBotChange !== null) {
    botCheckbox.checked = pendingBotChange;
    botEnabled = pendingBotChange;
    pendingBotChange = null;
  } else {
    botEnabled = botCheckbox.checked;
  }

  closeSideSwitchDialog();

  if (botEnabled && !stockfish) {
    initStockfish();
  }

  updatePlayerSideLabel();
  resetGame();
  document.getElementById("log").innerHTML = "White's turn";
}

// Dialog functions
function showGameEndDialog(resultMessage) {
  document.getElementById("game-result-title").textContent = "Game Over";
  document.getElementById("game-result-message").textContent = resultMessage;
  document.getElementById("game-end-dialog").style.display = "flex";
}

function backToHome() {
  document.getElementById("game-end-dialog").style.display = "none";
  optionScreen();
}

function startNewGameFromDialog() {
  document.getElementById("game-end-dialog").style.display = "none";
  resetGame();
  Continue();
}

// Scene movement on dialogs
function enableSceneMovementOnDialog(dialogElement) {
  [press, drag, drop].forEach((eventType) => {
    dialogElement.addEventListener(eventType, function (event) {
      if (!event.target.closest(".dialog-box")) {
        moveScene(event);
      }
    });
  });
}

function init() {
  app.classList.remove("loading");
  document.body.classList.add("animated");
  animated = true;
  updateBoard();
  updatePlayerSideLabel();
  optionScreen();
  initControls();
  UI();
  setTimeout(() => (document.getElementById("logo").innerHTML = ""), 2000);
}

// Event listeners
window.addEventListener("resize", resetPoly, false);

document.addEventListener("DOMContentLoaded", function () {
  ["side-switch-dialog", "game-end-dialog"].forEach((id) => {
    var dialog = document.getElementById(id);
    if (dialog) enableSceneMovementOnDialog(dialog);
  });
});

// Initialize when ready
var readyStateCheckInterval = setInterval(function () {
  if (document.readyState === "complete") {
    renderPoly();
    init();
    clearInterval(readyStateCheckInterval);
  }
}, 3250);
